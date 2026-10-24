import { Package } from 'lucide-react';

// Cloudinary delivery URLs get a small CDN-cached rendition (auto format + quality);
// base64 data URLs and anything else pass through untouched.
function thumbSrc(src) {
  return src && src.includes('res.cloudinary.com') && src.includes('/upload/')
    ? src.replace('/upload/', '/upload/w_160,h_160,c_fill,f_auto,q_auto/')
    : src;
}

export default function ProductThumb({ src, size = 'h-10 w-10', className = '' }) {
  if (src) return <img src={thumbSrc(src)} alt="" loading="lazy" className={`${size} shrink-0 rounded-lg border border-slate-200 bg-white object-cover ${className}`} />;
  return (
    <span className={`${size} inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 ${className}`}>
      <Package className="h-1/2 w-1/2" />
    </span>
  );
}
