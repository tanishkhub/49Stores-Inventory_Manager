const express = require('express');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const ApiError = require('../utils/ApiError');
const { paginate, escapeRegex } = require('../utils/paginate');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const MAX_EXPORT_ROWS = 50_000;

function readId(value, label) {
  if (!value) return null;
  if (!mongoose.isValidObjectId(value)) throw ApiError.badRequest(`Invalid ${label}`);
  return new mongoose.Types.ObjectId(String(value));
}

function readDate(value, label) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`Invalid ${label} date`);
  return d;
}

// Shared by the list, summary and exports so downloads always match the filtered view.
// `from` / `to` are ISO instants (the client sends local start-of-day / end-of-day).
function buildFilter(query = {}) {
  const filter = {};
  const storeId = readId(query.storeId, 'storeId');
  const productId = readId(query.productId, 'productId');
  const customerId = readId(query.customerId, 'customerId');
  const from = readDate(query.from, 'from');
  const to = readDate(query.to, 'to');
  if (storeId) filter.storeId = storeId;
  if (productId) filter['items.productId'] = productId;
  if (customerId) filter.customerId = customerId;
  if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (query.q) {
    const rx = new RegExp(escapeRegex(String(query.q).trim()), 'i');
    filter.$or = [{ receiptNo: rx }, { customerName: rx }, { customerPhone: rx }];
  }
  return { filter, productId };
}

// Filter option lookups, so the dashboard only needs the `sales` permission.
router.get('/options/stores', requirePermission('sales', 'view'), async (req, res) => {
  res.json({ items: await Store.find().sort({ name: 1 }).select('name code').lean() });
});

router.get('/options/products', requirePermission('sales', 'view'), async (req, res) => {
  const filter = {};
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }];
  }
  res.json(await paginate(Product, filter, req.query, { sort: { name: 1, _id: 1 }, select: 'name sku barcode' }));
});

router.get('/options/customers', requirePermission('sales', 'view'), async (req, res) => {
  const filter = {};
  const q = String(req.query.q ?? '').trim();
  if (q) {
    const or = [{ name: new RegExp(escapeRegex(q), 'i') }];
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3) or.push({ phone: new RegExp(escapeRegex(digits)) });
    filter.$or = or;
  }
  res.json(await paginate(Customer, filter, req.query, { sort: { name: 1, _id: 1 }, select: 'name phone' }));
});

router.get('/', requirePermission('sales', 'view'), async (req, res) => {
  const { filter } = buildFilter(req.query);
  res.json(await paginate(Sale, filter, req.query, { sort: { createdAt: -1, _id: -1 } }));
});

router.get('/summary', requirePermission('sales', 'view'), async (req, res) => {
  const { filter, productId } = buildFilter(req.query);
  const [totals] = await Sale.aggregate([
    { $match: filter },
    { $group: { _id: null, salesCount: { $sum: 1 }, revenue: { $sum: '$total' }, units: { $sum: '$itemCount' }, discount: { $sum: '$discount' }, membershipRevenue: { $sum: '$membershipTotal' } } },
  ]);
  const topProducts = await Sale.aggregate([
    { $match: filter },
    { $unwind: '$items' },
    ...(productId ? [{ $match: { 'items.productId': productId } }] : []),
    { $group: { _id: '$items.productId', name: { $last: '$items.name' }, units: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
  ]);
  const byStore = await Sale.aggregate([
    { $match: filter },
    { $group: { _id: '$storeId', name: { $last: '$storeName' }, salesCount: { $sum: 1 }, revenue: { $sum: '$total' } } },
    { $sort: { revenue: -1 } },
  ]);
  const returnFilter = {};
  if (filter.storeId) returnFilter.storeId = filter.storeId;
  if (filter.createdAt) returnFilter.createdAt = filter.createdAt;
  const [ret] = await SaleReturn.aggregate([
    { $match: returnFilter },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        refunded: { $sum: { $cond: [{ $lt: ['$balance', 0] }, { $multiply: ['$balance', -1] }, 0] } },
        collected: { $sum: { $cond: [{ $gt: ['$balance', 0] }, '$balance', 0] } },
      },
    },
  ]);
  const round = (n) => Math.round((n || 0) * 100) / 100;
  res.json({
    discount: round(totals?.discount),
    membershipRevenue: round(totals?.membershipRevenue),
    returns: { count: ret?.count || 0, refunded: round(ret?.refunded), collected: round(ret?.collected) },
    netRevenue: round((totals?.revenue || 0) - (ret?.refunded || 0) + (ret?.collected || 0)),
    salesCount: totals?.salesCount || 0,
    revenue: round(totals?.revenue),
    units: totals?.units || 0,
    averageSale: totals?.salesCount ? round(totals.revenue / totals.salesCount) : 0,
    topProducts: topProducts.map((p) => ({ ...p, revenue: round(p.revenue) })),
    byStore: byStore.map((s) => ({ ...s, revenue: round(s.revenue) })),
  });
});

