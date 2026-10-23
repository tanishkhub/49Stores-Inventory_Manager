process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadRouteModules } = require('../src/routes');
const { loadPageDefinitions } = require('../src/rbac/pageRegistry');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function write(dir, file, src) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), src);
}

describe('route registry', () => {
  it('mounts every *.routes.js file by name or by declared basePath', () => {
    const dir = path.join(tmp, 'routes');
    const expressPath = JSON.stringify(require.resolve('express'));
    write(dir, 'inventory.routes.js', `module.exports = require(${expressPath}).Router();`);
    write(dir, 'pos.routes.js', `module.exports = { basePath: '/point-of-sale', router: require(${expressPath}).Router() };`);
    write(dir, 'helper.js', 'module.exports = 1;');
    const mounted = loadRouteModules(dir).map(({ file, basePath }) => [file, basePath]);
    assert.deepEqual(mounted, [
      ['inventory.routes.js', '/inventory'],
      ['pos.routes.js', '/point-of-sale'],
    ]);
  });

  it('the real routes directory mounts the foundation modules', () => {
    const bases = loadRouteModules().map((m) => m.basePath);
    for (const base of ['/auth', '/health', '/pages', '/roles', '/users']) assert.ok(bases.includes(base), base);
  });
});

describe('page registry', () => {
  it('merges *.pages.js files and rejects duplicate keys', () => {
    const dir = path.join(tmp, 'pages');
    write(dir, 'a.pages.js', "module.exports = [{ key: 'inventory', label: 'Inventory' }];");
    write(dir, 'b.pages.js', "module.exports = [{ key: 'pos', label: 'POS', actions: ['view', 'add'] }];");
    const defs = loadPageDefinitions(dir);
    assert.deepEqual(defs.map((d) => [d.key, d.actions]), [
      ['inventory', ['view', 'add', 'update', 'delete']],
      ['pos', ['view', 'add']],
    ]);
    write(dir, 'c.pages.js', "module.exports = [{ key: 'pos', label: 'Duplicate' }];");
    assert.throws(() => loadPageDefinitions(dir), /declared in both/);
  });
});
