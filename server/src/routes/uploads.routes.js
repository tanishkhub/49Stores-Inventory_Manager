const express = require('express');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { authenticate } = require('../middleware/auth');
const { hasPermission } = require('../rbac/permissions');
const { signUpload } = require('../services/cloudinary');

const router = express.Router();
router.use(authenticate);

// Returns signed params for a direct browser -> Cloudinary upload. The image bytes never
// pass through this API — the server only vouches for the upload with a signature.
router.post('/sign', async (req, res) => {
  if (!env.cloudinary.enabled) throw ApiError.notFound('Image uploads are not configured');
  const canWrite =
    (await hasPermission(req.user.role, 'products', 'add')) ||
    (await hasPermission(req.user.role, 'products', 'update'));
  if (!canWrite) throw ApiError.forbidden('Missing permission: products.add or products.update');
  res.json(signUpload());
});

module.exports = router;
