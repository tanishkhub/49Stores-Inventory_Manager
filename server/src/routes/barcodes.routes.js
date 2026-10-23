const express = require('express');
const Product = require('../models/Product');
const { paginate, escapeRegex } = require('../utils/paginate');
const { authenticate, requirePermission } = require('../middleware/auth');
const { normalizeBarcode, generateUniqueBarcode, BARCODE_TYPES, DEFAULT_TYPE } = require('../services/barcode');

const router = express.Router();
router.use(authenticate);

router.get('/types', requirePermission('barcode-labels', 'view'), (req, res) => {
  res.json({ items: BARCODE_TYPES, default: DEFAULT_TYPE });
});

// Reserves a fresh unique value for the product form's "Generate" button.
router.post('/generate', requirePermission('products', 'add'), async (req, res) => {
  res.json({ barcode: await generateUniqueBarcode(), barcodeType: DEFAULT_TYPE });
});

// Checks a manual barcode for the chosen symbology and whether another product already uses it.
router.get('/validate', requirePermission('products', 'view'), async (req, res) => {
  let result;
  try {
    result = normalizeBarcode(req.query.value, req.query.type);
  } catch (err) {
    return res.json({ valid: false, message: err.message });
  }
  const clash = await Product.findOne({ barcode: result.value, ...(req.query.excludeId ? { _id: { $ne: req.query.excludeId } } : {}) })
    .select('name sku')
    .lean();
  if (clash) return res.json({ valid: false, value: result.value, message: `Already mapped to ${clash.name} (${clash.sku})` });
  return res.json({ valid: true, value: result.value, type: result.type });
});

// Products for the label printing page (name, price and barcode only).
router.get('/products', requirePermission('barcode-labels', 'view'), async (req, res) => {
  const filter = { isActive: true };
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { category: rx }];
  }
  res.json(await paginate(Product, filter, req.query, { sort: { name: 1, _id: 1 }, select: 'name sku barcode barcodeType price category' }));
});

module.exports = router;
