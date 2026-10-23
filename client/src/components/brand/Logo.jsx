import { APP_NAME, LOGO_URL } from '../../config/brand';

// Use this everywhere the brand logo appears (sidebar, login, receipts, labels, payment screens).
//   <Logo size={40} />              logo only
//   <Logo size={32} withName />     logo + app name
export default function Logo({ size = 40, withName = false, className = '', imgClassName = '', nameClassName = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src={LOGO_URL}
        alt={withName ? '' : APP_NAME}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`object-contain select-none ${imgClassName}`}
        draggable="false"
      />
      {withName && <span className={`font-semibold tracking-tight text-slate-900 ${nameClassName}`}>{APP_NAME}</span>}
    </span>
  );
}
