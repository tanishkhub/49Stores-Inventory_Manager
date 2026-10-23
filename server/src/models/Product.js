const mongoose = require('mongoose');

const BARCODE_TYPES = ['CODE128', 'EAN13'];

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    // Product <-> barcode mapping: the value printed on labels and scanned at the POS.
    barcode: { type: String, required: true, trim: true, maxlength: 48 },
    barcodeType: { type: String, enum: BARCODE_TYPES, default: 'CODE128' },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, trim: true, default: '', maxlength: 80 },
    // Base64 data URLs, resized client-side. The full image is only returned by GET /api/products/:id.
    imageBase64: { type: String, default: '', select: false },
    thumbnailBase64: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productSchema.index({ sku: 1 }, { unique: true });
productSchema.index({ barcode: 1 }, { unique: true });
productSchema.index({ name: 1 });
productSchema.index({ category: 1 });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
module.exports = Product;
module.exports.BARCODE_TYPES = BARCODE_TYPES;
