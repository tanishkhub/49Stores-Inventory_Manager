const fs = require('fs');
const path = require('path');
const { ACTIONS } = require('./actions');

const PAGES_DIR = path.join(__dirname, 'pages');
const PAGE_FILE_SUFFIX = '.pages.js';
const PAGE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Reads every rbac/pages/*.pages.js file and returns the validated, merged list of page definitions.
function loadPageDefinitions(dir = PAGES_DIR) {
  const byKey = new Map();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(PAGE_FILE_SUFFIX)).sort();
  for (const file of files) {
    const defs = require(path.join(dir, file));
    if (!Array.isArray(defs)) throw new Error(`rbac/pages/${file} must export an array of page definitions`);
    for (const def of defs) {
      if (!def || !PAGE_KEY_PATTERN.test(def.key || '')) {
        throw new Error(`rbac/pages/${file}: invalid page key "${def && def.key}" (use kebab-case)`);
      }
      if (byKey.has(def.key)) {
        throw new Error(`Page key "${def.key}" is declared in both ${byKey.get(def.key).file} and ${file}`);
      }
      const actions = def.actions && def.actions.length ? def.actions : [...ACTIONS];
      const unknown = actions.filter((a) => !ACTIONS.includes(a));
      if (unknown.length) throw new Error(`rbac/pages/${file}: page "${def.key}" has unknown actions ${unknown.join(', ')}`);
      if (!actions.includes('view')) throw new Error(`rbac/pages/${file}: page "${def.key}" must support the "view" action`);
      byKey.set(def.key, {
        file,
        key: def.key,
        label: def.label || def.key,
        description: def.description || '',
        group: def.group || 'General',
        order: Number.isFinite(def.order) ? def.order : 100,
        actions,
        defaultPermissions: def.defaultPermissions || {},
      });
    }
  }
  return [...byKey.values()];
}

module.exports = { loadPageDefinitions, PAGE_KEY_PATTERN };
