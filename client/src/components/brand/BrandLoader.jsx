import Logo from './Logo';

// Branded loading indicator (pulsing logo with a spinning ring). Use for full-page loads,
// payment processing, long exports, etc. For content placeholders prefer the Skeleton components.
export default function BrandLoader({ fullScreen = false, label = 'Loading', size = 56 }) {
  const content = (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4">
      <div className="relative grid place-items-center" style={{ width: size * 1.8, height: size * 1.8 }}>
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
        <Logo size={size} imgClassName="animate-logo-pulse" />
      </div>
      <p className="text-sm font-medium text-slate-500">{label}…</p>
    </div>
  );
  if (!fullScreen) return <div className="grid place-items-center py-16">{content}</div>;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-50">{content}</div>;
}
