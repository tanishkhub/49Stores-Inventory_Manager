const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const { buildApiRouter } = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (curl, Postman) that send no Origin header.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  const api = buildApiRouter();
  app.use('/api', api);
  app.locals.mountedRoutes = api.mountedRoutes;

  app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>49Stores API</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:system-ui,sans-serif;color:#fff}
    .card{text-align:center;padding:3rem 2.5rem;max-width:420px}
    .emoji{font-size:4rem;margin-bottom:1.5rem}
    h1{font-size:1.6rem;font-weight:700;margin-bottom:.75rem;color:#facc15}
    p{color:#a1a1aa;line-height:1.6;margin-bottom:2rem;font-size:.95rem}
    a{display:inline-block;background:#facc15;color:#0a0a0a;font-weight:700;padding:.65rem 1.75rem;border-radius:9999px;text-decoration:none;font-size:.95rem;transition:opacity .15s}
    a:hover{opacity:.85}
    .sub{margin-top:1.5rem;font-size:.8rem;color:#52525b}
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">🗺️</div>
    <h1>Looks like you're lost!</h1>
    <p>This is the 49Stores API server. The app you're looking for lives somewhere else.</p>
    <a href="https://inventory.49stores.com">Take me to 49Stores →</a>
    <p class="sub">API health: <a href="/api/health" style="color:#facc15;background:none;padding:0;font-weight:500">/api/health</a></p>
  </div>
</body>
</html>`);
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
