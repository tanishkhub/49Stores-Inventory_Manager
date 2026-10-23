import { ApiError, tokenStore, UNAUTHORIZED_EVENT } from '../../lib/api';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

// Authenticated file download (the API needs the Bearer token, so a plain <a href> will not do).
export async function downloadFile(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, `Cannot reach the API at ${BASE_URL}. Is the server running?`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, body?.error?.message || 'Download failed', body);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'download';
  const blobUrl = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
