const Page = require('../models/Page');
const Permission = require('../models/Permission');
const { ACTIONS } = require('./actions');

const ALL_TRUE = Object.freeze(Object.fromEntries(ACTIONS.map((a) => [a, true])));

// Cache pages list and per-(roleId,pageKey,action) permission results in memory.
// Pages only change on deploy; permissions change rarely. TTL: 60 s.
const PAGE_CACHE_TTL = 60_000;
const PERM_CACHE_TTL = 60_000;
let pagesCache = null; // { pages: [], expiresAt }
const permCache = new Map(); // `${roleId}:${pageKey}:${action}` -> { result, expiresAt }

async function getActivePages() {
  if (pagesCache && Date.now() < pagesCache.expiresAt) return pagesCache.pages;
  const pages = await Page.find({ isActive: true }).lean();
  pagesCache = { pages, expiresAt: Date.now() + PAGE_CACHE_TTL };
  return pages;
}

function invalidatePermCache() {
  permCache.clear();
  pagesCache = null;
}

// Returns { [pageKey]: { view, add, update, delete } } for the given role, read live from MongoDB.
// Actions a page does not support are always false.
async function getRolePermissions(role) {
  const pages = await getActivePages();
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
  const cacheKey = `${role._id}:${pageKey}:${action}`;
  const cached = permCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.result;

  const pages = await getActivePages();
  const page = pages.find((p) => p.key === pageKey);
  if (!page || !page.actions.includes(action)) {
    permCache.set(cacheKey, { result: false, expiresAt: Date.now() + PERM_CACHE_TTL });
    return false;
  }
  if (role.isSuperAdmin) {
    permCache.set(cacheKey, { result: true, expiresAt: Date.now() + PERM_CACHE_TTL });
    return true;
  }
  const rec = await Permission.findOne({ role: role._id, pageKey }).lean();
  const result = Boolean(rec && rec.view && rec[action]);
  permCache.set(cacheKey, { result, expiresAt: Date.now() + PERM_CACHE_TTL });
  return result;
}

module.exports = { getRolePermissions, hasPermission, getActivePages, ALL_TRUE, invalidatePermCache };
