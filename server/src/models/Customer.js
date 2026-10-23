const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    receiptNo: { type: String, required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    storeName: { type: String, default: '' },
    itemCount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    purchasedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const membershipSchema = new mongoose.Schema(
  {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan', required: true },
    planName: { type: String, required: true },
    months: { type: Number, required: true },
    price: { type: Number, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    receiptNo: { type: String, default: '' },
    storeName: { type: String, default: '' },
  },
  { _id: false },
);

// One record per phone number: repeat customers are matched by `phone` (normalized) and never duplicated.
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '', maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    purchaseHistory: { type: [purchaseSchema], default: [] },
    memberships: { type: [membershipSchema], default: [] },
    totalSpent: { type: Number, default: 0 },
    visitCount: { type: Number, default: 0 },
    lastPurchaseAt: { type: Date },
  },
  { timestamps: true },
);

customerSchema.index({ phone: 1 }, { unique: true });
customerSchema.index({ name: 1 });
customerSchema.index({ lastPurchaseAt: -1 });
customerSchema.index({ 'memberships.endsAt': -1 });

module.exports = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
