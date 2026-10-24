// Vercel serverless entry point. Locally the server runs via src/server.js instead.
// Force Vercel's @vercel/nft bundler to trace packages only required inside
// dynamically loaded route files (fs.readdirSync in src/routes/index.js).
// nft statically analyses every require() — wrapping exceljs in a function keeps it in the
// bundle but defers its (large) load cost to the one export endpoint that uses it.
require('bcryptjs');
require('jsonwebtoken');
const traceExceljs = () => require('exceljs');
void traceExceljs;

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
