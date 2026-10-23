const { connectDB } = require('./config/db');
const { syncPages } = require('./rbac/syncPages');

// Connects to MongoDB and registers any new page definitions (rbac/pages/*.pages.js).
// Safe to call many times; the work happens once per process (or per warm serverless instance).
let readyPromise = null;

function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await connectDB();
      const result = await syncPages();
      if (result.created.length) console.log(`[rbac] registered new pages: ${result.created.join(', ')}`);
      const { applySalesPersonScope } = require('./scripts/seedRetailDemo');
      for (const line of await applySalesPersonScope()) console.log(`[${line}`.replace('[rbac: ', '[rbac] '));
      return result;
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

module.exports = { ensureReady };
