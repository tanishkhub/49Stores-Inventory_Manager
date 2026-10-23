const express = require('express');
const mongoose = require('mongoose');
const Role = require('../models/Role');
const User = require('../models/User');
const Page = require('../models/Page');
const Permission = require('../models/Permission');
const ApiError = require('../utils/ApiError');
const { ACTIONS } = require('../rbac/actions');
const { getRolePermissions } = require('../rbac/permissions');
const { authenticate, requirePermission, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Reading roles is permission-driven; changing roles or permissions is restricted to Super Admin
// so a delegated role can never grant itself more access.
const canView = requirePermission('roles', 'view');

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50) || 'role';
}

async function uniqueKey(base) {
  let key = base;
  for (let i = 2; await Role.exists({ key }); i += 1) key = `${base}_${i}`;
  return key;
}

async function findRole(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Role not found');
  const role = await Role.findById(id).lean();
  if (!role) throw ApiError.notFound('Role not found');
  return role;
}

function readRoleBody(body = {}, { partial = false } = {}) {
  const out = {};
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== 'string' || !body.name.trim()) throw ApiError.badRequest('Role name is required');
    out.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') throw ApiError.badRequest('Description must be a string');
    out.description = body.description.trim();
  }
  return out;
}

router.get('/', canView, async (req, res) => {
  const roles = await Role.find().sort({ isSystem: -1, name: 1 }).lean();
  const counts = await User.aggregate([{ $group: { _id: '$roleId', count: { $sum: 1 } } }]);
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({ items: roles.map((r) => ({ ...r, userCount: countById.get(String(r._id)) || 0 })) });
});

router.get('/:id', canView, async (req, res) => {
  const role = await findRole(req.params.id);
  res.json({ ...role, permissions: await getRolePermissions(role) });
});

router.post('/', requireSuperAdmin, async (req, res) => {
  const data = readRoleBody(req.body);
  const key = await uniqueKey(slugify(data.name));
  const role = await Role.create({ ...data, key, isSystem: false, isSuperAdmin: false });
  res.status(201).json(role);
});

router.put('/:id', requireSuperAdmin, async (req, res) => {
  await findRole(req.params.id);
  const data = readRoleBody(req.body, { partial: true });
  const role = await Role.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true });
  res.json(role);
});

router.delete('/:id', requireSuperAdmin, async (req, res) => {
  const role = await findRole(req.params.id);
  if (role.isSystem) throw ApiError.badRequest('System roles cannot be deleted');
  const assigned = await User.countDocuments({ roleId: role._id });
  if (assigned) throw ApiError.conflict(`Role is assigned to ${assigned} user(s); reassign them first`);
  await Permission.deleteMany({ role: role._id });
  await Role.deleteOne({ _id: role._id });
  res.json({ message: 'Role deleted' });
});

// Body: { permissions: { [pageKey]: { view, add, update, delete } } } (partial updates allowed).
// Any granted add/update/delete implies view; removing view removes every other action.
router.put('/:id/permissions', requireSuperAdmin, async (req, res) => {
  const role = await findRole(req.params.id);
  if (role.isSuperAdmin) throw ApiError.badRequest('Super Admin always has full access; its permissions cannot be edited');

  const input = (req.body || {}).permissions;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw ApiError.badRequest('Body must be { permissions: { [pageKey]: { view, add, update, delete } } }');
  }
  const pages = new Map((await Page.find({ isActive: true }).lean()).map((p) => [p.key, p]));
  const unknown = Object.keys(input).filter((k) => !pages.has(k));
  if (unknown.length) throw ApiError.badRequest(`Unknown page key(s): ${unknown.join(', ')}`);

  const current = await getRolePermissions(role);
  const ops = Object.entries(input).map(([pageKey, flags]) => {
    const page = pages.get(pageKey);
    const next = { ...current[pageKey] };
    for (const action of ACTIONS) {
      if (flags && typeof flags[action] === 'boolean') next[action] = flags[action] && page.actions.includes(action);
    }
    if (ACTIONS.some((a) => a !== 'view' && next[a])) next.view = true;
    if (!next.view) for (const a of ACTIONS) next[a] = false;
    return {
      updateOne: { filter: { role: role._id, pageKey }, update: { $set: next }, upsert: true },
    };
  });
  if (ops.length) await Permission.bulkWrite(ops);
  res.json({ ...role, permissions: await getRolePermissions(role) });
});

module.exports = router;
