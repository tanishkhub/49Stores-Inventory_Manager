const mongoose = require('mongoose');

const PAYMENT_METHODS = ['cash', 'card', 'upi', 'other'];

const saleItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    // Snapshot at the time of sale so receipts and reports survive product edits/deletes.
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    barcode: { type: String, default: '' },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
    category: { type: String, default: '' },
    discount: { type: Number, default: 0, min: 0 }, // share of the member discount on this line
    netTotal: { type: Number, min: 0 }, // lineTotal - discount (what the customer paid for the line)
    returnedQty: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const membershipLineSchema = new mongoose.Schema(
  {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan', required: true },
    planName: { type: String, required: true },
    months: { type: Number, required: true },
    price: { type: Number, required: true, min: 0 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
  },
  { _id: false },
);

const saleSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    storeName: { type: String, default: '' },
    items: { type: [saleItemSchema], default: [] },
    memberships: { type: [membershipLineSchema], default: [] },
    itemCount: { type: Number, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    discountLabel: { type: String, default: '' },
    membershipTotal: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    refundedTotal: { type: Number, default: 0 },
    returnCount: { type: Number, default: 0 },
    returnVersion: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cash' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    soldByName: { type: String, default: '' },
  },
  { timestamps: true },
);

saleSchema.pre('validate', function requireLines(next) {
  if (!this.items.length && !this.memberships.length) this.invalidate('items', 'A sale needs at least one item or membership');
  next();
});

saleSchema.index({ receiptNo: 1 }, { unique: true });
saleSchema.index({ storeId: 1, createdAt: -1 });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ 'items.productId': 1, createdAt: -1 });
saleSchema.index({ customerId: 1, createdAt: -1 });

const Sale = mongoose.models.Sale || mongoose.model('Sale', saleSchema);
module.exports = Sale;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