// One row per sold line. When a product filter is applied only that product's lines are exported.
const LINE_COLUMNS = [
  { header: 'Receipt', key: 'receiptNo', width: 12 },
  { header: 'Date', key: 'date', width: 20 },
  { header: 'Store', key: 'store', width: 22 },
  { header: 'Customer', key: 'customer', width: 20 },
  { header: 'Phone', key: 'phone', width: 16 },
  { header: 'Product', key: 'product', width: 28 },
  { header: 'SKU', key: 'sku', width: 14 },
  { header: 'Barcode', key: 'barcode', width: 16 },
  { header: 'Quantity', key: 'quantity', width: 10 },
  { header: 'Unit price', key: 'unitPrice', width: 12 },
  { header: 'Line total', key: 'lineTotal', width: 12 },
  { header: 'Member discount', key: 'discount', width: 14 },
  { header: 'Net line', key: 'netTotal', width: 12 },
  { header: 'Returned qty', key: 'returnedQty', width: 12 },
  { header: 'Sale total', key: 'saleTotal', width: 12 },
  { header: 'Payment', key: 'payment', width: 10 },
  { header: 'Sold by', key: 'soldBy', width: 18 },
];

async function* exportRows(filter, productId) {
  const cursor = Sale.find(filter).sort({ createdAt: -1, _id: -1 }).limit(MAX_EXPORT_ROWS).lean().cursor();
  for await (const sale of cursor) {
    for (const item of sale.items) {
      if (productId && String(item.productId) !== String(productId)) continue;
      yield {
        receiptNo: sale.receiptNo,
        date: sale.createdAt,
        store: sale.storeName,
        customer: sale.customerName,
        phone: sale.customerPhone,
        product: item.name,
        sku: item.sku,
        barcode: item.barcode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        discount: item.discount || 0,
        netTotal: item.netTotal ?? item.lineTotal,
        returnedQty: item.returnedQty || 0,
        saleTotal: sale.total,
        payment: sale.paymentMethod,
        soldBy: sale.soldByName,
      };
    }
    if (productId) continue;
    for (const m of sale.memberships || []) {
      yield {
        receiptNo: sale.receiptNo,
        date: sale.createdAt,
        store: sale.storeName,
        customer: sale.customerName,
        phone: sale.customerPhone,
        product: `Membership: ${m.planName} (${m.months} month${m.months === 1 ? '' : 's'})`,
        sku: '',
        barcode: '',
        quantity: 1,
        unitPrice: m.price,
        lineTotal: m.price,
        discount: 0,
        netTotal: m.price,
        returnedQty: 0,
        saleTotal: sale.total,
        payment: sale.paymentMethod,
        soldBy: sale.soldByName,
      };
    }
  }
}

// Neutralise spreadsheet formula injection (cells starting with = + - @ are treated as formulas).
function safeText(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csvCell(value) {
  const s = value instanceof Date ? value.toISOString() : typeof value === 'number' ? String(value) : safeText(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function fileLabel(query) {
  const parts = ['sales'];
  if (query.storeId && mongoose.isValidObjectId(query.storeId)) {
    const store = await Store.findById(query.storeId).select('code').lean();
    if (store) parts.push(store.code);
  }
  parts.push(new Date().toISOString().slice(0, 10));
  return parts.join('-');
}

router.get('/export', requirePermission('sales', 'view'), async (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  if (!['csv', 'xlsx'].includes(format)) throw ApiError.badRequest('format must be csv or xlsx');
  const { filter, productId } = buildFilter(req.query);
  const name = `${await fileLabel(req.query)}.${format}`;
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.write(`\uFEFF${LINE_COLUMNS.map((c) => csvCell(c.header)).join(',')}\r\n`);
    for await (const row of exportRows(filter, productId)) {
      if (!res.write(`${LINE_COLUMNS.map((c) => csvCell(row[c.key])).join(',')}\r\n`)) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    return res.end();
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  const sheet = workbook.addWorksheet('Sales lines', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = LINE_COLUMNS;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).commit();
  for (const key of ['unitPrice', 'lineTotal', 'saleTotal']) sheet.getColumn(key).numFmt = '#,##0.00';
  sheet.getColumn('date').numFmt = 'yyyy-mm-dd hh:mm';
  for await (const row of exportRows(filter, productId)) {
    const textCols = ['receiptNo', 'store', 'customer', 'phone', 'product', 'sku', 'barcode', 'payment', 'soldBy'];
    for (const k of textCols) row[k] = safeText(row[k]);
    sheet.addRow(row).commit();
  }
  sheet.commit();
  await workbook.commit();
  return undefined;
});

router.get('/:id', requirePermission('sales', 'view'), async (req, res) => {
  const sale = await Sale.findById(req.params.id).lean();
  if (!sale) throw ApiError.notFound('Sale not found');
  const store = await Store.findById(sale.storeId).select('name code location city phone').lean();
  res.json({ ...sale, store });
});

module.exports = router;
