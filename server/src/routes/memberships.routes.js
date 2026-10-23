const express = require('express');
const MembershipPlan = require('../models/MembershipPlan');
const ApiError = require('../utils/ApiError');
const { paginate, escapeRegex } = require('../utils/paginate');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const num = (v, label, { min = 0, max = 1e9, int = false } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) throw ApiError.badRequest(`${label} must be ${int ? 'a whole number' : 'a number'} between ${min} and ${max}`);
  return Math.round(n * 100) / 100;
};

function readPlan(body = {}) {
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 80) throw ApiError.badRequest('Plan name is required (max 80 characters)');
  if (!Array.isArray(body.options) || !body.options.length) throw ApiError.badRequest('Add at least one billing option (months + price)');
  const options = body.options.map((o) => ({ months: num(o.months, 'Months', { min: 1, max: 60, int: true }), price: num(o.price, 'Price', { max: 1e7 }) }));
  if (new Set(options.map((o) => o.months)).size !== options.length) throw ApiError.badRequest('Each billing option needs a different number of months');
  options.sort((a, b) => a.months - b.months);
  const d = body.discount || {};
  const type = d.type === 'flat' ? 'flat' : 'percent';
  const discount = {
    type,
    value: num(d.value ?? 0, 'Discount', { max: type === 'percent' ? 100 : 1e7 }),
    maxDiscount: num(d.maxDiscount ?? 0, 'Max discount', { max: 1e7 }),
    minPurchase: num(d.minPurchase ?? 0, 'Minimum purchase', { max: 1e7 }),
    categories: [...new Set((Array.isArray(d.categories) ? d.categories : String(d.categories ?? '').split(',')).map((c) => String(c).trim()).filter(Boolean))].slice(0, 50),
  };
  return { name, description: String(body.description ?? '').trim().slice(0, 300), options, discount, isActive: body.isActive === undefined ? true : Boolean(body.isActive) };
}

router.get('/', requirePermission('memberships', 'view'), async (req, res) => {
  const filter = {};
  if (req.query.q) filter.name = new RegExp(escapeRegex(req.query.q), 'i');
  res.json(await paginate(MembershipPlan, filter, req.query, { sort: { name: 1, _id: 1 } }));
});

router.post('/', requirePermission('memberships', 'add'), async (req, res) => {
  try {
    res.status(201).json(await MembershipPlan.create(readPlan(req.body)));
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('A plan with this name already exists');
    throw err;
  }
});

router.put('/:id', requirePermission('memberships', 'update'), async (req, res) => {
  try {
    const plan = await MembershipPlan.findByIdAndUpdate(req.params.id, readPlan(req.body), { new: true, runValidators: true });
    if (!plan) throw ApiError.notFound('Plan not found');
    res.json(plan);
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('A plan with this name already exists');
    throw err;
  }
});

// Members keep their purchased validity; deleting only stops new sales of the plan.
router.delete('/:id', requirePermission('memberships', 'delete'), async (req, res) => {
  const plan = await MembershipPlan.findByIdAndDelete(req.params.id);
  if (!plan) throw ApiError.notFound('Plan not found');
  res.status(204).end();
});

module.exports = router;
