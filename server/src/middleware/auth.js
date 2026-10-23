const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const ApiError = require('../utils/ApiError');
const { verifyToken } = require('../utils/token');
const { hasPermission } = require('../rbac/permissions');

// Verifies the Bearer JWT and loads the user + role from MongoDB on every request, so role changes
// and deactivation take effect immediately. Sets:
//   req.user  = { id, name, email, roleId, role, storeIds, isSuperAdmin }
//   req.token = { jti, exp }
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(ApiError.unauthorized());

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }

  if (payload.jti && (await RevokedToken.exists({ jti: payload.jti }))) {
    return next(ApiError.unauthorized('Token has been revoked'));
  }

  const user = await User.findById(payload.sub).populate('roleId').lean();
  if (!user || !user.isActive || !user.roleId) return next(ApiError.unauthorized('Account is not active'));

  const role = user.roleId;
  req.user = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    roleId: String(role._id),
    role,
    storeIds: (user.storeIds || []).map(String),
    isSuperAdmin: Boolean(role.isSuperAdmin),
  };
  req.token = { jti: payload.jti, exp: payload.exp };
  return next();
}

// Usage: router.post('/', authenticate, requirePermission('inventory', 'add'), handler)
function requirePermission(pageKey, action = 'view') {
  return async function permissionGuard(req, res, next) {
    if (!req.user) return next(ApiError.unauthorized());
    if (await hasPermission(req.user.role, pageKey, action)) return next();
    return next(ApiError.forbidden(`Missing permission: ${pageKey}.${action}`));
  };
}

function requireSuperAdmin(req, res, next) {
  if (req.user && req.user.isSuperAdmin) return next();
  return next(ApiError.forbidden('Super Admin only'));
}

module.exports = { authenticate, requirePermission, requireSuperAdmin };
