// Thin fetch wrapper for the Express API. Feature modules import { api } from '@/lib/api'
// (relative path) and call api.get('/inventory', { params: { page: 2 } }).
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
const TOKEN_KEY = 'inventory_poc.token';

export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

// Stale-while-revalidate cache for GET requests.
// Returns stale data immediately and revalidates in the background.
const GET_CACHE_TTL = 30_000;
const getCache = new Map(); // cacheKey -> { data, fetchedAt, promise }

export function bustGetCache(pathPrefix) {
  for (const key of getCache.keys()) {
    if (key.startsWith(pathPrefix)) getCache.delete(key);
  }
}

function buildUrl(path, params) {
  const url = new URL(`${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, window.location.origin);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  return url.toString();
}

async function request(method, path, { body, params, signal, headers } = {}) {
  const token = tokenStore.get();
  const url = buildUrl(path, params);

  // Stale-while-revalidate for GET requests (skip for abortable calls like infinite lists).
  if (method === 'GET' && !signal) {
    const cacheKey = url + (token || '');
    const entry = getCache.get(cacheKey);
    // In-flight: return the existing promise so all callers share one request.
    if (entry?.promise) return entry.promise;
    // Fresh cache hit.
    if (entry && Date.now() - entry.fetchedAt <= GET_CACHE_TTL) return entry.data;
    // Stale or missing: fetch, store promise so concurrent calls share it.
    const promise = fetchRaw(method, url, { body, signal, headers, token })
      .then((data) => { getCache.set(cacheKey, { data, fetchedAt: Date.now(), promise: null }); return data; })
      .catch((err) => { getCache.delete(cacheKey); throw err; });
    getCache.set(cacheKey, { data: entry?.data ?? null, fetchedAt: entry?.fetchedAt ?? 0, promise });
    // Always return the in-flight promise: returning stale data here would leave the
    // caller permanently on old data — the fresh response would only populate the cache
    // and never reach the component that asked for it.
    return promise;
  }

  return fetchRaw(method, url, { body, signal, headers, token });
}

async function fetchRaw(method, url, { body, signal, headers, token } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, `Cannot reach the API at ${BASE_URL}. Is the server running?`);
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, data?.error?.message || res.statusText || 'Request failed', data);
  }
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  delete: (path, opts) => request('DELETE', path, opts),
};
