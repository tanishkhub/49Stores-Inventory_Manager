const mongoose = require('mongoose');
const MembershipPlan = require('../models/MembershipPlan');
const ApiError = require('../utils/ApiError');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Cache active membership plans — they change rarely (admin edits only).
const PLAN_CACHE_TTL = 60_000;
let planCache = null; // { plans: [], expiresAt }

async function getActivePlans(ids) {
  // If specific IDs requested, check cache first then fall back to DB for any missing.
  if (!planCache || Date.now() > planCache.expiresAt) {
    const plans = await MembershipPlan.find({ isActive: true }).lean();
    planCache = { plans, expiresAt: Date.now() + PLAN_CACHE_TTL };
  }
  if (!ids) return planCache.plans;
  const idSet = new Set(ids.map(String));
  return planCache.plans.filter((p) => idSet.has(String(p._id)));
}

function invalidatePlanCache() { planCache = null; }
function activeMemberships(customer, at = new Date()) {
  return (customer?.memberships || []).filter((m) => new Date(m.startsAt) <= at && new Date(m.endsAt) > at);
}

function membershipStatus(customer, at = new Date()) {
  const all = customer?.memberships || [];
  const active = activeMemberships(customer, at);
  const upcoming = all.filter((m) => new Date(m.startsAt) > at);
  const latestEnd = (list) => list.reduce((d, m) => (!d || new Date(m.endsAt) > d ? new Date(m.endsAt) : d), null);
  return {
    active: active.length > 0,
    memberships: active,
    validUntil: latestEnd([...active, ...upcoming]),
    expiredAt: !active.length && !upcoming.length ? latestEnd(all) : null,
  };
}

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

// Renewing the same plan extends it from its current end date; otherwise validity starts now.
function membershipTerm(customer, plan, months, now = new Date()) {
  const ends = (customer?.memberships || [])
    .filter((m) => String(m.planId) === String(plan._id) && new Date(m.endsAt) > now)
    .map((m) => new Date(m.endsAt).getTime());
  const startsAt = ends.length ? new Date(Math.max(...ends)) : now;
  return { startsAt, endsAt: addMonths(startsAt, months) };
}

// lines: [{ category, lineTotal }]
function planDiscount(plan, lines) {
  const cfg = plan.discount || {};
  const cats = (cfg.categories || []).map((c) => String(c).trim().toLowerCase()).filter(Boolean);
  const eligible = lines
    .map((l, i) => ({ i, amount: l.lineTotal }))
    .filter((x) => !cats.length || cats.includes(String(lines[x.i].category || '').toLowerCase()));
  const base = round2(eligible.reduce((s, x) => s + x.amount, 0));
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  if (!base || subtotal < (cfg.minPurchase || 0)) return { amount: 0, eligible, base };
  let amount = cfg.type === 'flat' ? Math.min(cfg.value || 0, base) : (base * (cfg.value || 0)) / 100;
  if (cfg.maxDiscount > 0) amount = Math.min(amount, cfg.maxDiscount);
  return { amount: round2(Math.min(amount, base)), eligible, base };
}

// Picks the best discount among the given plans and spreads it across the eligible lines
// (needed so returns credit what was actually paid per unit).
async function bestDiscount(planIds, lines) {
  const none = { amount: 0, plan: null, perLine: lines.map(() => 0) };
  if (!planIds.length || !lines.length) return none;
  const plans = await getActivePlans(planIds);
  let best = null;
  for (const plan of plans) {
    const r = planDiscount(plan, lines);
    if (r.amount > 0 && (!best || r.amount > best.amount)) best = { ...r, plan };
  }
  if (!best) return none;
  const perLine = lines.map(() => 0);
  let left = best.amount;
  best.eligible.forEach((x, k) => {
    const share = k === best.eligible.length - 1 ? left : round2((best.amount * x.amount) / best.base);
    perLine[x.i] = round2(Math.min(share, lines[x.i].lineTotal));
    left = round2(left - perLine[x.i]);
  });
  return { amount: best.amount, plan: best.plan, perLine };
}

async function readMembershipPurchase(input) {
  if (!input || !input.planId) return null;
  if (!mongoose.isValidObjectId(input.planId)) throw ApiError.badRequest('Invalid membership plan');
  const [plan] = await getActivePlans([input.planId]);
  if (!plan) throw ApiError.badRequest('Membership plan not found or inactive');
  const months = Number(input.months);
  const option = plan.options.find((o) => o.months === months);
  if (!option) throw ApiError.badRequest(`${plan.name} is not sold for ${input.months} month(s)`);
  return { plan, option };
}

module.exports = { activeMemberships, membershipStatus, membershipTerm, planDiscount, bestDiscount, readMembershipPurchase, addMonths, round2, invalidatePlanCache };
