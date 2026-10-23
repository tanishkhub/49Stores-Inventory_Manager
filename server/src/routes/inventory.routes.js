const express = require('express');
const mongoose = require('mongoose');
const InventoryItem = require('../models/InventoryItem');
const Product = require('../models/Product');
const Store = require('../models/Store');
const ApiError = require('../utils/ApiError');
const { paginate, escapeRegex } = require('../utils/paginate');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const POPULATE = [
  { path: 'productId', select: 'name sku barcode barcodeType price category thumbnailBase64 isActive' },
  { path: 'storeId', select: 'name code isActive' },
];

function readCount(value, label) {
  const n = Number(value);
  if (value === '' || value === null || !Number.isInteger(n) || n < 0) throw ApiError.badRequest(`${label} must be a whole number of 0 or more`);
  return n;
}

// Store options for the inventory store selector (no Stores-page permission needed).
router.get('/stores', requirePermission('inventory', 'view'), async (req, res) => {
  res.json({ items: await Store.find().sort({ isActive: -1, name: 1 }).select('name code city isActive').lean() });
});

// Inventory is not scoped to a user's assigned stores: anyone with inventory permissions
// (e.g. the Inventory Manager) can view and edit stock for any store location.
router.get('/', requirePermission('inventory', 'view'), async (req, res) => {
  const filter = {};
  if (req.query.storeId) {
    if (!mongoose.isValidObjectId(req.query.storeId)) throw ApiError.badRequest('Invalid storeId');
    filter.storeId = req.query.storeId;
  }
  if (req.query.productId) {
    if (!mongoose.isValidObjectId(req.query.productId)) throw ApiError.badRequest('Invalid productId');
    filter.productId = req.query.productId;
  }
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    const ids = await Product.find({ $or: [{ name: rx }, { sku: rx }, { barcode: rx }] }).limit(1000).distinct('_id');
    filter.productId = filter.productId ? { $in: ids.filter((id) => String(id) === String(filter.productId)) } : { $in: ids };
  }
  if (req.query.lowStock === 'true') filter.$expr = { $lte: ['$quantity', '$reorderLevel'] };
  res.json(await paginate(InventoryItem, filter, req.query, { sort: { updatedAt: -1, _id: -1 }, populate: POPULATE }));
});

router.post('/', requirePermission('inventory', 'add'), async (req, res) => {
  const { productId, storeId } = req.body || {};
  if (!mongoose.isValidObjectId(productId) || !(await Product.exists({ _id: productId }))) throw ApiError.badRequest('Product not found');
  if (!mongoose.isValidObjectId(storeId) || !(await Store.exists({ _id: storeId }))) throw ApiError.badRequest('Store not found');
  if (await InventoryItem.exists({ productId, storeId })) {
    throw ApiError.conflict('This product is already stocked in this store; edit or adjust the existing row');
  }
  const item = await InventoryItem.create({
    productId,
    storeId,
    quantity: readCount(req.body.quantity ?? 0, 'Quantity'),
    reorderLevel: readCount(req.body.reorderLevel ?? 0, 'Reorder level'),
  });
  res.status(201).json(await item.populate(POPULATE));
});

router.put('/:id', requirePermission('inventory', 'update'), async (req, res) => {
  const update = {};
  if (req.body?.quantity !== undefined) update.quantity = readCount(req.body.quantity, 'Quantity');
  if (req.body?.reorderLevel !== undefined) update.reorderLevel = readCount(req.body.reorderLevel, 'Reorder level');
  const item = await InventoryItem.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).populate(POPULATE).lean();
  if (!item) throw ApiError.notFound('Inventory row not found');
  res.json(item);
});

// Atomic relative stock change (receive stock / write off) that never goes below zero.
router.post('/:id/adjust', requirePermission('inventory', 'update'), async (req, res) => {
  const delta = Number(req.body?.delta);
  if (!Number.isInteger(delta) || delta === 0) throw ApiError.badRequest('delta must be a non-zero whole number');
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.badRequest('Invalid id');
  const filter = { _id: req.params.id };
  if (delta < 0) filter.quantity = { $gte: -delta };
  const item = await InventoryItem.findOneAndUpdate(filter, { $inc: { quantity: delta } }, { new: true }).populate(POPULATE).lean();
  if (item) return res.json(item);
  if (!(await InventoryItem.exists({ _id: req.params.id }))) throw ApiError.notFound('Inventory row not found');
  throw ApiError.badRequest('Stock cannot go below zero');
});

router.delete('/:id', requirePermission('inventory', 'delete'), async (req, res) => {
  const item = await InventoryItem.findByIdAndDelete(req.params.id);
  if (!item) throw ApiError.notFound('Inventory row not found');
  res.status(204).end();
});

module.exports = router;
