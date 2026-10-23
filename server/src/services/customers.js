const Customer = require('../models/Customer');
const ApiError = require('../utils/ApiError');

// Canonical phone form used for dedup: digits only, keeping a leading '+'. "98765 43210", "98765-43210"
// and "(98765) 43210" all map to the same customer.
function normalizePhone(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  return (s.startsWith('+') ? '+' : '') + digits;
}

function assertValidPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) throw ApiError.badRequest('Phone number must have 7 to 15 digits');
}

// Finds the customer by phone or creates them. Concurrent first purchases for the same phone are
// resolved by the unique index (the losing upsert retries and matches the winner).
async function findOrCreateByPhone(rawPhone, rawName) {
  const phone = normalizePhone(rawPhone);
  assertValidPhone(phone);
  const name = String(rawName ?? '').trim().slice(0, 100);
  const update = { $setOnInsert: { phone } };
  if (name) update.$set = { name };
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await Customer.findOneAndUpdate({ phone }, update, { upsert: true, new: true, runValidators: true });
    } catch (err) {
      if (err.code !== 11000 || attempt >= 2) throw err;
    }
  }
}

async function recordPurchase(customerId, sale) {
  await Customer.updateOne(
    { _id: customerId },
    {
      $push: {
        purchaseHistory: {
          saleId: sale._id,
          receiptNo: sale.receiptNo,
          storeId: sale.storeId,
          storeName: sale.storeName,
          itemCount: sale.itemCount,
          total: sale.total,
          purchasedAt: sale.createdAt,
        },
      },
      $inc: { totalSpent: sale.total, visitCount: 1 },
      $max: { lastPurchaseAt: sale.createdAt },
    },
  );
}

module.exports = { normalizePhone, assertValidPhone, findOrCreateByPhone, recordPurchase };

async function addMembership(customerId, membership) {
  await Customer.updateOne({ _id: customerId }, { $push: { memberships: membership } });
}

module.exports.addMembership = addMembership;
