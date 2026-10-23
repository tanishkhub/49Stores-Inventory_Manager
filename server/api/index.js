// Vercel serverless entry point. Locally the server runs via src/server.js instead.
// Force Vercel's @vercel/nft bundler to trace packages only required inside
// dynamically loaded route files (fs.readdirSync in src/routes/index.js):
require('bcryptjs');
require('jsonwebtoken');
require('exceljs');

const { createApp } = require('../src/app');
const { ensureReady } = require('../src/bootstrap');

const app = createApp();

module.exports = async (req, res) => {
  try {
    await ensureReady();
  } catch (err) {
    console.error('[vercel] startup failed:', err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { message: 'Service unavailable: database connection failed', code: 'DB_UNAVAILABLE' } }));
    return;
  }
  return app(req, res);
};
