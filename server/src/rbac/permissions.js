const Page = require('../models/Page');
const Permission = require('../models/Permission');
const { ACTIONS } = require('./actions');

const ALL_TRUE = Object.freeze(Object.fromEntries(ACTIONS.map((a) => [a, true])));

// Returns { [pageKey]: { view, add, update, delete } } for the given role, read live from MongoDB.
// Actions a page does not support are always false.
async function getRolePermissions(role) {
  const pages = await Page.find({ isActive: true }).lean();
  const result = {};
  if (role && role.isSuperAdmin) {
    for (const page of pages) {
      result[page.key] = Object.fromEntries(ACTIONS.map((a) => [a, page.actions.includes(a)]));
    }
    return result;
  }
  const records = role ? await Permission.find({ role: role._id }).lean() : [];
  const byPage = new Map(records.map((r) => [r.pageKey, r]));
  for (const page of pages) {
    const rec = byPage.get(page.key) || {};
    const view = Boolean(rec.view);
    result[page.key] = Object.fromEntries(
      ACTIONS.map((a) => [a, view && page.actions.includes(a) && Boolean(rec[a])]),
    );
  }
  return result;
}

async function hasPermission(role, pageKey, action = 'view') {
  if (!role) return false;
  const page = await Page.findOne({ key: pageKey, isActive: true }).lean();
  if (!page || !page.actions.includes(action)) return false;
  if (role.isSuperAdmin) return true;
  const rec = await Permission.findOne({ role: role._id, pageKey }).lean();
  return Boolean(rec && rec.view && rec[action]);
}

module.exports = { getRolePermissions, hasPermission, ALL_TRUE };
