const env = require('./config/env');
const { createApp } = require('./app');
const { ensureReady } = require('./bootstrap');

async function start() {
  await ensureReady();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
    for (const { basePath, file } of app.locals.mountedRoutes) {
      console.log(`[routes] ${basePath.padEnd(24)} <- routes/${file}`);
    }
  });
}

start().catch((err) => {
  console.error('[server] failed to start:', err.message);
  if (/ECONNREFUSED|Server selection timed out|getaddrinfo/i.test(err.message)) {
    console.error(`[server] is MongoDB running at ${env.mongodbUri}? Start it (e.g. via MongoDB Compass / mongod) and retry.`);
  }
  process.exit(1);
});
