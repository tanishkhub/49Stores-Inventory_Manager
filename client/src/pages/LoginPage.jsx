import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, LogIn, Mail, Package, ScanLine, ShoppingCart, Store, Users } from 'lucide-react';
import { useAuth } from '../auth/hooks';
import Logo from '../components/brand/Logo';
import BrandLoader from '../components/brand/BrandLoader';
import Alert from '../components/ui/Alert';
import { APP_NAME } from '../config/brand';

/* ------------------------------------------------------------------ */
/* Presentation-only constants. Nothing here touches auth behaviour.   */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { icon: Store, label: 'Stores' },
  { icon: Package, label: 'Stock' },
  { icon: ScanLine, label: 'Barcodes' },
  { icon: ShoppingCart, label: 'Point of sale' },
  { icon: Users, label: 'Customers' },
];

const BUBBLES = [
  { left: '6%', size: 14, dur: 16, delay: 0 },
  { left: '15%', size: 8, dur: 12, delay: 3 },
  { left: '26%', size: 20, dur: 20, delay: 6 },
  { left: '38%', size: 10, dur: 14, delay: 1 },
  { left: '49%', size: 16, dur: 18, delay: 8 },
  { left: '60%', size: 9, dur: 13, delay: 4 },
  { left: '71%', size: 22, dur: 22, delay: 2 },
  { left: '82%', size: 12, dur: 15, delay: 7 },
  { left: '91%', size: 18, dur: 19, delay: 5 },
];

const GRID_STYLE = {
  backgroundImage:
    'linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)',
  backgroundSize: '44px 44px',
  WebkitMaskImage: 'radial-gradient(ellipse at center, #000 25%, transparent 75%)',
  maskImage: 'radial-gradient(ellipse at center, #000 25%, transparent 75%)',
};

const DOTS_STYLE = {
  backgroundImage: 'radial-gradient(#94a3b8 1.2px, transparent 1.2px)',
  backgroundSize: '24px 24px',
  WebkitMaskImage: 'radial-gradient(ellipse at center, #000 20%, transparent 70%)',
  maskImage: 'radial-gradient(ellipse at center, #000 20%, transparent 70%)',
};

const LABEL = 'mb-2 block text-sm font-semibold text-slate-800';

const FIELD =
  'h-12 w-full rounded-xl border-2 border-slate-300 bg-slate-50 pl-12 text-base text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-500/25';

const FIELD_ICON =
  'pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors duration-200 group-focus-within:text-brand-600';

