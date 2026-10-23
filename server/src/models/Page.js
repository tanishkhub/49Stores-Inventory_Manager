const mongoose = require('mongoose');
const { ACTIONS } = require('../rbac/actions');

// Catalog of RBAC-controlled pages. Synced from rbac/pages/*.pages.js on startup and by the seed script.
const pageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    group: { type: String, default: 'General' },
    order: { type: Number, default: 100 },
    actions: { type: [{ type: String, enum: ACTIONS }], default: () => [...ACTIONS] },
    // False when the page definition file has been removed from the codebase.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.models.Page || mongoose.model('Page', pageSchema);
