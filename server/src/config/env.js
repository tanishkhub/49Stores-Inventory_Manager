const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory_poc',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  seedAdmin: {
    name: process.env.SEED_ADMIN_NAME || 'Super Admin',
    email: (process.env.SEED_ADMIN_EMAIL || 'admin@inventory.local').toLowerCase(),
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
  },
};

if (!env.jwtSecret) {
  if (env.nodeEnv === 'production') {
    throw new Error('JWT_SECRET must be set');
  }
  env.jwtSecret = 'dev-only-insecure-secret';
  console.warn('[config] JWT_SECRET is not set; using an insecure development secret. Copy server/.env.example to server/.env.');
}

module.exports = env;
