const express = require('express');
const Page = require('../models/Page');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Page catalog (used by the Roles & Permissions matrix).
router.get('/', authenticate, requirePermission('roles', 'view'), async (req, res) => {
  const pages = await Page.find({ isActive: true }).sort({ order: 1, label: 1 }).lean();
  res.json({ items: pages });
});

module.exports = router;
