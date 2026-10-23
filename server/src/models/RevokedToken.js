const mongoose = require('mongoose');

// Tokens invalidated by logout. Documents expire automatically once the JWT itself would have expired.
const revokedTokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

module.exports = mongoose.models.RevokedToken || mongoose.model('RevokedToken', revokedTokenSchema);
