const Page = require('../models/Page');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const { loadPageDefinitions } = require('./pageRegistry');

// Upserts the page catalog from code and creates default Permission records for (role, page) pairs
// that do not exist yet. Existing Permission records are never modified, so runtime changes made by
// a Super Admin survive restarts and re-seeding.
async function syncPages() {
  const defs = loadPageDefinitions();
  const existingKeys = new Set((await Page.find({}, { key: 1 }).lean()).map((p) => p.key));
  const created = defs.filter((d) => !existingKeys.has(d.key)).map((d) => d.key);

  if (defs.length) {
    await Page.bulkWrite(
      defs.map((d) => ({
        updateOne: {
          filter: { key: d.key },
          update: {
            $set: {
              label: d.label,
              description: d.description,
              group: d.group,
              order: d.order,
              actions: d.actions,
              isActive: true,
            },
          },
          upsert: true,
        },
      })),
    );
  }
  await Page.updateMany({ key: { $nin: defs.map((d) => d.key) } }, { $set: { isActive: false } });

  const roles = await Role.find({ isSuperAdmin: { $ne: true } }).lean();
  const permissionOps = [];
  for (const def of defs) {
    for (const role of roles) {
      const granted = (def.defaultPermissions[role.key] || []).filter((a) => def.actions.includes(a));
      if (granted.length && !granted.includes('view')) granted.push('view');
      permissionOps.push({
        updateOne: {
          filter: { role: role._id, pageKey: def.key },
          update: {
            $setOnInsert: {
              view: granted.includes('view'),
              add: granted.includes('add'),
              update: granted.includes('update'),
              delete: granted.includes('delete'),
            },
          },
          upsert: true,
        },
      });
    }
  }
  if (permissionOps.length) await Permission.bulkWrite(permissionOps);

  return { pages: defs.map((d) => d.key), created };
}

module.exports = { syncPages };
