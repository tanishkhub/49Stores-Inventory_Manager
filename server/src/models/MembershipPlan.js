const mongoose = require('mongoose');

const DISCOUNT_TYPES = ['percent', 'flat'];

// Admin-defined membership. Each plan can be sold for any number of billing options (e.g. 1 month for
// 50, 3 months for 100) and gives active members a configurable discount on product purchases.
const optionSchema = new mongoose.Schema(
  {
    months: { type: Number, required: true, min: 1, max: 60 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, default: '', maxlength: 300 },
    options: { type: [optionSchema], validate: (v) => v.length > 0 },
    discount: {
      type: { type: String, enum: DISCOUNT_TYPES, default: 'percent' },
      value: { type: Number, min: 0, default: 0 },
      maxDiscount: { type: Number, min: 0, default: 0 }, // 0 = no cap
      minPurchase: { type: Number, min: 0, default: 0 },
      categories: { type: [String], default: [] }, // empty = every category
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

planSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.models.MembershipPlan || mongoose.model('MembershipPlan', planSchema);
module.exports.DISCOUNT_TYPES = DISCOUNT_TYPES;
