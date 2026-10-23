import { useState } from 'react';
import { MapPin, Pencil, Phone, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { usePermission } from '../../../auth/hooks';
import { useInfiniteList } from '../../../hooks/useInfiniteList';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { SkeletonCard } from '../../../components/skeleton/Skeleton';
import PageHeader from '../../../components/ui/PageHeader';
import Modal from '../../../components/ui/Modal';
import Alert from '../../../components/ui/Alert';

const EMPTY = { name: '', code: '', location: '', city: '', phone: '', isActive: true, allowReturns: false, allowExchanges: false, returnWindowDays: 7 };

export default function StoresPage() {
  const perm = usePermission('stores');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const { sentinel, ...list } = useInfiniteList('/stores', { params: { q: debounced }, limit: 24 });
  const [editing, setEditing] = useState(null);

  async function onDelete(store) {
    if (!window.confirm(`Delete ${store.name}? Its inventory rows are removed too.`)) return;
    try {
      await api.delete(`/stores/${store._id}`);
      list.setItems((items) => items.filter((i) => i._id !== store._id));
    } catch (err) {
      window.alert(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Stores"
        description="Store locations. Inventory, POS sales and reports are tracked per store."
        actions={
          perm.add && (
            <button type="button" className="btn-primary" onClick={() => setEditing(EMPTY)}>
              <Plus className="h-4 w-4" /> Add store
            </button>
          )
        }
      />
      <label className="relative mb-4 block max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search by name, code or city" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.items.map((s) => (
          <div key={s._id} className="card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-900">{s.name}</h3>
                <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{s.code}</span>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {s.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              {(s.location || s.city) && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> {[s.location, s.city].filter(Boolean).join(', ')}
                </p>
              )}
              {s.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-400" /> {s.phone}
                </p>
              )}
              <p className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-slate-400" />
                {s.allowReturns || s.allowExchanges
                  ? `${[s.allowReturns && 'Returns', s.allowExchanges && 'Exchanges'].filter(Boolean).join(' & ')} within ${s.returnWindowDays} day${s.returnWindowDays === 1 ? '' : 's'}`
                  : 'No returns / exchanges'}
              </p>
            </div>
            {(perm.update || perm.delete) && (
              <div className="mt-4 flex justify-end gap-1 border-t border-slate-100 pt-3">
                {perm.update && (
                  <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit" onClick={() => setEditing(s)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {perm.delete && (
                  <button type="button" className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Delete" onClick={() => onDelete(s)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {list.loading && Array.from({ length: list.initialLoading ? 6 : 3 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
      {!list.loading && !list.items.length && !list.error && <p className="card p-6 text-center text-sm text-slate-500">No stores yet.</p>}
      <Alert className="mt-4">{list.error?.message}</Alert>
      {list.hasMore && <div ref={sentinel} className="h-1" />}

      {editing && (
        <StoreFormModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function StoreFormModal({ initial, onClose, onSaved }) {
  const isNew = !initial._id;
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      name: form.name,
      code: form.code,
      location: form.location,
      city: form.city,
      phone: form.phone,
      isActive: form.isActive,
      allowReturns: form.allowReturns,
      allowExchanges: form.allowExchanges,
      returnWindowDays: Number(form.returnWindowDays),
    };
    try {
      if (isNew) await api.post('/stores', body);
      else await api.put(`/stores/${initial._id}`, body);
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
      title={isNew ? 'Add store' : `Edit ${initial.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="store-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="store-form" className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <Alert className="sm:col-span-2">{error}</Alert>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="s-name">Store name</label>
          <input id="s-name" className="input" value={form.name} onChange={set('name')} required maxLength={100} />
        </div>
        <div>
          <label className="label" htmlFor="s-code">Code</label>
          <input id="s-code" className="input font-mono uppercase" value={form.code} onChange={set('code')} required pattern="[A-Za-z0-9-]{2,20}" placeholder="e.g. DTN" />
        </div>
        <div>
          <label className="label" htmlFor="s-phone">Phone</label>
          <input id="s-phone" className="input" value={form.phone} onChange={set('phone')} maxLength={30} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="s-location">Address / location</label>
          <input id="s-location" className="input" value={form.location} onChange={set('location')} maxLength={200} />
        </div>
        <div>
          <label className="label" htmlFor="s-city">City</label>
          <input id="s-city" className="input" value={form.city} onChange={set('city')} maxLength={80} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Active
        </label>
        <fieldset className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
          <legend className="px-1 text-sm font-medium text-slate-700">Returns &amp; exchanges (based on the original bill)</legend>
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.allowReturns} onChange={set('allowReturns')} /> Allow returns (refund)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.allowExchanges} onChange={set('allowExchanges')} /> Allow exchanges
            </label>
            <div>
              <label className="label" htmlFor="s-window">Window (days after sale)</label>
              <input id="s-window" type="number" min="0" max="365" className="input" value={form.returnWindowDays} onChange={set('returnWindowDays')} disabled={!form.allowReturns && !form.allowExchanges} />
            </div>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
