// One-off: move embedded product images (imageBase64/thumbnailBase64) to Cloudinary and
// store delivery URLs instead. Idempotent — only processes products that still have
// imageBase64. Requires CLOUDINARY_* env vars.
//   node src/scripts/migrateImagesToCloudinary.js          # migrate
//   node src/scripts/migrateImagesToCloudinary.js --dry    # preview only
//   MONGODB_URI=<prod uri> node src/scripts/migrateImagesToCloudinary.js
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const Product = require('../models/Product');
const { uploadDataUri } = require('../services/cloudinary');

async function main() {
  if (!env.cloudinary.enabled) {
    console.error('[migrate] CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET are not set');
    process.exit(1);
  }
  const dry = process.argv.includes('--dry');
  await connectDB();
  const products = await Product.find({ imageBase64: { $exists: true, $ne: '' } })
    .select('+imageBase64 sku name imagePublicId')
    .lean();
  console.log(`[migrate] ${products.length} product(s) with embedded images${dry ? ' (dry run)' : ''}`);
  let done = 0;
  for (const p of products) {
    if (dry) {
      console.log(`[migrate] would upload ${p.sku} "${p.name}" (~${Math.round(p.imageBase64.length / 1024)}KB)`);
      continue;
    }
    const publicId = `49stores/products/${String(p.sku).toLowerCase().replace(/[^a-z0-9._-]/g, '-')}-${String(p._id).slice(-6)}`;
    const { secure_url, public_id } = await uploadDataUri(p.imageBase64, { publicId });
    await Product.updateOne(
      { _id: p._id },
      { $set: { imageUrl: secure_url, imagePublicId: public_id, imageBase64: '', thumbnailBase64: '' } },
    );
    done += 1;
    console.log(`[migrate] ${p.sku} -> ${secure_url}`);
  }
  await disconnectDB();
  console.log(`[migrate] done${dry ? ' (dry run, nothing written)' : ` — ${done} product(s) migrated`}`);
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
