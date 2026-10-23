const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Store = require('../models/Store');
const InventoryItem = require('../models/InventoryItem');
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/paginate');
const { authenticate, requirePermission } = require('../middleware/auth');
const MembershipPlan = require('../models/MembershipPlan');
const { checkout, quote, storeFilterFor, assertCanSellFrom } = require('../services/sales');
const { membershipStatus } = require('../services/memberships');
const { findSaleForReturn, processReturn } = require('../services/returns');
const { normalizePhone } = require('../services/customers');

const router = express.Router();
router.use(authenticate);

const PRODUCT_FIELDS = 'name sku barcode barcodeType price category thumbnailBase64';

async function withStock(products, storeId) {
  const stock = await InventoryItem.find({ storeId, productId: { $in: products.map((p) => p._id) } }).lean();
  const qty = new Map(stock.map((s) => [String(s.productId), s.quantity]));
  return products.map((p) => ({ ...p, stock: qty.get(String(p._id)) ?? 0 }));
}

// Stores the current user can sell from (Super Admin: all active; others: their assigned stores).
router.get('/stores', requirePermission('pos', 'view'), async (req, res) => {
  res.json({ items: await Store.find(storeFilterFor(req.user)).sort({ name: 1 }).select('name code location city phone allowReturns allowExchanges returnWindowDays').lean() });
});

// Resolves a scanned / typed value: exact barcode, SKU or product ID first, then a name/partial search.
router.get('/lookup', requirePermission('pos', 'view'), async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) throw ApiError.badRequest('Enter a barcode, SKU, product ID or name');
  const store = await assertCanSellFrom(req.user, req.query.storeId);
  const or = [{ barcode: q }, { sku: q.toUpperCase() }];
  if (mongoose.isValidObjectId(q)) or.push({ _id: q });
  const exact = await Product.findOne({ isActive: true, $or: or }).select(PRODUCT_FIELDS).lean();
  if (exact) {
    const [match] = await withStock([exact], store._id);
    return res.json({ match, items: [match] });
  }
  const rx = new RegExp(escapeRegex(q), 'i');
  const found = await Product.find({ isActive: true, $or: [{ name: rx }, { sku: rx }, { barcode: rx }] })
    .sort({ name: 1 })
    .limit(20)
    .select(PRODUCT_FIELDS)
    .lean();
  const items = await withStock(found, store._id);
  return res.json({ match: items.length === 1 ? items[0] : null, items });
});

// Lets the cashier see whether a phone number belongs to a returning customer before checkout.
router.get('/customer', requirePermission('pos', 'view'), async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone) return res.json({ customer: null });
  const customer = await Customer.findOne({ phone }).select('name phone visitCount totalSpent lastPurchaseAt memberships').lean();
  if (!customer) return res.json({ customer: null });
  const { memberships, ...rest } = customer;
  res.json({ customer: { ...rest, membership: membershipStatus({ memberships }) } });
});

router.post('/sales', requirePermission('pos', 'add'), async (req, res) => {
  res.status(201).json(await checkout(req.user, req.body));
});

router.get('/sales/:id', requirePermission('pos', 'view'), async (req, res) => {
  const sale = await Sale.findById(req.params.id).lean();
  if (!sale) throw ApiError.notFound('Sale not found');
  if (!req.user.isSuperAdmin && !req.user.storeIds.includes(String(sale.storeId))) throw ApiError.forbidden('This sale belongs to another store');
  const store = await Store.findById(sale.storeId).select('name code location city phone').lean();
  res.json({ ...sale, store });
});

router.get('/memberships', requirePermission('pos', 'view'), async (req, res) => {
  res.json({ items: await MembershipPlan.find({ isActive: true }).sort({ name: 1 }).lean() });
});

router.post('/quote', requirePermission('pos', 'view'), async (req, res) => {
  res.json(await quote(req.user, req.body));
});

const DAY = 24 * 3600 * 1000;

// "Quick add" suggestions: products sold most often and most recently at this store (exponential
// decay, 14-day scale), boosted by the identified customer's own purchase history; in-stock only.
router.get('/suggestions', requirePermission('pos', 'view'), async (req, res) => {
  const store = await assertCanSellFrom(req.user, req.query.storeId);
  const now = Date.now();
  const scorePipeline = (match, scaleDays) => [
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        score: { $sum: { $multiply: [{ $exp: { $divide: [{ $subtract: ['$createdAt', new Date(now)] }, scaleDays * DAY] } }, { $sqrt: '$items.quantity' }] } },
        orders: { $sum: 1 },
        lastSoldAt: { $max: '$createdAt' },
      },
    },
    { $sort: { score: -1 } },
    { $limit: 40 },
  ];
  const storeRows = await Sale.aggregate(scorePipeline({ storeId: store._id, createdAt: { $gte: new Date(now - 90 * DAY) } }, 14));
  const phone = normalizePhone(req.query.phone);
  const customer = phone ? await Customer.findOne({ phone }).select('_id').lean() : null;
  const custRows = customer ? await Sale.aggregate(scorePipeline({ customerId: customer._id }, 60)) : [];
  const merged = new Map();
  for (const r of storeRows) merged.set(String(r._id), { score: r.score, orders: r.orders, lastSoldAt: r.lastSoldAt, reason: r.lastSoldAt > new Date(now - 3 * DAY) && r.orders >= 2 ? 'Trending' : 'Popular' });
  for (const r of custRows) {
    const prev = merged.get(String(r._id));
    merged.set(String(r._id), { ...(prev || { orders: 0, lastSoldAt: r.lastSoldAt }), score: (prev?.score || 0) + r.score * 3, reason: 'Their usual' });
  }
  const ids = [...merged.keys()];
  const products = await Product.find({ _id: { $in: ids }, isActive: true }).select(PRODUCT_FIELDS).lean();
  const stocked = (await withStock(products, store._id)).filter((p) => p.stock > 0);
  const limit = Math.min(Number(req.query.limit) || 8, 20);
  const items = stocked
    .map((p) => ({ ...p, ...merged.get(String(p._id)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...p }) => ({ ...p, score: Math.round(score * 100) / 100 }));
  res.json({ items });
});

// Returns / exchanges against a bill (only where the admin enabled them for the store).
router.get('/returns/lookup', requirePermission('pos', 'view'), async (req, res) => {
  res.json(await findSaleForReturn(req.user, req.query.receiptNo));
});

router.post('/returns', requirePermission('pos', 'add'), async (req, res) => {
  res.status(201).json(await processReturn(req.user, req.body));
});

module.exports = router;
