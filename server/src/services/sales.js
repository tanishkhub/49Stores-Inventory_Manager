const mongoose = require('mongoose');
const Product = require('../models/Product');
const Store = require('../models/Store');
const InventoryItem = require('../models/InventoryItem');
const Sale = require('../models/Sale');
const { nextSequence } = require('../models/Counter');
const ApiError = require('../utils/ApiError');
const Customer = require('../models/Customer');
const { findOrCreateByPhone, recordPurchase, normalizePhone, assertValidPhone, addMembership } = require('./customers');
const { activeMemberships, membershipStatus, membershipTerm, bestDiscount, readMembershipPurchase } = require('./memberships');

const MAX_LINES = 200;
const round2 = (n) => Math.round(n * 100) / 100;

// Cache store lookups — stores change rarely and are read on every POS action.
const STORE_CACHE_TTL = 60_000;
const storeCache = new Map(); // storeId -> { store, expiresAt }

function invalidateStoreCache(storeId) {
  if (storeId) storeCache.delete(String(storeId));
  else storeCache.clear();
}

// Super Admin may sell from any active store; everyone else only from their assigned stores.
function storeFilterFor(user) {
  const filter = { isActive: true };
  if (!user.isSuperAdmin) filter._id = { $in: user.storeIds };
  return filter;
}

async function assertCanSellFrom(user, storeId) {
  if (!mongoose.isValidObjectId(storeId)) throw ApiError.badRequest('A valid storeId is required');
  const cacheKey = `${storeId}:${user.isSuperAdmin ? 'admin' : user.storeIds.join(',')}`;
  const cached = storeCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.store;
  const store = await Store.findOne({ $and: [storeFilterFor(user), { _id: storeId }] }).lean();
  if (store) {
    storeCache.set(cacheKey, { store, expiresAt: Date.now() + STORE_CACHE_TTL });
    return store;
  }
  if (!user.isSuperAdmin && !user.storeIds.includes(String(storeId))) throw ApiError.forbidden('You are not assigned to this store');
  throw ApiError.badRequest('Store not found or inactive');
}

