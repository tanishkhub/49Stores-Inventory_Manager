const express = require('express');
const Product = require('../models/Product');
const InventoryItem = require('../models/InventoryItem');
const Sale = require('../models/Sale');
const ApiError = require('../utils/ApiError');
const { paginate, escapeRegex } = require('../utils/paginate');
const { authenticate, requirePermission } = require('../middleware/auth');
const { normalizeBarcode, generateUniqueBarcode, DEFAULT_TYPE } = require('../services/barcode');

const router = express.Router();
router.use(authenticate);

// The API body limit is 1 MB, so the client resizes images before Base64-encoding them.
const MAX_IMAGE_CHARS = 900_000;
const MAX_THUMB_CHARS = 80_000;
const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

function readImage(value, max, label) {
  if (value === '' || value === null) return '';
  if (typeof value !== 'string' || !DATA_URL.test(value)) throw ApiError.badRequest(`${label} must be a PNG, JPEG, WebP or GIF Base64 data URL`);
  if (value.length > max) throw ApiError.badRequest(`${label} is too large; use a smaller image`);
  return value;
}

function readProductBody(body = {}, { partial = false } = {}) {
  const out = {};
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== 'string' || !body.name.trim()) throw ApiError.badRequest('Product name is required');
    out.name = body.name.trim();
  }
  if (body.sku !== undefined || !partial) {
    const sku = String(body.sku ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9._-]{1,40}$/.test(sku)) throw ApiError.badRequest('SKU must be 1-40 letters, digits, dots, dashes or underscores');
    out.sku = sku;
  }
  if (body.price !== undefined || !partial) {
    const price = Number(body.price);
    if (body.price === '' || !Number.isFinite(price) || price < 0) throw ApiError.badRequest('Price must be a number of 0 or more');
    out.price = Math.round(price * 100) / 100;
  }
  if (body.description !== undefined) out.description = String(body.description ?? '').trim();
  if (body.category !== undefined) out.category = String(body.category ?? '').trim();
  if (body.isActive !== undefined) out.isActive = Boolean(body.isActive);
  if (body.imageBase64 !== undefined) out.imageBase64 = readImage(body.imageBase64, MAX_IMAGE_CHARS, 'Image');
  if (body.thumbnailBase64 !== undefined) out.thumbnailBase64 = readImage(body.thumbnailBase64, MAX_THUMB_CHARS, 'Thumbnail');
  if (out.imageBase64 === '' && body.thumbnailBase64 === undefined) out.thumbnailBase64 = '';
  return out;
}

async function assertBarcodeFree(barcode, exceptId) {
  const filter = { barcode };
  if (exceptId) filter._id = { $ne: exceptId };
  const clash = await Product.findOne(filter).select('name sku').lean();
  if (clash) throw ApiError.conflict(`Barcode ${barcode} is already mapped to ${clash.name} (${clash.sku})`);
}

// barcodeMode 'auto' (default when no barcode is given) generates a unique value; 'manual' uses `barcode`.
async function resolveBarcode(body, existing) {
  const type = body.barcodeType ?? existing?.barcodeType ?? DEFAULT_TYPE;
  const wantsAuto = body.barcodeMode === 'auto' ? !existing || body.regenerateBarcode : !existing && !body.barcode;
  if (wantsAuto) return normalizeBarcode(await generateUniqueBarcode(), type);
  if (body.barcode !== undefined || body.barcodeType !== undefined) {
    const result = normalizeBarcode(body.barcode ?? existing?.barcode, type);
    await assertBarcodeFree(result.value, existing?._id);
    return result;
  }
  return null;
}

router.get('/', requirePermission('products', 'view'), async (req, res) => {
  const filter = {};
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { category: rx }];
  }
  if (req.query.category) filter.category = req.query.category;
  if (req.query.active === 'true') filter.isActive = true;
  res.json(await paginate(Product, filter, req.query, { sort: { name: 1, _id: 1 } }));
});

router.get('/categories', requirePermission('products', 'view'), async (req, res) => {
  const categories = (await Product.distinct('category')).filter(Boolean).sort((a, b) => a.localeCompare(b));
  res.json({ items: categories });
});

router.get('/:id', requirePermission('products', 'view'), async (req, res) => {
  const product = await Product.findById(req.params.id).select('+imageBase64').lean();
  if (!product) throw ApiError.notFound('Product not found');
  res.json(product);
});

router.post('/', requirePermission('products', 'add'), async (req, res) => {
  const data = readProductBody(req.body);
  const { value, type } = await resolveBarcode(req.body);
  const product = await Product.create({ ...data, barcode: value, barcodeType: type });
  const out = product.toObject();
  delete out.imageBase64;
  res.status(201).json(out);
});

router.put('/:id', requirePermission('products', 'update'), async (req, res) => {
  const existing = await Product.findById(req.params.id).lean();
  if (!existing) throw ApiError.notFound('Product not found');
  const data = readProductBody(req.body, { partial: true });
  const barcode = await resolveBarcode(req.body, existing);
  if (barcode) Object.assign(data, { barcode: barcode.value, barcodeType: barcode.type });
  const product = await Product.findByIdAndUpdate(existing._id, data, { new: true, runValidators: true }).lean();
  res.json(product);
});

router.delete('/:id', requirePermission('products', 'delete'), async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  if (await Sale.exists({ 'items.productId': product._id })) {
    throw ApiError.conflict('This product has sales history. Mark it inactive instead of deleting it.');
  }
  await Promise.all([InventoryItem.deleteMany({ productId: product._id }), product.deleteOne()]);
  res.status(204).end();
});

module.exports = router;
