import { useState } from 'react';
import { Minus, Plus, Printer, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api } from '../../../lib/api';
import Modal from '../../../components/ui/Modal';
import Alert from '../../../components/ui/Alert';
import Logo from '../../../components/brand/Logo';
import { APP_NAME } from '../../../config/brand';
import PrintPortal from '../../shared/PrintPortal';
import { formatDate, formatDateTime, formatMoney } from '../../shared/format';

const unitPaid = (it) => (it.netTotal ?? it.lineTotal) / it.quantity;

// Return (refund) or exchange against an existing bill. The server re-checks the store's policy,
// the return window and the remaining quantities, so this UI is only a guide.
export default function ReturnsModal({ onClose, onDone }) {
  const [receiptNo, setReceiptNo] = useState('');
  const [found, setFound] = useState(null);
  const [qty, setQty] = useState({});
  const [type, setType] = useState('return');
  const [newItems, setNewItems] = useState([]);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ busy: false, error: '' });
  const [done, setDone] = useState(null);

  async function lookup(e) {
    e.preventDefault();
    setState({ busy: true, error: '' });
    try {
      const res = await api.get('/pos/returns/lookup', { params: { receiptNo } });
      setFound(res);
      setQty({});
      setNewItems([]);
      setType(res.policy.allowReturns ? 'return' : 'exchange');
      setState({ busy: false, error: '' });
    } catch (err) {
      setFound(null);
      setState({ busy: false, error: err.message });
    }
  }

  async function addNew(e) {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      const res = await api.get('/pos/lookup', { params: { q: code.trim(), storeId: found.sale.storeId } });
      const p = res.match || res.items?.[0];
      if (!p) throw new Error(`No product matches "${code}"`);
      setNewItems((items) => (items.some((i) => i.product._id === p._id) ? items.map((i) => (i.product._id === p._id ? { ...i, quantity: i.quantity + 1 } : i)) : [...items, { product: p, quantity: 1 }]));
      setCode('');
      setState((s) => ({ ...s, error: '' }));
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    }
  }

  async function submit() {
    setState({ busy: true, error: '' });
    try {
      const res = await api.post('/pos/returns', {
        type,
        saleId: found.sale._id,
        items: Object.entries(qty).filter(([, q]) => q > 0).map(([productId, quantity]) => ({ productId, quantity })),
        newItems: type === 'exchange' ? newItems.map((i) => ({ productId: i.product._id, quantity: i.quantity })) : [],
        reason,
      });
      setDone({ ...res, store: found.store });
      setState({ busy: false, error: '' });
      onDone?.();
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }

  const sale = found?.sale;
  const policy = found?.policy;
  const credit = sale ? sale.items.reduce((s, it) => s + unitPaid(it) * (qty[it.productId] || 0), 0) : 0;
  const newTotal = newItems.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const balance = (type === 'exchange' ? newTotal : 0) - credit;
  const blocked = policy && (!policy.withinWindow || (!policy.allowReturns && !policy.allowExchanges));
  const canSubmit = !blocked && credit > 0 && (type === 'return' || newItems.length > 0);

  if (done) {
    return (
      <Modal
        open
        title={`${done.type === 'exchange' ? 'Exchange' : 'Return'} complete · ${done.returnNo}`}
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>Done</button>
            <button type="button" className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print slip</button>
          </>
        }
      >
        <p className="text-2xl font-semibold text-slate-900">{balanceText(done.balance)}</p>
        <div className="mt-4 overflow-x-auto rounded-lg bg-slate-100 p-4">
          <div className="mx-auto w-fit bg-white p-3 shadow"><ReturnSlip doc={done} /></div>
        </div>
        <PrintPortal pageCss="size: 80mm 297mm; margin: 4mm"><ReturnSlip doc={done} /></PrintPortal>
      </Modal>
    );
  }

  return (
    <Modal
      open
      size="max-w-2xl"
      title="Return / exchange"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          {sale && (
            <button type="button" className="btn-primary" disabled={!canSubmit || state.busy} onClick={submit}>
              {state.busy ? 'Processing…' : `Confirm ${type} · ${balanceText(balance)}`}
            </button>
          )}
        </>
      }
    >
      <form className="flex gap-2" onSubmit={lookup}>
        <input className="input flex-1 font-mono uppercase" placeholder="Receipt number from the bill, e.g. R-000012" value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} aria-label="Receipt number" autoFocus />
        <button type="submit" className="btn-secondary" disabled={!receiptNo.trim() || state.busy}><Search className="h-4 w-4" /> Find bill</button>
      </form>
      <Alert className="mt-3">{state.error}</Alert>
      {sale && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-600">
            <span><span className="font-semibold text-slate-900">{sale.receiptNo}</span> · {formatDateTime(sale.createdAt)} · {sale.storeName}</span>
            <span>{[sale.customerName, sale.customerPhone].filter(Boolean).join(' · ') || 'Walk-in'} · {formatMoney(sale.total)}</span>
          </div>
          {!policy.allowReturns && !policy.allowExchanges && <Alert tone="info">Returns and exchanges are not enabled for {sale.storeName}. An admin can turn them on in Stores.</Alert>}
          {(policy.allowReturns || policy.allowExchanges) && !policy.withinWindow && <Alert tone="info">The {policy.windowDays}-day return window for this bill ended on {formatDate(policy.deadline)}.</Alert>}
          {!blocked && (
            <>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
                {[['return', 'Return (refund)', policy.allowReturns], ['exchange', 'Exchange', policy.allowExchanges]].map(([k, l, ok]) => (
                  <button key={k} type="button" disabled={!ok} title={ok ? '' : 'Not enabled for this store'} className={`rounded-md px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${type === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setType(k)}>{l}</button>
                ))}
              </div>
              <p className="text-xs text-slate-500">Window: {policy.windowDays} days (until {formatDate(policy.deadline)}). Returned items go back into this store's stock.</p>
            </>
          )}
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {sale.items.map((it) => {
              const left = it.quantity - (it.returnedQty || 0);
              const q = qty[it.productId] || 0;
              return (
                <li key={it.productId} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{it.name}</p>
                    <p className="text-xs text-slate-500">Bought {it.quantity} · paid {formatMoney(unitPaid(it))} each{it.returnedQty ? ` · ${it.returnedQty} already returned` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" className="rounded-md border border-slate-200 p-1.5 hover:bg-slate-100 disabled:opacity-30" disabled={blocked || q <= 0} onClick={() => setQty({ ...qty, [it.productId]: q - 1 })} aria-label={`Return one less ${it.name}`}><Minus className="h-4 w-4" /></button>
                    <span className="w-8 text-center tabular-nums">{q}</span>
                    <button type="button" className="rounded-md border border-slate-200 p-1.5 hover:bg-slate-100 disabled:opacity-30" disabled={blocked || q >= left} onClick={() => setQty({ ...qty, [it.productId]: q + 1 })} aria-label={`Return one more ${it.name}`}><Plus className="h-4 w-4" /></button>
                  </div>
                  <span className="w-20 text-right text-xs text-slate-500">{left} left</span>
                </li>
              );
            })}
          </ul>
          {type === 'exchange' && !blocked && (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700">Replacement items</p>
              <form className="flex gap-2" onSubmit={addNew}>
                <input className="input flex-1" placeholder="Scan or type barcode / SKU / name" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Replacement product" />
                <button type="submit" className="btn-secondary" disabled={!code.trim()}>Add</button>
              </form>
              {newItems.map((i) => (
                <div key={i.product._id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{i.product.name} <span className="text-xs text-slate-500">({i.product.stock} in stock)</span></span>
                  <input type="number" min="1" className="input w-16 px-1 py-1 text-center" value={i.quantity} onChange={(e) => setNewItems(newItems.map((n) => (n.product._id === i.product._id ? { ...n, quantity: Math.max(1, Math.floor(Number(e.target.value)) || 1) } : n)))} aria-label={`Quantity of ${i.product.name}`} />
                  <span className="w-20 text-right tabular-nums">{formatMoney(i.product.price * i.quantity)}</span>
                  <button type="button" className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => setNewItems(newItems.filter((n) => n.product._id !== i.product._id))} aria-label={`Remove ${i.product.name}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
          {!blocked && (
            <>
              <input className="input" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} aria-label="Reason" />
              <div className="space-y-1 border-t border-slate-200 pt-3 text-sm">
                <div className="flex justify-between"><span>Credit for returned items</span><span className="tabular-nums">{formatMoney(credit)}</span></div>
                {type === 'exchange' && <div className="flex justify-between"><span>Replacement items</span><span className="tabular-nums">{formatMoney(newTotal)}</span></div>}
                <div className="flex justify-between text-base font-semibold"><span>{balance > 0 ? 'Customer pays' : 'Refund to customer'}</span><span className="tabular-nums">{formatMoney(Math.abs(balance))}</span></div>
              </div>
            </>
          )}
          {found.returns.length > 0 && (
            <p className="flex items-center gap-1 text-xs text-slate-500"><RotateCcw className="h-3 w-3" /> Earlier on this bill: {found.returns.map((r) => `${r.returnNo} (${r.type}, ${formatMoney(r.creditTotal)})`).join(', ')}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

function balanceText(balance) {
  if (balance > 0) return `Collect ${formatMoney(balance)}`;
  if (balance < 0) return `Refund ${formatMoney(-balance)}`;
  return 'Even exchange';
}

function ReturnSlip({ doc }) {
  return (
    <div className="mx-auto bg-white text-black" style={{ width: '72mm', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '9pt' }}>
      <div className="flex flex-col items-center gap-1 text-center">
        <Logo size={36} />
        <div className="font-bold" style={{ fontSize: '11pt' }}>{APP_NAME}</div>
        <div className="font-semibold">{doc.storeName}</div>
        <div className="font-semibold uppercase">{doc.type} slip</div>
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>Slip</span><span className="font-semibold">{doc.returnNo}</span></div>
      <div className="flex justify-between"><span>Original bill</span><span>{doc.receiptNo}</span></div>
      <div className="flex justify-between"><span>Date</span><span>{formatDateTime(doc.createdAt)}</span></div>
      {doc.customerPhone && <div className="flex justify-between"><span>Customer</span><span>{[doc.customerName, doc.customerPhone].filter(Boolean).join(' · ')}</span></div>}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="font-semibold">Returned</div>
      {doc.returnedItems.map((r) => (
        <div key={r.productId} className="flex justify-between"><span>{r.quantity} × {r.name}</span><span>-{formatMoney(r.amount)}</span></div>
      ))}
      {doc.newItems.length > 0 && <div className="mt-1 font-semibold">New items</div>}
      {doc.newItems.map((n) => (
        <div key={n.productId} className="flex justify-between"><span>{n.quantity} × {n.name}</span><span>{formatMoney(n.lineTotal)}</span></div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between font-bold" style={{ fontSize: '11pt' }}><span>{doc.balance > 0 ? 'PAID BY CUSTOMER' : 'REFUNDED'}</span><span>{formatMoney(Math.abs(doc.balance))}</span></div>
      {doc.reason && <div>Reason: {doc.reason}</div>}
      {doc.processedByName && <div>Processed by: {doc.processedByName}</div>}
    </div>
  );
}