function readLines(items, { allowEmpty = false } = {}) {
  if (!Array.isArray(items) || !items.length) {
    if (allowEmpty) return [];
    throw ApiError.badRequest('The cart is empty');
  }
  if (items.length > MAX_LINES) throw ApiError.badRequest(`At most ${MAX_LINES} lines per sale`);
  const merged = new Map();
  for (const it of items) {
    if (!it || !mongoose.isValidObjectId(it.productId)) throw ApiError.badRequest('Each item needs a valid productId');
    const qty = Number(it.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) throw ApiError.badRequest('Quantity must be a whole number of at least 1');
    const key = String(it.productId);
    merged.set(key, (merged.get(key) || 0) + qty);
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

async function restock(storeId, decremented) {
  await Promise.all(decremented.map((l) => InventoryItem.updateOne({ productId: l.productId, storeId }, { $inc: { quantity: l.quantity } })));
}

async function loadProducts(lines) {
  if (!lines.length) return new Map();
  const products = await Product.find({ _id: { $in: lines.map((l) => l.productId) }, isActive: true }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const missing = lines.filter((l) => !byId.has(l.productId));
  if (missing.length) throw ApiError.badRequest('Some products no longer exist or are inactive', { productIds: missing.map((l) => l.productId) });
  return byId;
}

function buildLines(lines, byId) {
  return lines.map((l) => {
    const p = byId.get(l.productId);
    return { productId: p._id, name: p.name, sku: p.sku, barcode: p.barcode, category: p.category || '', unitPrice: p.price, quantity: l.quantity, lineTotal: round2(p.price * l.quantity) };
  });
}

// Member discount (best of the customer's active plans plus one bought in this sale) + membership fee.
async function priceCart({ items, customer, purchase, now }) {
  const planIds = activeMemberships(customer, now).map((m) => m.planId);
  if (purchase) planIds.push(purchase.plan._id);
  const d = await bestDiscount(planIds, items);
  const priced = items.map((it, i) => ({ ...it, discount: d.perLine[i], netTotal: round2(it.lineTotal - d.perLine[i]) }));
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const membershipTotal = purchase ? purchase.option.price : 0;
  return {
    items: priced,
    subtotal,
    discount: d.amount,
    discountLabel: d.plan ? `${d.plan.name} member discount` : '',
    discountPlan: d.plan ? { _id: d.plan._id, name: d.plan.name, discount: d.plan.discount } : null,
    membershipTotal,
    total: round2(subtotal - d.amount + membershipTotal),
  };
}

// Same pricing as checkout without side effects, so the POS shows the exact amount before paying.
async function quote(user, body = {}) {
  const phone = normalizePhone(body.customer?.phone);
  const lines = readLines(body.items, { allowEmpty: true });
  const [store, purchase, byId, customer] = await Promise.all([
    assertCanSellFrom(user, body.storeId),
    readMembershipPurchase(body.membership),
    loadProducts(lines),
    phone ? Customer.findOne({ phone }).lean() : Promise.resolve(null),
  ]);
  const now = new Date();
  const priced = await priceCart({ items: buildLines(lines, byId), customer, purchase, now });
  const membership = purchase
    ? { planId: purchase.plan._id, planName: purchase.plan.name, months: purchase.option.months, price: purchase.option.price, ...membershipTerm(customer, purchase.plan, purchase.option.months, now) }
    : null;
  return { storeId: store._id, ...priced, membership, member: membershipStatus(customer, now) };
}

// Creates a sale: prices come from the DB, stock is decremented atomically per line (rolled back if any
// line is short, since a standalone local MongoDB has no multi-document transactions), and the customer
// is matched by phone so repeat customers are updated rather than duplicated.
async function checkout(user, body = {}) {
  const store = await assertCanSellFrom(user, body.storeId);
  const purchase = await readMembershipPurchase(body.membership);
  const lines = readLines(body.items, { allowEmpty: Boolean(purchase) });
  const paymentMethod = body.paymentMethod || 'cash';
  if (!Sale.PAYMENT_METHODS.includes(paymentMethod)) throw ApiError.badRequest('Unknown payment method');
  const phone = normalizePhone(body.customer?.phone);
  if (purchase && !phone) throw ApiError.badRequest('A customer phone number is required to buy a membership');
  if (phone) assertValidPhone(phone);
  const byId = await loadProducts(lines);

  const decremented = [];
  // Decrement stock for all lines in parallel — each touches a unique (productId, storeId) row.
  // On any failure, restock everything that succeeded before throwing.
  const results = await Promise.all(
    lines.map((line) =>
      InventoryItem.updateOne(
        { productId: line.productId, storeId: store._id, quantity: { $gte: line.quantity } },
        { $inc: { quantity: -line.quantity } },
      ).then((res) => ({ line, res })),
    ),
  );
  for (const { line, res } of results) {
    if (res.modifiedCount === 1) { decremented.push(line); }
  }
  if (decremented.length !== lines.length) {
    await restock(store._id, decremented);
    const failed = results.find(({ res }) => res.modifiedCount !== 1);
    const inv = await InventoryItem.findOne({ productId: failed.line.productId, storeId: store._id }).lean();
    const p = byId.get(failed.line.productId);
    throw new ApiError(409, `Not enough stock for ${p.name} (available: ${inv ? inv.quantity : 0})`, {
      code: 'INSUFFICIENT_STOCK',
      details: { productId: failed.line.productId, available: inv ? inv.quantity : 0, requested: failed.line.quantity },
    });
  }

  try {
    const customer = phone ? await findOrCreateByPhone(phone, body.customer?.name) : null;
    const now = new Date();
    const priced = await priceCart({ items: buildLines(lines, byId), customer, purchase, now });
    const memberships = purchase
      ? [{ planId: purchase.plan._id, planName: purchase.plan.name, months: purchase.option.months, price: purchase.option.price, ...membershipTerm(customer, purchase.plan, purchase.option.months, now) }]
      : [];
    const seq = await nextSequence('sale-receipt');
    const sale = await Sale.create({
      receiptNo: `R-${String(seq).padStart(6, '0')}`,
      storeId: store._id,
      storeName: store.name,
      items: priced.items,
      memberships,
      itemCount: priced.items.reduce((s, i) => s + i.quantity, 0),
      subtotal: priced.subtotal,
      discount: priced.discount,
      discountLabel: priced.discountLabel,
      membershipTotal: priced.membershipTotal,
      total: priced.total,
      paymentMethod,
      customerId: customer?._id,
      customerName: customer?.name || '',
      customerPhone: customer?.phone || '',
      soldBy: user.id,
      soldByName: user.name,
    });
    if (customer) {
      await recordPurchase(customer._id, sale);
      if (memberships.length) await addMembership(customer._id, { ...memberships[0], saleId: sale._id, receiptNo: sale.receiptNo, storeName: store.name });
    }
    return sale;
  } catch (err) {
    await restock(store._id, decremented);
    throw err;
  }
}

module.exports = { checkout, quote, storeFilterFor, assertCanSellFrom, restock, round2, invalidateStoreCache };
