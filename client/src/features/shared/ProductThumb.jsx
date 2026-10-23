import { Package } from 'lucide-react';

export default function ProductThumb({ src, size = 'h-10 w-10', className = '' }) {
  if (src) return <img src={src} alt="" className={`${size} shrink-0 rounded-lg border border-slate-200 bg-white object-cover ${className}`} />;
  return (
    <span className={`${size} inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 ${className}`}>
      <Package className="h-1/2 w-1/2" />
    </span>
  );
}
