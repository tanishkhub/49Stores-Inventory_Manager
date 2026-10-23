const fs = require('fs');
const path = require('path');
const express = require('express');

// Central route registry. Every `<name>.routes.js` file in this directory is mounted
// automatically at `/api/<name>`, so feature modules never need to edit this file.
//
// A route module may export either:
//   - an express.Router()                    -> mounted at /api/<name>
//   - { router, basePath: '/custom-path' }   -> mounted at /api/custom-path
const ROUTE_FILE_SUFFIX = '.routes.js';

function loadRouteModules(dir = __dirname) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(ROUTE_FILE_SUFFIX))
    .sort()
    .map((file) => {
      const name = file.slice(0, -ROUTE_FILE_SUFFIX.length);
      const exported = require(path.join(dir, file));
      const router = typeof exported === 'function' ? exported : exported.router;
      if (typeof router !== 'function') {
        throw new Error(`${file} must export an express.Router or { router, basePath }`);
      }
      const basePath = (exported.basePath || `/${name}`).replace(/\/+$/, '') || '/';
      return { file, basePath, router };
    });
}

function buildApiRouter() {
  const api = express.Router();
  const modules = loadRouteModules();
  const seen = new Map();
  for (const { file, basePath, router } of modules) {
    if (seen.has(basePath)) {
      throw new Error(`Route base path ${basePath} is declared by both ${seen.get(basePath)} and ${file}`);
    }
    seen.set(basePath, file);
    api.use(basePath, router);
  }
  api.mountedRoutes = modules.map(({ file, basePath }) => ({ file, basePath: `/api${basePath}` }));
  return api;
}

module.exports = { buildApiRouter, loadRouteModules };
