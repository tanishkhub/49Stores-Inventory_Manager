// Standard list pagination used by every list endpoint so the client's useInfiniteList hook
// can scroll-load any resource.
//
//   GET /api/<resource>?page=1&limit=20  ->  { items, page, limit, total, hasMore }
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePagination(query = {}, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

async function paginate(Model, filter, query, { sort = { createdAt: -1, _id: -1 }, select, populate, lean = true } = {}) {
  const { page, limit, skip } = parsePagination(query);
  let cursor = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) cursor = cursor.select(select);
  if (populate) cursor = cursor.populate(populate);
  if (lean) cursor = cursor.lean();
  const [items, total] = await Promise.all([cursor, Model.countDocuments(filter)]);
  return { items, page, limit, total, hasMore: skip + items.length < total };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { parsePagination, paginate, escapeRegex, DEFAULT_LIMIT, MAX_LIMIT };
