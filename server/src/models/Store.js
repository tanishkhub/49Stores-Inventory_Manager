const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20, match: /^[A-Z0-9-]+$/ },
    location: { type: String, trim: true, default: '', maxlength: 200 },
    city: { type: String, trim: true, default: '', maxlength: 80 },
    phone: { type: String, trim: true, default: '', maxlength: 30 },
    isActive: { type: Boolean, default: true },
    // Returns / exchanges are off unless an admin enables them for the store.
    allowReturns: { type: Boolean, default: false },
    allowExchanges: { type: Boolean, default: false },
    returnWindowDays: { type: Number, default: 7, min: 0, max: 365 },
  },
  { timestamps: true },
);

storeSchema.index({ code: 1 }, { unique: true });
storeSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.models.Store || mongoose.model('Store', storeSchema);
