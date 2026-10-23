const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const Product = require('../models/Product');
const InventoryItem = require('../models/InventoryItem');
const Customer = require('../models/Customer');
const { nextSequence } = require('../models/Counter');
const ApiError = require('../utils/ApiError');
const { assertCanSellFrom, restock, round2 } = require('./sales');

const DAY = 24 * 3600 * 1000;

function returnPolicy(store, sale, now = Date.now()) {
  const windowDays = store.returnWindowDays ?? 7;
  const deadline = new Date(new Date(sale.createdAt).getTime() + windowDays * DAY);
  return { allowReturns: Boolean(store.allowReturns), allowExchanges: Boolean(store.allowExchanges), windowDays, deadline, withinWindow: now <= deadline.getTime() };
}

function readQtyLines(items) {
  if (!Array.isArray(items)) return [];
  const merged = new Map();
  for (const it of items) {
    if (!it || !mongoose.isValidObjectId(it.productId)) throw ApiError.badRequest('Each item needs a valid productId');
    const qty = Number(it.quantity);
    if (!Number.isInteger(qty) || qty < 0 || qty > 100000) throw ApiError.badRequest('Quantity must be a whole number');
    if (!qty) continue;
    const key = String(it.productId);
    merged.set(key, (merged.get(key) || 0) + qty);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

async function findSaleForReturn(user, receiptNo) {
  const no = String(receiptNo ?? '').trim().toUpperCase();
  if (!no) throw ApiError.badRequest('Enter the receipt number from the bill');
  const sale = await Sale.findOne({ receiptNo: no }).lean();
  if (!sale) throw ApiError.notFound(`No bill found for ${no}`);
  const store = await assertCanSellFrom(user, sale.storeId);
  const returns = await SaleReturn.find({ saleId: sale._id }).sort({ createdAt: -1 }).lean();
  return { sale, store, policy: returnPolicy(store, sale), returns };
}

// Return (refund) or exchange (return + new items, settle the difference) against one bill.
// Only allowed when the admin enabled it for the bill's store and within the store's return window.
async function processReturn(user, body = {}) {
  const type = body.type === 'exchange' ? 'exchange' : 'return';
  if (!mongoose.isValidObjectId(body.saleId)) throw ApiError.badRequest('A valid saleId is required');
  const sale = await Sale.findById(body.saleId).lean();
  if (!sale) throw ApiError.notFound('Bill not found');
  const store = await assertCanSellFrom(user, sale.storeId);
  const policy = returnPolicy(store, sale);
  if (type === 'return' && !policy.allowReturns) throw ApiError.forbidden(`Returns are not enabled for ${store.name}`);
  if (type === 'exchange' && !policy.allowExchanges) throw ApiError.forbidden(`Exchanges are not enabled for ${store.name}`);
  if (!policy.withinWindow) throw ApiError.badRequest(`The ${policy.windowDays}-day return window for ${sale.receiptNo} ended on ${policy.deadline.toISOString().slice(0, 10)}`);

  const lines = readQtyLines(body.items);
  if (!lines.length) throw ApiError.badRequest('Pick at least one item to return');
  const inc = {};
  const returnedItems = lines.map((l) => {
    const idx = sale.items.findIndex((i) => String(i.productId) === l.productId);
    if (idx < 0) throw ApiError.badRequest('That item is not on this bill');
    const it = sale.items[idx];
    const left = it.quantity - (it.returnedQty || 0);
    if (l.quantity > left) throw ApiError.badRequest(`Only ${left} × ${it.name} can still be returned on this bill`);
    inc[`items.${idx}.returnedQty`] = l.quantity;
    const paid = it.netTotal ?? it.lineTotal;
    const amount = l.quantity === left ? round2(paid - round2((paid / it.quantity) * (it.returnedQty || 0))) : round2((paid / it.quantity) * l.quantity);
    return { productId: it.productId, name: it.name, sku: it.sku, quantity: l.quantity, unitCredit: round2(paid / it.quantity), amount };
  });
  const creditTotal = round2(returnedItems.reduce((s, r) => s + r.amount, 0));

  const newLines = type === 'exchange' ? readQtyLines(body.newItems) : [];
  if (type === 'exchange' && !newLines.length) throw ApiError.badRequest('Add the replacement items for the exchange');
  const products = newLines.length ? await Product.find({ _id: { $in: newLines.map((l) => l.productId) }, isActive: true }).lean() : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));
  if (newLines.some((l) => !byId.has(l.productId))) throw ApiError.badRequest('Some replacement products no longer exist or are inactive');

  // Claim the units on the bill first (optimistic lock: two cashiers cannot return the same units twice).
  const version = sale.returnVersion || 0;
  const claim = await Sale.updateOne(
    { _id: sale._id, returnVersion: version ? version : { $in: [0, null] } },
    { $inc: { ...inc, returnVersion: 1, returnCount: 1, refundedTotal: creditTotal } },
  );
  if (claim.modifiedCount !== 1) throw ApiError.conflict('This bill was just updated by another return. Reload it and try again.');
  const unclaim = () => Sale.updateOne(
    { _id: sale._id },
    { $inc: { ...Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, -v])), returnVersion: 1, returnCount: -1, refundedTotal: -creditTotal } },
  );

  const decremented = [];
  for (const line of newLines) {
    const res = await InventoryItem.updateOne(
      { productId: line.productId, storeId: store._id, quantity: { $gte: line.quantity } },
      { $inc: { quantity: -line.quantity } },
    );
    if (res.modifiedCount !== 1) {
      await restock(store._id, decremented);
      await unclaim();
      throw new ApiError(409, `Not enough stock for ${byId.get(line.productId).name} to exchange`, { code: 'INSUFFICIENT_STOCK' });
    }
    decremented.push(line);
  }

  try {
    const newItems = newLines.map((l) => {
      const p = byId.get(l.productId);
      return { productId: p._id, name: p.name, sku: p.sku, barcode: p.barcode, unitPrice: p.price, quantity: l.quantity, lineTotal: round2(p.price * l.quantity) };
    });
    const newItemsTotal = round2(newItems.reduce((s, i) => s + i.lineTotal, 0));
    const seq = await nextSequence('sale-return');
    const doc = await SaleReturn.create({
      returnNo: `RT-${String(seq).padStart(6, '0')}`,
      type,
      saleId: sale._id,
      receiptNo: sale.receiptNo,
      storeId: store._id,
      storeName: store.name,
      customerId: sale.customerId,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      returnedItems,
      newItems,
      creditTotal,
      newItemsTotal,
      balance: round2(newItemsTotal - creditTotal),
      reason: String(body.reason ?? '').trim().slice(0, 300),
      paymentMethod: Sale.PAYMENT_METHODS.includes(body.paymentMethod) ? body.paymentMethod : 'cash',
      processedBy: user.id,
      processedByName: user.name,
    });
    await Promise.all(
      returnedItems.map((r) => InventoryItem.updateOne({ productId: r.productId, storeId: store._id }, { $inc: { quantity: r.quantity } }, { upsert: true })),
    );
    if (sale.customerId) await Customer.updateOne({ _id: sale.customerId }, { $inc: { totalSpent: doc.balance } });
    return doc.toObject();
  } catch (err) {
    await restock(store._id, decremented);
    await unclaim();
    throw err;
  }
}

module.exports = { returnPolicy, findSaleForReturn, processReturn };
