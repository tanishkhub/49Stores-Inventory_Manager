const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signToken(user) {
  return jwt.sign({ role: String(user.roleId) }, env.jwtSecret, {
    subject: String(user._id),
    jwtid: crypto.randomUUID(),
    expiresIn: env.jwtExpiresIn,
  });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = { signToken, verifyToken };
