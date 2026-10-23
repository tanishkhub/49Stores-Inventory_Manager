const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Role = require('../models/Role');
const ApiError = require('../utils/ApiError');
const { paginate, escapeRegex } = require('../utils/paginate');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readUserBody(body = {}, { partial = false } = {}) {
  const out = {};
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== 'string' || !body.name.trim()) throw ApiError.badRequest('Name is required');
    out.name = body.name.trim();
  }
  if (body.email !== undefined || !partial) {
    if (typeof body.email !== 'string' || !EMAIL_PATTERN.test(body.email.trim())) throw ApiError.badRequest('A valid email is required');
    out.email = body.email.trim().toLowerCase();
  }
  const passwordProvided = body.password !== undefined && body.password !== '';
  if (passwordProvided || !partial) {
    if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
      throw ApiError.badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    out.passwordHash = await bcrypt.hash(body.password, 10);
  }
  if (body.roleId !== undefined || !partial) {
    if (!mongoose.isValidObjectId(body.roleId)) throw ApiError.badRequest('A valid roleId is required');
    const role = await Role.findById(body.roleId).lean();
    if (!role) throw ApiError.badRequest('Role does not exist');
    out.roleId = role._id;
    out.role = role;
  }
  if (body.storeIds !== undefined) {
    if (!Array.isArray(body.storeIds) || !body.storeIds.every((id) => mongoose.isValidObjectId(id))) {
      throw ApiError.badRequest('storeIds must be an array of ids');
    }
    out.storeIds = [...new Set(body.storeIds.map(String))];
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw ApiError.badRequest('isActive must be a boolean');
    out.isActive = body.isActive;
  }
  return out;
}

async function findUser(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('User not found');
  const user = await User.findById(id).populate('roleId');
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function activeSuperAdminCount() {
  const roleIds = await Role.find({ isSuperAdmin: true }).distinct('_id');
  return User.countDocuments({ roleId: { $in: roleIds }, isActive: true });
}

function toDto(user) {
  const u = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete u.passwordHash;
  delete u.__v;
  const role = u.roleId && typeof u.roleId === 'object' && u.roleId.name ? u.roleId : null;
  return {
    ...u,
    roleId: role ? String(role._id) : u.roleId,
    role: role ? { id: String(role._id), key: role.key, name: role.name, isSuperAdmin: Boolean(role.isSuperAdmin) } : null,
  };
}

// Only a Super Admin may create, edit or delete Super Admin accounts.
function assertCanManage(req, { targetIsSuperAdmin = false, assigningSuperAdmin = false } = {}) {
  if (!req.user.isSuperAdmin && (targetIsSuperAdmin || assigningSuperAdmin)) {
    throw ApiError.forbidden('Only a Super Admin can manage Super Admin accounts');
  }
}

// GET /api/users?page=1&limit=20&search=jane&roleId=...
router.get('/', requirePermission('users', 'view'), async (req, res) => {
  const filter = {};
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  if (req.query.roleId && mongoose.isValidObjectId(req.query.roleId)) filter.roleId = req.query.roleId;
  const result = await paginate(User, filter, req.query, { populate: 'roleId', sort: { name: 1, _id: 1 } });
  res.json({ ...result, items: result.items.map(toDto) });
});

router.get('/:id', requirePermission('users', 'view'), async (req, res) => {
  res.json(toDto(await findUser(req.params.id)));
});

router.post('/', requirePermission('users', 'add'), async (req, res) => {
  const { role, ...data } = await readUserBody(req.body);
  assertCanManage(req, { assigningSuperAdmin: role.isSuperAdmin });
  if (await User.exists({ email: data.email })) throw ApiError.conflict('A user with this email already exists');
  const user = await User.create(data);
  res.status(201).json(toDto(await user.populate('roleId')));
});

router.put('/:id', requirePermission('users', 'update'), async (req, res) => {
  const user = await findUser(req.params.id);
  const { role, ...data } = await readUserBody(req.body, { partial: true });
  const targetIsSuperAdmin = Boolean(user.roleId && user.roleId.isSuperAdmin);
  assertCanManage(req, { targetIsSuperAdmin, assigningSuperAdmin: Boolean(role && role.isSuperAdmin) });

  const isSelf = String(user._id) === req.user.id;
  if (isSelf && data.roleId && String(data.roleId) !== req.user.roleId) throw ApiError.badRequest('You cannot change your own role');
  if (isSelf && data.isActive === false) throw ApiError.badRequest('You cannot deactivate your own account');
  if (data.email && data.email !== user.email && (await User.exists({ email: data.email }))) {
    throw ApiError.conflict('A user with this email already exists');
  }
  const losingSuperAdmin = targetIsSuperAdmin && ((role && !role.isSuperAdmin) || data.isActive === false);
  if (losingSuperAdmin && user.isActive && (await activeSuperAdminCount()) <= 1) {
    throw ApiError.badRequest('At least one active Super Admin is required');
  }

  user.set(data);
  await user.save();
  res.json(toDto(await user.populate('roleId')));
});

router.delete('/:id', requirePermission('users', 'delete'), async (req, res) => {
  const user = await findUser(req.params.id);
  if (String(user._id) === req.user.id) throw ApiError.badRequest('You cannot delete your own account');
  const targetIsSuperAdmin = Boolean(user.roleId && user.roleId.isSuperAdmin);
  assertCanManage(req, { targetIsSuperAdmin });
  if (targetIsSuperAdmin && user.isActive && (await activeSuperAdminCount()) <= 1) {
    throw ApiError.badRequest('At least one active Super Admin is required');
  }
  await User.deleteOne({ _id: user._id });
  res.json({ message: 'User deleted' });
});

module.exports = router;
