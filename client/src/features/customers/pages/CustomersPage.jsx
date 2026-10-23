import { useState } from 'react';
import { BadgePercent, History, Pencil, Search, Trash2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { usePermission } from '../../../auth/hooks';
import { useApi } from '../../../hooks/useApi';
import { useInfiniteList } from '../../../hooks/useInfiniteList';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { SkeletonTableRows, SkeletonText } from '../../../components/skeleton/Skeleton';
import PageHeader from '../../../components/ui/PageHeader';
import Modal from '../../../components/ui/Modal';
import Alert from '../../../components/ui/Alert';
import { formatDate, formatDateTime, formatMoney } from '../../shared/format';

export default function CustomersPage() {
  const perm = usePermission('customers');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const { sentinel, ...list } = useInfiniteList('/customers', { params: { q: debounced }, limit: 25 });
  const [viewing, setViewing] = useState(null);

  async function onDelete(c) {
    if (!window.confirm(`Delete the record for ${c.name || c.phone}? Past sales keep their receipt details.`)) return;
    try {
      await api.delete(`/customers/${c._id}`);
      list.setItems((items) => items.filter((i) => i._id !== c._id));
    } catch (err) {
      window.alert(err.message);
    }
  }

  return (
    <div>
      <PageHeader title="Customers" description="One record per phone number. Repeat customers are matched at checkout and never duplicated." />
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-4">
          <label className="relative block max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search by name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Phone</th>
                <th className="px-4 py-3 text-right font-medium">Visits</th>
                <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Total spent</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Last purchase</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {list.items.map((c) => (
                <tr key={c._id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/60" onClick={() => setViewing(c)}>
                  <td className="px-4 py-3">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                      {c.name || <span className="text-slate-400">Unnamed</span>}
                      <MemberBadge membership={c.membership} />
                    </p>
                    <p className="font-mono text-xs text-slate-500 sm:hidden">{c.phone}</p>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-slate-600 sm:table-cell">{c.phone}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.visitCount}</td>
                  <td className="hidden px-4 py-3 text-right font-medium tabular-nums md:table-cell">{formatMoney(c.totalSpent)}</td>
                  <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{formatDate(c.lastPurchaseAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Purchase history" onClick={() => setViewing(c)}>
                        <History className="h-4 w-4" />
                      </button>
                      {perm.delete && (
                        <button type="button" className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Delete" onClick={() => onDelete(c)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {list.loading && <SkeletonTableRows rows={list.initialLoading ? 6 : 2} columns={6} />}
            </tbody>
          </table>
        </div>
        {!list.loading && !list.items.length && !list.error && <p className="p-6 text-center text-sm text-slate-500">No customers yet. They are created at POS checkout.</p>}
        <Alert className="m-4">{list.error?.message}</Alert>
        {list.hasMore && <div ref={sentinel} className="h-1" />}
        {!list.initialLoading && list.total > 0 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">Showing {list.items.length} of {list.total}</p>}
      </div>
      {viewing && (
        <CustomerModal
          id={viewing._id}
          canEdit={perm.update}
          onClose={() => setViewing(null)}
          onSaved={(c) => list.setItems((items) => items.map((i) => (i._id === c._id ? { ...i, ...c } : i)))}
        />
      )}
    </div>
  );
}

function CustomerModal({ id, canEdit, onClose, onSaved }) {
  const detail = useApi(`/customers/${id}`);
  const c = detail.data;
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await api.put(`/customers/${id}`, form);
      onSaved(updated);
      setForm(null);
      detail.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open size="max-w-2xl" title={c ? c.name || c.phone : 'Customer'} onClose={onClose} footer={<button type="button" className="btn-secondary" onClick={onClose}>Close</button>}>
      {detail.loading && !c && <SkeletonText lines={6} />}
      <Alert>{detail.error?.message || error}</Alert>
      {c && (
        <div className="space-y-5">
          {form ? (
            <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={save}>
              <div>
                <label className="label" htmlFor="c-name">Name</label>
                <input id="c-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} />
              </div>
              <div>
                <label className="label" htmlFor="c-phone">Phone</label>
                <input id="c-phone" type="tel" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <dl className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-slate-500">Phone</dt><dd className="font-mono">{c.phone}</dd></div>
                <div><dt className="text-xs text-slate-500">Visits</dt><dd className="font-semibold">{c.visitCount}</dd></div>
                <div><dt className="text-xs text-slate-500">Total spent</dt><dd className="font-semibold">{formatMoney(c.totalSpent)}</dd></div>
                <div><dt className="text-xs text-slate-500">Customer since</dt><dd>{formatDate(c.createdAt)}</dd></div>
              </dl>
              {canEdit && (
                <button type="button" className="btn-secondary" onClick={() => setForm({ name: c.name, phone: c.phone })}>
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              )}
            </div>
          )}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">Membership <MemberBadge membership={c.membership} /></h3>
            {!c.memberships?.length && <p className="text-sm text-slate-500">No membership bought yet. Memberships are sold at the Point of Sale.</p>}
            {c.memberships?.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {c.memberships.map((m) => {
                  const state = m.status;
                  return (
                    <li key={`${m.receiptNo}-${m.startsAt}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-slate-900">{m.planName} · {m.months} month{m.months === 1 ? '' : 's'}</p>
                        <p className="text-xs text-slate-500">{formatDate(m.startsAt)} → {formatDate(m.endsAt)} · {m.receiptNo} · {m.storeName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{formatMoney(m.price)}</p>
                        <p className={`text-xs ${state === 'Active' ? 'text-emerald-700' : 'text-slate-500'}`}>{state}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Purchase history</h3>
            {!c.purchaseHistory.length && <p className="text-sm text-slate-500">No purchases yet.</p>}
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {c.purchaseHistory.map((p) => (
                <li key={p.saleId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{p.receiptNo}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(p.purchasedAt)} · {p.storeName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{formatMoney(p.total)}</p>
                    <p className="text-xs text-slate-500">{p.itemCount} item{p.itemCount === 1 ? '' : 's'}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}

function MemberBadge({ membership }) {
  if (membership?.active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-300/40 px-2 py-0.5 text-xs font-medium text-slate-900" title={`Valid until ${formatDate(membership.validUntil)}`}>
        <BadgePercent className="h-3 w-3" /> Member · till {formatDate(membership.validUntil)}
      </span>
    );
  }
  if (membership?.expiredAt) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Membership expired {formatDate(membership.expiredAt)}</span>;
  return null;
}
