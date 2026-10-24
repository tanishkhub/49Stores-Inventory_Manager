import { useCallback, useEffect, useRef, useState } from 'react';
import { BadgePercent, Camera, Minus, Plus, Printer, RotateCcw, ScanBarcode, ShoppingCart, Sparkles, Trash2, UserRound } from 'lucide-react';
import { api } from '../../../lib/api';
import { usePermission } from '../../../auth/hooks';
import { useApi } from '../../../hooks/useApi';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { Skeleton } from '../../../components/skeleton/Skeleton';
import PageHeader from '../../../components/ui/PageHeader';
import Modal from '../../../components/ui/Modal';
import Alert from '../../../components/ui/Alert';
import ProductThumb from '../../shared/ProductThumb';
import PrintPortal from '../../shared/PrintPortal';
import { formatDate, formatMoney } from '../../shared/format';
import Receipt from '../components/Receipt';
import CameraScanner from '../components/CameraScanner';
import ReturnsModal from '../components/ReturnsModal';
import { describeDiscount } from '../../memberships/discount';

const STORE_KEY = 'inventory_poc.posStore';
const hasPhone = (phone) => phone.replace(/\D/g, '').length >= 7;
const EMPTY_CUSTOMER = { phone: '', name: '' };

export default function PosPage() {
  const perm = usePermission('pos');
  const stores = useApi('/pos/stores');
  const storeItems = stores.data?.items || [];
  const [storeId, setStoreId] = useState(() => localStorage.getItem(STORE_KEY) || '');
  const activeStoreId = storeItems.some((s) => s._id === storeId) ? storeId : storeItems[0]?._id || '';
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState({ busy: false, error: '', notice: '', choices: [] });
  const [suggestions2, setSuggestions2] = useState([]);
  const [sugBusy, setSugBusy] = useState(false);
  const sugRef = useRef(null);
  const debouncedCode = useDebouncedValue(code, 220);
  const [cart, setCart] = useState([]); // [{ product, quantity }]
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [returning, setReturning] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [checkout, setCheckout] = useState({ busy: false, error: '' });
  const [sale, setSale] = useState(null);
  const [camera, setCamera] = useState(false);
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [membership, setMembership] = useState(null); // { planId, months } bought in this sale
  const [planPick, setPlanPick] = useState('');
  const plans = useApi('/pos/memberships');
  const planItems = plans.data?.items || [];
  const memberPlan = membership && planItems.find((p) => p._id === membership.planId);
  const memberOption = memberPlan?.options.find((o) => o.months === membership.months);
  const inputRef = useRef(null);
  const suggestions = useApi('/pos/suggestions', {
    params: { storeId: activeStoreId, phone: returning ? customer.phone : undefined, limit: 8 },
    enabled: Boolean(activeStoreId),
  });

  const subtotal = cart.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const units = cart.reduce((s, l) => s + l.quantity, 0);

  // Server-side pricing (member discount + membership fee) so the cashier sees the exact bill.
  const quoteKey = JSON.stringify({
    storeId: activeStoreId,
    items: cart.map((l) => ({ productId: l.product._id, quantity: l.quantity })),
    membership,
    customer: hasPhone(customer.phone) ? { phone: customer.phone } : undefined,
  });
  const debouncedQuoteKey = useDebouncedValue(quoteKey, 600);
  const [quote, setQuote] = useState(null);
  useEffect(() => {
    const body = JSON.parse(debouncedQuoteKey);
    if (!body.storeId || (!body.items.length && !body.membership)) return undefined;
    let cancelled = false;
    api.post('/pos/quote', body)
      .then((q) => !cancelled && setQuote({ ...q, key: debouncedQuoteKey }))
      .catch(() => !cancelled && setQuote(null));
    return () => { cancelled = true; };
  }, [debouncedQuoteKey]);
  const priced = quote?.key === quoteKey ? quote : null;
  const discount = priced?.discount || 0;
  const membershipFee = memberOption?.price || 0;
  const total = priced ? priced.total : subtotal + membershipFee;
  const canCheckout = (cart.length > 0 || Boolean(membership)) && (!membership || hasPhone(customer.phone));

  const focusScan = () => setTimeout(() => inputRef.current?.focus(), 0);

  // Live name suggestions as user types
  useEffect(() => {
    const q = debouncedCode.trim();
    if (!q || q.length < 2 || !activeStoreId) { setSuggestions2([]); return undefined; }
    let cancelled = false;
    setSugBusy(true);
    api.get('/pos/lookup', { params: { q, storeId: activeStoreId } })
      .then((res) => { if (!cancelled) setSuggestions2(res.items?.slice(0, 6) || []); })
      .catch(() => { if (!cancelled) setSuggestions2([]); })
      .finally(() => { if (!cancelled) setSugBusy(false); });
    return () => { cancelled = true; };
  }, [debouncedCode, activeStoreId]);

  // A USB scanner "types" the code and presses Enter. Route stray keystrokes to the scan box so
  // scans work even when nothing is focused.
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const idle = !el || el === document.body || el.tagName === 'BUTTON';
      if (idle && !sale && !camera && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sale, camera]);

  function chooseStore(id) {
    if (cart.length && !window.confirm('Switching store clears the current cart. Continue?')) return;
    setCart([]);
    setMembership(null);
    setStoreId(id);
    localStorage.setItem(STORE_KEY, id);
  }

  const addProduct = useCallback((product) => {
    setCart((c) => {
      const existing = c.find((l) => l.product._id === product._id);
      const nextQty = (existing?.quantity || 0) + 1;
      setLookup({ busy: false, error: '', choices: [], notice: nextQty > product.stock ? `Only ${product.stock} of ${product.name} in stock at this store.` : `Added ${product.name}` });
      if (existing) return c.map((l) => (l.product._id === product._id ? { ...l, product, quantity: nextQty } : l));
      return [{ product, quantity: 1 }, ...c];
    });
  }, []);

  async function resolve(value) {
    setSuggestions2([]);
    const q = value.trim();
    if (!q || !activeStoreId) return;
    setLookup({ busy: true, error: '', notice: '', choices: [] });
    try {
      const res = await api.get('/pos/lookup', { params: { q, storeId: activeStoreId } });
      if (res.match) addProduct(res.match);
      else if (res.items.length) setLookup({ busy: false, error: '', notice: '', choices: res.items });
      else setLookup({ busy: false, error: `No product matches "${q}"`, notice: '', choices: [] });
      setCode('');
    } catch (err) {
      setLookup({ busy: false, error: err.message, notice: '', choices: [] });
    }
    focusScan();
  }

  function setQty(id, quantity) {
    setCart((c) => (quantity <= 0 ? c.filter((l) => l.product._id !== id) : c.map((l) => (l.product._id === id ? { ...l, quantity } : l))));
  }

  async function checkPhone() {
    const digits = customer.phone.replace(/\D/g, '');
    if (digits.length < 7) return setReturning(null);
    try {
      const { customer: found } = await api.get('/pos/customer', { params: { phone: customer.phone } });
      setReturning(found);
      if (found?.name && !customer.name) setCustomer((c) => ({ ...c, name: found.name }));
    } catch {
      setReturning(null);
    }
    return undefined;
  }

  async function onCheckout() {
    setCheckout({ busy: true, error: '' });
    try {
      const created = await api.post('/pos/sales', {
        storeId: activeStoreId,
        paymentMethod,
        items: cart.map((l) => ({ productId: l.product._id, quantity: l.quantity })),
        membership: membership || undefined,
        customer: customer.phone.trim() ? customer : undefined,
      });
      setSale(await api.get(`/pos/sales/${created._id}`));
      setCheckout({ busy: false, error: '' });
    } catch (err) {
      setCheckout({ busy: false, error: err.message });
    }
  }

  function newSale() {
    setSale(null);
    setCart([]);
    setMembership(null);
    setPlanPick('');
    setCustomer(EMPTY_CUSTOMER);
    setReturning(null);
    setPaymentMethod('cash');
    setLookup({ busy: false, error: '', notice: '', choices: [] });
    suggestions.reload();
    focusScan();
  }

  if (stores.loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;
  if (!storeItems.length) {
    return (
      <div>
        <PageHeader title="Point of Sale" />
        <Alert tone="info">{stores.error?.message || 'You are not assigned to any active store. Ask an admin to assign you on the Users page.'}</Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Point of Sale"
        description="Scan with a USB scanner or camera, or type a barcode / SKU / product ID / name and press Enter."
        actions={
          <div className="flex flex-wrap gap-2">
            {perm.add && (
              <button type="button" className="btn-secondary" onClick={() => setReturnsOpen(true)}>
                <RotateCcw className="h-4 w-4" /> Return / exchange
              </button>
            )}
            <select className="input w-auto min-w-52" value={activeStoreId} onChange={(e) => chooseStore(e.target.value)} aria-label="Store">
              {storeItems.map((s) => (
                <option key={s._id} value={s._id}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="card p-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                resolve(code);
              }}
            >
              <label className="relative block flex-1">
                <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputRef}
                  autoFocus
                  className="input py-3 pl-11 text-base"
                  placeholder="Scan or type barcode, SKU, ID or name…"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setLookup({ busy: false, error: '', notice: '', choices: [] }); }}
                  onKeyDown={(e) => e.key === 'Escape' && setSuggestions2([])}
                  autoComplete="off"
                  aria-label="Scan or search product"
                />
                {suggestions2.length > 0 && (
                  <div ref={sugRef} className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                    {sugBusy && <p className="px-3 py-2 text-xs text-slate-400">Searching…</p>}
                    {suggestions2.map((p) => (
                      <button
                        key={p._id}
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { addProduct(p); setCode(''); setSuggestions2([]); focusScan(); }}
                      >
                        <ProductThumb src={p.imageUrl || p.thumbnailBase64} size="h-8 w-8" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block truncate font-mono text-xs text-slate-500">{p.sku} · {p.barcode}</span>
                        </span>
                        <span className="text-right">
                          <span className="block font-medium">{formatMoney(p.price)}</span>
                          <span className={`block text-xs ${p.stock > 0 ? 'text-slate-500' : 'text-red-600'}`}>{p.stock} in stock</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <button type="submit" className="btn-primary px-4" disabled={lookup.busy || !code.trim()}>
                {lookup.busy ? 'Looking up…' : 'Add'}
              </button>
              <button type="button" className="btn-secondary px-3" onClick={() => setCamera(true)} title="Scan with camera" aria-label="Scan with camera">
                <Camera className="h-5 w-5" />
              </button>
            </form>
            <div className="mt-2 min-h-5 text-sm">
              {lookup.error && <span className="text-red-600">{lookup.error}</span>}
              {lookup.notice && <span className={lookup.notice.startsWith('Only') ? 'text-amber-600' : 'text-emerald-600'}>{lookup.notice}</span>}
            </div>
            {lookup.choices.length > 0 && (
              <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                <p className="px-3 py-2 text-xs font-medium text-slate-500">Several products match — pick one:</p>
                {lookup.choices.map((p) => (
                  <button key={p._id} type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { addProduct(p); focusScan(); }}>
                    <ProductThumb src={p.imageUrl || p.thumbnailBase64} size="h-8 w-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate font-mono text-xs text-slate-500">{p.sku} · {p.barcode}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-medium">{formatMoney(p.price)}</span>
                      <span className={`block text-xs ${p.stock > 0 ? 'text-slate-500' : 'text-red-600'}`}>{p.stock} in stock</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {suggestions.data?.items.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Sparkles className="h-4 w-4 text-accent-500" /> {returning ? `Quick add for ${returning.name || 'this customer'}` : 'Often bought here'}
              </h2>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {suggestions.data.items.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    className="flex w-40 shrink-0 items-center gap-2 rounded-lg border border-slate-200 p-2 text-left text-sm hover:border-brand-600 hover:bg-brand-50"
                    onClick={() => { addProduct(p); focusScan(); }}
                    title={`${p.orders} recent order${p.orders === 1 ? '' : 's'}`}
                  >
                    <ProductThumb src={p.imageUrl || p.thumbnailBase64} size="h-9 w-9" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block text-xs text-slate-500">{formatMoney(p.price)} · <span className={p.reason === 'Their usual' ? 'font-medium text-slate-900' : ''}>{p.reason}</span></span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ShoppingCart className="h-4 w-4" /> Cart</h2>
              {(cart.length > 0 || membership) && <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => { setCart([]); setMembership(null); }}>Clear cart</button>}
            </div>
            {!cart.length && !membership && <p className="p-8 text-center text-sm text-slate-500">Scan a product to start a sale.</p>}
            <ul className="divide-y divide-slate-100">
              {cart.map(({ product: p, quantity }) => (
                <li key={p._id} className="flex items-start gap-3 px-4 py-3 sm:items-center">
                  <ProductThumb src={p.imageUrl || p.thumbnailBase64} />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatMoney(p.price)} · <span className={quantity > p.stock ? 'font-medium text-amber-600' : ''}>{p.stock} in stock</span>
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1">
                        <button type="button" className="rounded-md border border-slate-200 p-1.5 hover:bg-slate-100" onClick={() => setQty(p._id, quantity - 1)} aria-label="Decrease quantity"><Minus className="h-4 w-4" /></button>
                        <input className="input w-14 px-1 py-1 text-center" type="number" min="1" value={quantity} onChange={(e) => setQty(p._id, Math.max(1, Math.floor(Number(e.target.value)) || 1))} aria-label={`Quantity of ${p.name}`} />
                        <button type="button" className="rounded-md border border-slate-200 p-1.5 hover:bg-slate-100" onClick={() => setQty(p._id, quantity + 1)} aria-label="Increase quantity"><Plus className="h-4 w-4" /></button>
                      </div>
                      <span className="w-24 text-right font-semibold tabular-nums">{formatMoney(p.price * quantity)}</span>
                    </div>
                  </div>
                  <button type="button" className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => setQty(p._id, 0)} aria-label={`Remove ${p.name}`}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
              {memberPlan && memberOption && (
                <li className="flex items-center gap-3 bg-accent-300/20 px-4 py-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-400 text-slate-900"><BadgePercent className="h-6 w-6" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">Membership: {memberPlan.name}</p>
                    <p className="text-xs text-slate-600">
                      {memberOption.months} month{memberOption.months === 1 ? '' : 's'}
                      {priced?.membership ? ` · valid till ${formatDate(priced.membership.endsAt)}` : ''}
                    </p>
                  </div>
                  <span className="w-24 text-right font-semibold tabular-nums">{formatMoney(memberOption.price)}</span>
                  <button type="button" className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => setMembership(null)} aria-label="Remove membership"><Trash2 className="h-4 w-4" /></button>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="card h-fit space-y-4 p-4 lg:sticky lg:top-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><UserRound className="h-4 w-4" /> Customer (optional)</h2>
          <div>
            <label className="label" htmlFor="pos-phone">Phone</label>
            <input id="pos-phone" type="tel" className="input" value={customer.phone} onChange={(e) => { setCustomer({ ...customer, phone: e.target.value }); setReturning(null); }} onBlur={checkPhone} placeholder="+91 98765 43210" />
            {returning && (
              <p className="mt-1 text-xs text-emerald-700">Returning customer · {returning.visitCount} visit{returning.visitCount === 1 ? '' : 's'} · {formatMoney(returning.totalSpent)} spent</p>
            )}
            {returning?.membership?.active && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-300/40 px-2 py-0.5 text-xs font-medium text-slate-900">
                <BadgePercent className="h-3 w-3" /> Member ({returning.membership.memberships.map((m) => m.planName).join(', ')}) · valid till {formatDate(returning.membership.validUntil)}
              </p>
            )}
            {returning?.membership?.expiredAt && <p className="mt-1 text-xs text-slate-500">Membership expired on {formatDate(returning.membership.expiredAt)}</p>}
          </div>
          <div>
            <label className="label" htmlFor="pos-name">Name</label>
            <input id="pos-name" className="input" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} maxLength={100} />
          </div>
          {planItems.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900"><BadgePercent className="h-4 w-4 text-accent-500" /> {returning?.membership?.active ? 'Renew membership' : 'Add membership'}</p>
              <select className="input" value={planPick || membership?.planId || ''} onChange={(e) => setPlanPick(e.target.value)} aria-label="Membership plan">
                <option value="">Choose a plan…</option>
                {planItems.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
              {(() => {
                const plan = planItems.find((p) => p._id === (planPick || membership?.planId));
                if (!plan) return null;
                return (
                  <>
                    <p className="mt-2 text-xs text-slate-600">{describeDiscount(plan.discount)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {plan.options.map((o) => {
                        const selected = membership?.planId === plan._id && membership.months === o.months;
                        return (
                          <button key={o.months} type="button" className={`rounded-lg border px-2.5 py-1 text-sm ${selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 hover:bg-slate-50'}`} onClick={() => setMembership(selected ? null : { planId: plan._id, months: o.months })}>
                            {o.months} mo · {formatMoney(o.price)}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              {membership && !hasPhone(customer.phone) && <p className="mt-2 text-xs text-amber-700">Enter the customer's phone to sell a membership.</p>}
            </div>
          )}
          <div>
            <label className="label" htmlFor="pos-payment">Payment</label>
            <select id="pos-payment" className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between text-slate-600"><span>Items ({units})</span><span className="tabular-nums">{formatMoney(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-emerald-700"><span>{priced.discountLabel}</span><span className="tabular-nums">-{formatMoney(discount)}</span></div>}
            {membershipFee > 0 && <div className="flex justify-between text-slate-600"><span>Membership</span><span className="tabular-nums">{formatMoney(membershipFee)}</span></div>}
            <div className="flex justify-between text-lg font-semibold text-slate-900"><span>Total</span><span className="tabular-nums">{formatMoney(total)}</span></div>
          </div>
          <Alert>{checkout.error}</Alert>
          {perm.add ? (
            <button type="button" className="btn-primary w-full py-3 text-base" disabled={!canCheckout || checkout.busy} onClick={onCheckout}>
              {checkout.busy ? 'Processing…' : `Checkout ${formatMoney(total)}`}
            </button>
          ) : (
            <Alert tone="info">Your role can look up products but not create sales.</Alert>
          )}
        </div>
      </div>

      {camera && (
        <CameraScanner
          onClose={() => { setCamera(false); focusScan(); }}
          onDetected={(text) => {
            setCamera(false);
            resolve(text);
          }}
        />
      )}
      {sale && <ReceiptModal sale={sale} onClose={newSale} />}
      {returnsOpen && <ReturnsModal onClose={() => { setReturnsOpen(false); focusScan(); }} onDone={() => suggestions.reload()} />}
    </div>
  );
}

function ReceiptModal({ sale, onClose }) {
  const [variant, setVariant] = useState('thermal');
  return (
    <Modal
      open
      size="max-w-2xl"
      title={`Sale complete · ${sale.receiptNo}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>New sale</button>
          <button type="button" className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print bill</button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xl font-semibold text-slate-900">{formatMoney(sale.total)}</p>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
          {[['thermal', '80 mm receipt'], ['a4', 'A4 invoice']].map(([k, l]) => (
            <button key={k} type="button" className={`rounded-md px-3 py-1 ${variant === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setVariant(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg bg-slate-100 p-4">
        <div className="mx-auto w-fit bg-white p-3 shadow">
          <Receipt sale={sale} variant={variant} />
        </div>
      </div>
      <PrintPortal pageCss={variant === 'thermal' ? 'size: 80mm 297mm; margin: 4mm' : 'size: A4 portrait; margin: 15mm'}>
        <Receipt sale={sale} variant={variant} />
      </PrintPortal>
    </Modal>
  );
}
