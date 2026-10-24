const crypto = require('crypto');
const env = require('../config/env');

// Signed direct-to-Cloudinary uploads + asset cleanup. The API only ever handles
// signatures — image bytes travel browser <-> Cloudinary, never through this server.
const UPLOAD_FOLDER = '49stores/products';

function apiBase() {
  return `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}`;
}

// Cloudinary signature: alphabetical `k=v` pairs joined by `&`, SHA-1 of that string
// with the API secret appended (https://cloudinary.com/documentation/upload_images#generating_authentication_signatures).
function signatureFor(params, apiSecret) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

// Everything a browser needs to POST the file itself to /v1_1/<cloud>/image/upload.
function signUpload({ folder = UPLOAD_FOLDER, publicId } = {}) {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  const params = { folder, timestamp: Math.round(Date.now() / 1000) };
  if (publicId) params.public_id = publicId;
  return { ...params, signature: signatureFor(params, apiSecret), apiKey, cloudName };
}

// Upload a base64 data URI server-side (used by the migration script).
// When publicId is given it must NOT be combined with folder — public_id already
// carries its full path, otherwise Cloudinary nests them (folder/folder/name).
async function uploadDataUri(dataUri, { folder = UPLOAD_FOLDER, publicId } = {}) {
  const { apiKey, apiSecret } = env.cloudinary;
  const params = { timestamp: Math.round(Date.now() / 1000) };
  if (publicId) params.public_id = publicId;
  else params.folder = folder;
  const form = new FormData();
  form.append('file', dataUri);
  form.append('api_key', apiKey);
  form.append('timestamp', String(params.timestamp));
  form.append('signature', signatureFor(params, apiSecret));
  if (publicId) form.append('public_id', publicId);
  else form.append('folder', folder);
  const res = await fetch(`${apiBase()}/image/upload`, { method: 'POST', body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Cloudinary upload failed (${res.status})`);
  return data;
}

// Permanently deletes an asset. Called when a product image is replaced/removed or a
// product is deleted, so the free-tier storage doesn't fill with orphans.
async function destroyAsset(publicId) {
  if (!env.cloudinary.enabled || !publicId) return;
  const auth = Buffer.from(`${env.cloudinary.apiKey}:${env.cloudinary.apiSecret}`).toString('base64');
  const res = await fetch(`${apiBase()}/resources/image/upload`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams([['public_ids[]', publicId]]),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Cloudinary destroy failed (${res.status})`);
  return data;
}

// Asset deletion must never break a product write — fire and forget, log on failure.
function destroyAssetSoon(publicId) {
  if (!publicId) return;
  destroyAsset(publicId).catch((err) => console.warn(`[cloudinary] destroy ${publicId} failed:`, err.message));
}

module.exports = { UPLOAD_FOLDER, signUpload, uploadDataUri, destroyAsset, destroyAssetSoon };
