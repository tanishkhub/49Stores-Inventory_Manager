const express = require('express');
const Store = require('../models/Store');
const User = require('../models/User');
const InventoryItem = require('../models/InventoryItem');
const Sale = require('../models/Sale');
const ApiError = require('../utils/ApiError');
const { paginate, escapeRegex } = require('../utils/paginate');
const { authenticate, requirePermission } = require('../middleware/auth');
const { invalidateStoreCache } = require('../services/sales');

const router = express.Router();
router.use(authenticate);

const TEXT_FIELDS = { location: 200, city: 80, phone: 30 };

function readStoreBody(body = {}, { partial = false } = {}) {
  const out = {};
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== 'string' || !body.name.trim()) throw ApiError.badRequest('Store name is required');
    out.name = body.name.trim();
  }
  if (body.code !== undefined || !partial) {
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{2,20}$/.test(code)) throw ApiError.badRequest('Store code must be 2-20 letters, digits or dashes');
    out.code = code;
  }
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    if (body[field] === undefined) continue;
    const value = String(body[field] ?? '').trim();
    if (value.length > max) throw ApiError.badRequest(`${field} must be at most ${max} characters`);
    out[field] = value;
  }
  if (body.isActive !== undefined) out.isActive = Boolean(body.isActive);
  if (body.allowReturns !== undefined) out.allowReturns = Boolean(body.allowReturns);
  if (body.allowExchanges !== undefined) out.allowExchanges = Boolean(body.allowExchanges);
  if (body.returnWindowDays !== undefined) {
    const days = Number(body.returnWindowDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) throw ApiError.badRequest('Return window must be 0-365 days');
    out.returnWindowDays = days;
  }
  return out;
}

// `GET /api/stores` returns { items: [{ _id, name, ... }] } as expected by the Users page store picker.
router.get('/', requirePermission('stores', 'view'), async (req, res) => {
  const filter = {};
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { location: rx }, { city: rx }];
  }
  if (req.query.active === 'true') filter.isActive = true;
  res.json(await paginate(Store, filter, req.query, { sort: { name: 1, _id: 1 } }));
});

router.get('/:id', requirePermission('stores', 'view'), async (req, res) => {
  const store = await Store.findById(req.params.id).lean();
  if (!store) throw ApiError.notFound('Store not found');
  res.json(store);
});

router.post('/', requirePermission('stores', 'add'), async (req, res) => {
  res.status(201).json(await Store.create(readStoreBody(req.body)));
});

router.put('/:id', requirePermission('stores', 'update'), async (req, res) => {
  const store = await Store.findByIdAndUpdate(req.params.id, readStoreBody(req.body, { partial: true }), { new: true, runValidators: true });
  if (!store) throw ApiError.notFound('Store not found');
  invalidateStoreCache(req.params.id);
  res.json(store);
});

router.delete('/:id', requirePermission('stores', 'delete'), async (req, res) => {
  const store = await Store.findById(req.params.id);
  if (!store) throw ApiError.notFound('Store not found');
  if (await Sale.exists({ storeId: store._id })) {
    throw ApiError.conflict('This store has sales history. Deactivate it instead of deleting it.');
  }
  await Promise.all([
    InventoryItem.deleteMany({ storeId: store._id }),
    User.updateMany({ storeIds: store._id }, { $pull: { storeIds: store._id } }),
    store.deleteOne(),
  ]);
  invalidateStoreCache(req.params.id);
  res.status(204).end();
});

module.exports = router;
