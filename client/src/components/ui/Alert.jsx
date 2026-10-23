export default function Alert({ children, tone = 'error', className = '' }) {
  if (!children) return null;
  const tones = {
    error: 'border-red-200 bg-red-50 text-red-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    info: 'border-brand-100 bg-brand-50 text-brand-700',
  };
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]} ${className}`}>{children}</div>;
}
