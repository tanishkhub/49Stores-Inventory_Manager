const mongoose = require('mongoose');

const returnedSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    unitCredit: { type: Number, required: true, min: 0 }, // price actually paid per unit (after member discount)
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const newItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    barcode: { type: String, default: '' },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

// A return or exchange against an existing bill. balance > 0: customer pays the difference;
// balance < 0: the store refunds that amount.
const saleReturnSchema = new mongoose.Schema(
  {
    returnNo: { type: String, required: true },
    type: { type: String, enum: ['return', 'exchange'], required: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    receiptNo: { type: String, required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    storeName: { type: String, default: '' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    returnedItems: { type: [returnedSchema], validate: (v) => v.length > 0 },
    newItems: { type: [newItemSchema], default: [] },
    creditTotal: { type: Number, required: true, min: 0 },
    newItemsTotal: { type: Number, default: 0, min: 0 },
    balance: { type: Number, required: true },
    reason: { type: String, trim: true, default: '', maxlength: 300 },
    paymentMethod: { type: String, default: 'cash' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    processedByName: { type: String, default: '' },
  },
  { timestamps: true },
);

saleReturnSchema.index({ returnNo: 1 }, { unique: true });
saleReturnSchema.index({ saleId: 1, createdAt: -1 });
saleReturnSchema.index({ storeId: 1, createdAt: -1 });
saleReturnSchema.index({ createdAt: -1 });

module.exports = mongoose.models.SaleReturn || mongoose.model('SaleReturn', saleReturnSchema);
