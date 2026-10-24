const { connectDB } = require('./config/db');
const { syncPages } = require('./rbac/syncPages');

// Connects to MongoDB and registers any new page definitions (rbac/pages/*.pages.js).
// Safe to call many times; the work happens once per process (or per warm serverless instance).
let readyPromise = null;
let syncPromise = null;

function runSync() {
  return (async () => {
    const result = await syncPages();
    if (result.created.length) console.log(`[rbac] registered new pages: ${result.created.join(', ')}`);
    const { applySalesPersonScope } = require('./scripts/seedRetailDemo');
    for (const line of await applySalesPersonScope()) console.log(`[${line}`.replace('[rbac: ', '[rbac] '));
    return result;
  })();
}

function ensureReady({ deferSync = false } = {}) {
  if (!readyPromise) {
    readyPromise = connectDB().catch((err) => {
      readyPromise = null;
      throw err;
    });
    syncPromise = readyPromise.then(runSync);
    if (deferSync) {
      // Serverless: page sync + the one-time permission migration are idempotent and
      // already applied in any live DB — don't hold the first request hostage to them.
      syncPromise.catch((err) => console.error('[bootstrap] background sync failed:', err.message));
    } else {
      readyPromise = syncPromise.catch((err) => {
        readyPromise = null;
        throw err;
      });
    }
  }
  return readyPromise;
}

module.exports = { ensureReady };
