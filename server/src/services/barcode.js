const Product = require('../models/Product');
const { nextSequence } = require('../models/Counter');
const ApiError = require('../utils/ApiError');

const { BARCODE_TYPES } = Product;
const DEFAULT_TYPE = 'CODE128';
// In-store / restricted-circulation GS1 prefix, so generated codes never clash with real retail EANs.
const GENERATED_PREFIX = '20';
const MAX_LENGTH = 48;

function ean13CheckDigit(first12) {
  const sum = [...first12].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

function isValidEan13(value) {
  return /^\d{13}$/.test(value) && ean13CheckDigit(value.slice(0, 12)) === value[12];
}

// Returns { value, type } or throws ApiError.badRequest. 12-digit EAN-13 input gets its check digit appended.
function normalizeBarcode(rawValue, rawType = DEFAULT_TYPE) {
  const type = String(rawType || DEFAULT_TYPE).toUpperCase();
  if (!BARCODE_TYPES.includes(type)) throw ApiError.badRequest(`Barcode type must be one of ${BARCODE_TYPES.join(', ')}`);
  const value = String(rawValue ?? '').trim();
  if (!value) throw ApiError.badRequest('Barcode value is required');
  if (type === 'EAN13') {
    if (/^\d{12}$/.test(value)) return { value: value + ean13CheckDigit(value), type };
    if (!isValidEan13(value)) throw ApiError.badRequest('EAN-13 needs 12 digits (check digit added) or 13 digits with a valid check digit');
    return { value, type };
  }
  if (value.length > MAX_LENGTH) throw ApiError.badRequest(`Barcode must be at most ${MAX_LENGTH} characters`);
  if (!/^[\x20-\x7E]+$/.test(value)) throw ApiError.badRequest('Code128 barcodes may only contain printable ASCII characters');
  return { value, type };
}

// Unique 13-digit numeric value with a valid EAN-13 check digit, so it can print as Code128 or EAN-13.
async function generateUniqueBarcode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const seq = await nextSequence('product-barcode');
    const first12 = GENERATED_PREFIX + String(seq).padStart(10, '0');
    const value = first12 + ean13CheckDigit(first12);
    if (!(await Product.exists({ barcode: value }))) return value;
  }
  throw new ApiError(500, 'Could not generate a unique barcode');
}

module.exports = { normalizeBarcode, generateUniqueBarcode, isValidEan13, ean13CheckDigit, BARCODE_TYPES, DEFAULT_TYPE };
