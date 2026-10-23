const mongoose = require('mongoose');

// Stock of one product in one store (multi-store inventory).
const inventoryItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    quantity: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
    reorderLevel: { type: Number, min: 0, default: 0, validate: Number.isInteger },
  },
  { timestamps: true },
);

inventoryItemSchema.index({ productId: 1, storeId: 1 }, { unique: true });
inventoryItemSchema.index({ storeId: 1, quantity: 1 });

module.exports = mongoose.models.InventoryItem || mongoose.model('InventoryItem', inventoryItemSchema);