/* Self-contained keyframes so the page never depends on tailwind.config. */
const STYLES = `
.lp-root { --lp-ease: cubic-bezier(0.22, 0.9, 0.3, 1); }

@keyframes lp-up { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
@keyframes lp-pop { from { opacity: 0; transform: translateY(14px) scale(0.85); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes lp-card { from { opacity: 0; transform: translateY(32px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes lp-gradient { 0%, 100% { background-position: 0% 0%; } 50% { background-position: 100% 100%; } }
@keyframes lp-blob-a { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(70px, 50px) scale(1.18); } }
@keyframes lp-blob-b { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-60px, -70px) scale(1.22); } }
@keyframes lp-blob-c { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(50px, -40px) scale(0.85); } }
@keyframes lp-rise { 0% { transform: translateY(0) scale(0.6); opacity: 0; } 10% { opacity: 0.6; } 90% { opacity: 0.35; } 100% { transform: translateY(-115vh) scale(1.15); opacity: 0; } }
@keyframes lp-ring { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.7); opacity: 0; } }
@keyframes lp-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes lp-slide { from { background-position: 0% 0; } to { background-position: 200% 0; } }
@keyframes lp-shake { 10%, 90% { transform: translateX(-2px); } 20%, 80% { transform: translateX(4px); } 30%, 50%, 70% { transform: translateX(-8px); } 40%, 60% { transform: translateX(8px); } }
@keyframes lp-icon { from { opacity: 0; transform: rotate(-80deg) scale(0.5); } to { opacity: 1; transform: rotate(0) scale(1); } }
@keyframes lp-shine { 0% { transform: translateX(-160%) skewX(-20deg); } 35%, 100% { transform: translateX(480%) skewX(-20deg); } }

/* "backwards" fill (not "both") so hover transforms still work after the entrance ends */
.lp-in { animation: lp-up 0.7s var(--lp-ease) backwards; animation-delay: var(--d, 0ms); }
.lp-pop { animation: lp-pop 0.55s var(--lp-ease) backwards; animation-delay: var(--d, 0ms); }
.lp-card { animation: lp-card 0.8s var(--lp-ease) backwards; }
.lp-grow { transform-origin: center; animation: lp-grow 0.8s var(--lp-ease) backwards; animation-delay: var(--d, 0ms); }
.lp-icon { animation: lp-icon 0.25s var(--lp-ease) backwards; }
.lp-shake { animation: lp-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97); }

.lp-bg { background-size: 220% 220%; animation: lp-gradient 18s ease-in-out infinite; }
.lp-blob-a { animation: lp-blob-a 14s ease-in-out infinite; }
.lp-blob-b { animation: lp-blob-b 17s ease-in-out infinite; }
.lp-blob-c { animation: lp-blob-c 20s ease-in-out infinite; }

.lp-bubble {
  position: absolute;
  bottom: -40px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.3);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  animation: lp-rise var(--dur, 16s) linear infinite;
  animation-delay: var(--delay, 0s);
}

.lp-ring { animation: lp-ring 3.2s ease-out infinite; animation-delay: var(--d, 0s); }
.lp-bar { background-size: 200% 100%; animation: lp-slide 5s linear infinite; }

.lp-shine { transform: translateX(-160%) skewX(-20deg); }
.lp-btn:not(:disabled) .lp-shine { animation: lp-shine 4.5s ease-in-out 1.2s infinite; }

@media (prefers-reduced-motion: reduce) {
  .lp-root *, .lp-root *::before, .lp-root *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    animation-delay: 0ms !important;
    transition-duration: 0.001ms !important;
  }
}
`;

