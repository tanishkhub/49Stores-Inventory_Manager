const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Page = require('../models/Page');
const RevokedToken = require('../models/RevokedToken');
const ApiError = require('../utils/ApiError');
const { signToken } = require('../utils/token');
const { authenticate, invalidateUserCache } = require('../middleware/auth');
const { getRolePermissions } = require('../rbac/permissions');

const router = express.Router();

async function buildSession(userId) {
  const user = await User.findById(userId).populate('roleId').lean();
  const role = user.roleId;
  const permissions = await getRolePermissions(role);
  const pages = await Page.find({ isActive: true }).sort({ order: 1, label: 1 }).lean();
  return {
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      storeIds: (user.storeIds || []).map(String),
      role: {
        id: String(role._id),
        key: role.key,
        name: role.name,
        isSuperAdmin: Boolean(role.isSuperAdmin),
      },
    },
    permissions,
    pages: pages
      .filter((p) => permissions[p.key] && permissions[p.key].view)
      .map(({ key, label, group, order, actions }) => ({ key, label, group, order, actions })),
  };
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw ApiError.badRequest('Email and password are required');
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
  const valid = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) throw ApiError.unauthorized('Invalid email or password');

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken(user);
  res.json({ token, ...(await buildSession(user._id)) });
});

router.post('/logout', authenticate, async (req, res) => {
  const { jti, exp } = req.token;
  if (jti) {
    invalidateUserCache(jti);
    await RevokedToken.updateOne(
      { jti },
      { $setOnInsert: { jti, expiresAt: new Date((exp || Math.floor(Date.now() / 1000)) * 1000) } },
      { upsert: true },
    );
  }
  res.json({ message: 'Logged out' });
});

// Current user, role and live permission map. The client calls this on load to build the nav.
router.get('/me', authenticate, async (req, res) => {
  res.json(await buildSession(req.user.id));
});

module.exports = router;
