const express = require('express');
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const ApiError = require('../utils/ApiError');
const { paginate, escapeRegex } = require('../utils/paginate');
const { authenticate, requirePermission } = require('../middleware/auth');
const { normalizePhone, assertValidPhone } = require('../services/customers');
const { membershipStatus } = require('../services/memberships');
const { hasPermission } = require('../rbac/permissions');

// Users who cannot see the store list (sales staff) only see customers who bought at their assigned stores.
async function storeScope(user) {
  if (user.isSuperAdmin || (await hasPermission(user.role, 'stores', 'view'))) return null;
  return { 'purchaseHistory.storeId': { $in: user.storeIds || [] } };
}

const router = express.Router();
router.use(authenticate);

const HISTORY_LIMIT = 200;

router.get('/', requirePermission('customers', 'view'), async (req, res) => {
  const filter = {};
  const q = String(req.query.q ?? '').trim();
  if (q) {
    const or = [{ name: new RegExp(escapeRegex(q), 'i') }];
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3) or.push({ phone: new RegExp(escapeRegex(digits)) });
    filter.$or = or;
  }
  const scope = await storeScope(req.user);
  if (scope) Object.assign(filter, scope);
  const page = await paginate(Customer, filter, req.query, {
    sort: { lastPurchaseAt: -1, _id: -1 },
    select: 'name phone totalSpent visitCount lastPurchaseAt createdAt memberships',
  });
  page.items = page.items.map(({ memberships, ...c }) => ({ ...c, membership: membershipStatus({ memberships }) }));
  res.json(page);
});

router.get('/:id', requirePermission('customers', 'view'), async (req, res) => {
  const scope = await storeScope(req.user);
  const customer = await Customer.findOne({ _id: req.params.id, ...(scope || {}) }, { purchaseHistory: { $slice: -HISTORY_LIMIT } }).lean();
  if (!customer) throw ApiError.notFound('Customer not found');
  if (scope) {
    const allowed = new Set((req.user.storeIds || []).map(String));
    customer.purchaseHistory = customer.purchaseHistory.filter((h) => allowed.has(String(h.storeId)));
  }
  customer.membership = membershipStatus(customer);
  const now = new Date();
  customer.memberships = [...(customer.memberships || [])].reverse().map((m) => ({
    ...m,
    status: new Date(m.endsAt) <= now ? 'Expired' : new Date(m.startsAt) > now ? 'Upcoming' : 'Active',
  }));
  customer.purchaseHistory.reverse();
  res.json(customer);
});

router.put('/:id', requirePermission('customers', 'update'), async (req, res) => {
  const update = {};
  if (req.body?.name !== undefined) update.name = String(req.body.name ?? '').trim().slice(0, 100);
  if (req.body?.phone !== undefined) {
    update.phone = normalizePhone(req.body.phone);
    assertValidPhone(update.phone);
    const clash = await Customer.findOne({ phone: update.phone, _id: { $ne: req.params.id } }).select('name').lean();
    if (clash) throw ApiError.conflict(`Phone ${update.phone} already belongs to ${clash.name || 'another customer'}`);
  }
  const customer = await Customer.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
    .select('-purchaseHistory')
    .lean();
  if (!customer) throw ApiError.notFound('Customer not found');
  if (update.name !== undefined || update.phone !== undefined) {
    await Sale.updateMany({ customerId: customer._id }, { customerName: customer.name, customerPhone: customer.phone });
  }
  res.json(customer);
});

router.delete('/:id', requirePermission('customers', 'delete'), async (req, res) => {
  const customer = await Customer.findByIdAndDelete(req.params.id);
  if (!customer) throw ApiError.notFound('Customer not found');
  res.status(204).end();
});

module.exports = router;
