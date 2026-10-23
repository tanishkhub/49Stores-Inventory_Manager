const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    // Stable slug used by code (e.g. default permissions in rbac/pages/*.pages.js). Never changes after creation.
    key: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9_]+$/ },
    name: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, default: '', maxlength: 300 },
    // System roles are seeded and cannot be deleted.
    isSystem: { type: Boolean, default: false },
    // Full access to every page/action, regardless of Permission records. Only set by the seed script.
    isSuperAdmin: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.models.Role || mongoose.model('Role', roleSchema);
