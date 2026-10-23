import { useState } from 'react';
import { BadgePercent, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../../lib/api';
import { usePermission } from '../../../auth/hooks';
import { useInfiniteList } from '../../../hooks/useInfiniteList';
import { SkeletonCard } from '../../../components/skeleton/Skeleton';
import PageHeader from '../../../components/ui/PageHeader';
import Modal from '../../../components/ui/Modal';
import Alert from '../../../components/ui/Alert';
import { formatMoney } from '../../shared/format';
import { describeDiscount } from '../discount';

const EMPTY = {
  name: '',
  description: '',
  options: [{ months: 1, price: 50 }, { months: 3, price: 100 }],
  discount: { type: 'percent', value: 10, maxDiscount: 0, minPurchase: 0, categories: [] },
  isActive: true,
};

export default function MembershipsPage() {
  const perm = usePermission('memberships');
  const { sentinel, ...list } = useInfiniteList('/memberships', { limit: 24 });
  const [editing, setEditing] = useState(null);

  async function onDelete(plan) {
    if (!window.confirm(`Delete ${plan.name}? Existing members keep their validity; the plan just can't be sold anymore.`)) return;
    try {
      await api.delete(`/memberships/${plan._id}`);
      list.setItems((items) => items.filter((i) => i._id !== plan._id));
    } catch (err) {
      window.alert(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Memberships"
        description="Plans sold at the Point of Sale. Set the price for each billing period and the discount members get while their membership is valid."
        actions={perm.add && <button type="button" className="btn-primary" onClick={() => setEditing(EMPTY)}><Plus className="h-4 w-4" /> New plan</button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.items.map((p) => (
          <div key={p._id} className="card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900"><BadgePercent className="h-4 w-4 text-accent-500" /> {p.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.isActive ? 'On sale' : 'Inactive'}</span>
            </div>
            {p.description && <p className="mt-1 text-sm text-slate-500">{p.description}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {p.options.map((o) => (
                <span key={o.months} className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm">
                  <span className="font-semibold">{formatMoney(o.price)}</span> <span className="text-slate-500">/ {o.months} mo</span>
                </span>
              ))}
            </div>
            <p className="mt-3 rounded-lg bg-accent-300/30 px-3 py-2 text-sm text-slate-800">{describeDiscount(p.discount)}</p>
            {(perm.update || perm.delete) && (
              <div className="mt-4 flex justify-end gap-1 border-t border-slate-100 pt-3">
                {perm.update && <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></button>}
                {perm.delete && <button type="button" className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Delete" onClick={() => onDelete(p)}><Trash2 className="h-4 w-4" /></button>}
              </div>
            )}
          </div>
        ))}
        {list.loading && Array.from({ length: list.initialLoading ? 3 : 1 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
      {!list.loading && !list.items.length && !list.error && <p className="card p-6 text-center text-sm text-slate-500">No membership plans yet.</p>}
      <Alert className="mt-4">{list.error?.message}</Alert>
      {list.hasMore && <div ref={sentinel} className="h-1" />}
      {editing && <PlanModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
    </div>
  );
}

function PlanModal({ initial, onClose, onSaved }) {
  const isNew = !initial._id;
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...initial,
    discount: { ...EMPTY.discount, ...initial.discount, categories: (initial.discount?.categories || []).join(', ') },
    options: initial.options.map((o) => ({ ...o })),
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const setDiscount = (k, v) => setForm({ ...form, discount: { ...form.discount, [k]: v } });
  const setOption = (i, k, v) => setForm({ ...form, options: form.options.map((o, j) => (j === i ? { ...o, [k]: v } : o)) });
  const perMonth = (o) => (Number(o.months) > 0 ? formatMoney(Number(o.price) / Number(o.months)) : '—');

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      ...form,
      options: form.options.map((o) => ({ months: Number(o.months), price: Number(o.price) })),
      discount: { ...form.discount, value: Number(form.discount.value), maxDiscount: Number(form.discount.maxDiscount) || 0, minPurchase: Number(form.discount.minPurchase) || 0 },
    };
    try {
      if (isNew) await api.post('/memberships', body);
      else await api.put(`/memberships/${initial._id}`, body);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="max-w-2xl"
      title={isNew ? 'New membership plan' : `Edit ${initial.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="plan-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save plan'}</button>
        </>
      }
    >
      <form id="plan-form" className="space-y-5" onSubmit={onSubmit}>
        <Alert>{error}</Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="m-name">Plan name</label>
            <input id="m-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} placeholder="e.g. 49 Club" />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> On sale at the POS
          </label>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="m-desc">Description (shown to cashiers)</label>
            <input id="m-desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} />
          </div>
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">Billing options (validity → price)</legend>
          <div className="space-y-2">
            {form.options.map((o, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
                <div>
                  <label className="label" htmlFor={`m-months-${i}`}>Months</label>
                  <input id={`m-months-${i}`} type="number" min="1" max="60" step="1" className="input" value={o.months} onChange={(e) => setOption(i, 'months', e.target.value)} required />
                </div>
                <div>
                  <label className="label" htmlFor={`m-price-${i}`}>Price</label>
                  <input id={`m-price-${i}`} type="number" min="0" step="0.01" className="input" value={o.price} onChange={(e) => setOption(i, 'price', e.target.value)} required />
                </div>
                <p className="hidden pb-2 text-xs text-slate-500 sm:block">{perMonth(o)} / month</p>
                <button type="button" className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-30" disabled={form.options.length === 1} onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })} aria-label="Remove option"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-secondary mt-3" onClick={() => setForm({ ...form, options: [...form.options, { months: (Math.max(...form.options.map((o) => Number(o.months) || 0)) || 0) + 1, price: '' }] })}><Plus className="h-4 w-4" /> Add option</button>
        </fieldset>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">Member discount (applied automatically while valid)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="m-dtype">Type</label>
              <select id="m-dtype" className="input" value={form.discount.type} onChange={(e) => setDiscount('type', e.target.value)}>
                <option value="percent">Percentage of eligible items</option>
                <option value="flat">Flat amount per bill</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="m-dvalue">{form.discount.type === 'percent' ? 'Discount %' : 'Discount amount'}</label>
              <input id="m-dvalue" type="number" min="0" max={form.discount.type === 'percent' ? 100 : undefined} step="0.01" className="input" value={form.discount.value} onChange={(e) => setDiscount('value', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="m-dmax">Max discount per bill (0 = no cap)</label>
              <input id="m-dmax" type="number" min="0" step="0.01" className="input" value={form.discount.maxDiscount} onChange={(e) => setDiscount('maxDiscount', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="m-dmin">Minimum bill (0 = any)</label>
              <input id="m-dmin" type="number" min="0" step="0.01" className="input" value={form.discount.minPurchase} onChange={(e) => setDiscount('minPurchase', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="m-dcats">Only these categories (comma separated, empty = all)</label>
              <input id="m-dcats" className="input" value={form.discount.categories} onChange={(e) => setDiscount('categories', e.target.value)} placeholder="e.g. Apparel, Home" />
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600">Preview: {describeDiscount({ ...form.discount, value: Number(form.discount.value), maxDiscount: Number(form.discount.maxDiscount), minPurchase: Number(form.discount.minPurchase), categories: String(form.discount.categories).split(',').map((c) => c.trim()).filter(Boolean) })}</p>
        </fieldset>
      </form>
    </Modal>
  );
}
