// Client-side image handling for products: the file is resized on a canvas and stored as a Base64
// data URL string in MongoDB (Product.imageBase64 + a small thumbnailBase64 for lists).
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_CHARS = 880_000;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file could not be read as an image'));
    };
    img.src = url;
  });
}

function render(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function fileToProductImages(file) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (PNG, JPEG, WebP or GIF)');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Image is larger than 15 MB');
  const img = await loadImage(file);
  let imageBase64 = '';
  for (const [side, q] of [[900, 0.85], [800, 0.75], [640, 0.7], [480, 0.65]]) {
    imageBase64 = render(img, side, q);
    if (imageBase64.length <= MAX_IMAGE_CHARS) break;
  }
  return { imageBase64, thumbnailBase64: render(img, 160, 0.7) };
}
