const mongoose = require('mongoose');

// One record per (role, page). Super Admin toggles these at runtime from the Roles & Permissions page.
const permissionSchema = new mongoose.Schema(
  {
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    pageKey: { type: String, required: true, trim: true },
    view: { type: Boolean, default: false },
    add: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  { timestamps: true },
);

permissionSchema.index({ role: 1, pageKey: 1 }, { unique: true });

module.exports = mongoose.models.Permission || mongoose.model('Permission', permissionSchema);