export default function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (status === 'loading') return <BrandLoader fullScreen label="Checking your session" />;
  if (status === 'authenticated') return <Navigate to={location.state?.from?.pathname || '/'} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.email, form.password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="lp-root relative grid min-h-screen overflow-hidden bg-slate-50 lg:grid-cols-2">
      <style>{STYLES}</style>

      {/* ============================ Brand panel ============================ */}
      <aside className="lp-bg relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute inset-0 opacity-25" style={GRID_STYLE} aria-hidden="true" />

        <div className="lp-blob-a absolute -left-24 -top-24 h-96 w-96 rounded-full bg-accent-400/25 blur-3xl" aria-hidden="true" />
        <div className="lp-blob-b absolute -bottom-32 -right-20 h-[30rem] w-[30rem] rounded-full bg-accent-400/20 blur-3xl" aria-hidden="true" />
        <div className="lp-blob-c absolute left-1/3 top-1/2 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />

        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {BUBBLES.map((b, i) => (
            <span
              key={i}
              className="lp-bubble"
              style={{ left: b.left, width: b.size, height: b.size, '--dur': `${b.dur}s`, '--delay': `${b.delay}s` }}
            />
          ))}
        </div>

        {/* Darkening layer keeps white text readable on any brand colour */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/15 to-black/35" aria-hidden="true" />

        <div className="relative z-10 flex flex-col items-center px-10 text-center">
          <div className="relative">
            <span className="lp-ring absolute inset-0 rounded-full border-2 border-white/60" aria-hidden="true" />
            <span className="lp-ring absolute inset-0 rounded-full border-2 border-white/40" style={{ '--d': '1.07s' }} aria-hidden="true" />
            <span className="lp-ring absolute inset-0 rounded-full border-2 border-white/30" style={{ '--d': '2.13s' }} aria-hidden="true" />
            <div className="animate-logo-enter relative grid place-items-center rounded-full bg-white p-7 shadow-2xl shadow-black/30 ring-8 ring-white/20">
              <Logo size={140} imgClassName="animate-logo-float drop-shadow-xl" />
            </div>
          </div>

          <h2
            className="lp-in mt-10 text-4xl font-extrabold tracking-tight text-white drop-shadow-lg xl:text-5xl"
            style={{ '--d': '250ms' }}
          >
            {APP_NAME}
          </h2>
          <span className="lp-grow mt-5 block h-1.5 w-16 rounded-full bg-accent-400" style={{ '--d': '500ms' }} aria-hidden="true" />
          <p className="lp-in mt-5 max-w-md text-lg leading-relaxed text-white drop-shadow-md" style={{ '--d': '600ms' }}>
            Stores, stock, barcodes, point of sale and customers in one place.
          </p>

          <ul className="mt-9 flex max-w-md flex-wrap justify-center gap-3">
            {FEATURES.map(({ icon: Icon, label }, i) => (
              <li
                key={label}
                className="lp-pop group flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-black/10 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:bg-white/25"
                style={{ '--d': `${750 + i * 90}ms` }}
              >
                <Icon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-125" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ============================= Form panel ============================ */}
      <main className="relative flex items-center justify-center overflow-hidden px-4 py-12 sm:px-8">
        {/* Branded band behind the card on small screens, where the brand panel is hidden */}
        <div className="absolute inset-x-0 top-0 h-60 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 lg:hidden" aria-hidden="true" />
        <div className="absolute inset-0 opacity-50" style={DOTS_STYLE} aria-hidden="true" />
        <div className="lp-blob-b absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-500/15 blur-3xl" aria-hidden="true" />
        <div className="lp-blob-a absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl" aria-hidden="true" />

        <div className="relative w-full max-w-md">
          <div className="lp-card relative overflow-hidden rounded-3xl bg-white p-7 shadow-2xl shadow-slate-900/15 ring-1 ring-slate-900/5 sm:p-10">
            <div
              className="lp-bar absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-600 via-accent-400 to-brand-600"
              aria-hidden="true"
            />

            <header className="mb-8 flex flex-col items-center text-center">
              <div className="animate-logo-enter rounded-2xl bg-white p-3 shadow-lg ring-1 ring-slate-200 lg:hidden">
                <Logo size={64} imgClassName="animate-logo-float" />
              </div>
              <h1
                className="lp-in mt-5 text-3xl font-extrabold tracking-tight text-slate-900 lg:mt-0"
                style={{ '--d': '200ms' }}
              >
                Sign in
              </h1>
              <p className="lp-in mt-2 text-base text-slate-600" style={{ '--d': '300ms' }}>
                Use the account your administrator created for you.
              </p>
            </header>

            <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
              {/* Remounts on each new error so the shake replays */}
              <div key={error || 'none'} className="lp-shake empty:hidden">
                <Alert>{error}</Alert>
              </div>

              <div className="lp-in" style={{ '--d': '400ms' }}>
                <label className={LABEL} htmlFor="email">Email</label>
                <div className="group relative">
                  <Mail className={FIELD_ICON} aria-hidden="true" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@company.com"
                    className={`${FIELD} pr-4`}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="lp-in" style={{ '--d': '500ms' }}>
                <label className={LABEL} htmlFor="password">Password</label>
                <div className="group relative">
                  <Lock className={FIELD_ICON} aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className={`${FIELD} pr-12`}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-1 right-1 grid w-10 place-items-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff key="hide" className="lp-icon h-5 w-5" /> : <Eye key="show" className="lp-icon h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="lp-in" style={{ '--d': '600ms' }}>
                <button
                  type="submit"
                  className="lp-btn group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-5 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-600/40 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:brightness-100"
                  disabled={submitting || !form.email || !form.password}
                >
                  <span
                    className="lp-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                    aria-hidden="true"
                  />
                  {submitting ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                  ) : (
                    <LogIn className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
                  )}
                  <span className="relative">{submitting ? 'Signing in…' : 'Sign in'}</span>
                </button>
              </div>
            </form>
          </div>

          <p className="lp-in mt-6 text-center text-xs text-slate-500" style={{ '--d': '800ms' }}>
            © {new Date().getFullYear()} {APP_NAME}
          </p>
        </div>
      </main>
    </div>
  );
}
