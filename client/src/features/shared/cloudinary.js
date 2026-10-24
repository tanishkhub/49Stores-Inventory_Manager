import { api } from '../../lib/api';

const CLOUDINARY_UPLOAD = (cloud) => `https://api.cloudinary.com/v1_1/${cloud}/image/upload`;

// Signed direct-to-Cloudinary upload: the API signs (/api/uploads/sign), then the
// browser POSTs the image bytes itself — they never pass through the app server.
export async function uploadToCloudinary(blob, { filename = 'product.jpg' } = {}) {
  const sig = await api.post('/uploads/sign', {});
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);
  const res = await fetch(CLOUDINARY_UPLOAD(sig.cloudName), { method: 'POST', body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Image upload failed (${res.status})`);
  return { imageUrl: data.secure_url, imagePublicId: data.public_id };
}

// Rewrites a Cloudinary delivery URL to request a transformed (CDN-cached) rendition.
export function cloudinaryUrl(url, transform) {
  if (!url || !url.includes('/upload/')) return url || '';
  return url.replace('/upload/', `/upload/${transform}/`);
}

// Square thumbnail for lists; auto format (WebP/AVIF) + auto quality.
export const thumbUrl = (url, px = 160) => cloudinaryUrl(url, `w_${px},h_${px},c_fill,f_auto,q_auto`);
// Contain-fit rendition for previews/detail views.
export const fullUrl = (url, px = 900) => cloudinaryUrl(url, `w_${px},f_auto,q_auto`);
