import { useState } from 'react';
import { Minus, Pencil, Plus, Search, Trash2, TriangleAlert } from 'lucide-react';
import { api } from '../../../lib/api';
import { usePermission } from '../../../auth/hooks';
import { useApi } from '../../../hooks/useApi';
import { useInfiniteList } from '../../../hooks/useInfiniteList';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { SkeletonTableRows } from '../../../components/skeleton/Skeleton';
import PageHeader from '../../../components/ui/PageHeader';
import Modal from '../../../components/ui/Modal';
import Alert from '../../../components/ui/Alert';
import AsyncPicker from '../../shared/AsyncPicker';
import ProductThumb from '../../shared/ProductThumb';
import { formatMoney } from '../../shared/format';

const STORE_KEY = 'inventory_poc.inventoryStore';

export default function InventoryPage() {
  const perm = usePermission('inventory');
  const stores = useApi('/inventory/stores');
  const [storeId, setStoreIdState] = useState(() => localStorage.getItem(STORE_KEY) || '');
  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const debounced = useDebouncedValue(search);
  const { sentinel, ...list } = useInfiniteList('/inventory', { params: { storeId, q: debounced, lowStock: lowStock ? 'true' : '' }, limit: 25 });
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [rowError, setRowError] = useState('');
  const storeItems = stores.data?.items || [];
  const knownStore = !storeId || storeItems.some((s) => s._id === storeId) || stores.loading;

  function setStoreId(id) {
    setStoreIdState(id);
    localStorage.setItem(STORE_KEY, id);
  }

  const replaceRow = (row) => list.setItems((items) => items.map((i) => (i._id === row._id ? row : i)));

  async function adjust(row, delta) {
    setRowError('');
    try {
      replaceRow(await api.post(`/inventory/${row._id}/adjust`, { delta }));
    } catch (err) {
      setRowError(err.message);
    }
  }

  async function onDelete(row) {
    if (!window.confirm(`Remove ${row.productId?.name} from ${row.storeId?.name}?`)) return;
    try {
      await api.delete(`/inventory/${row._id}`);
      list.setItems((items) => items.filter((i) => i._id !== row._id));
    } catch (err) {
      setRowError(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock on hand per store. Pick a store or view all locations."
        actions={
          perm.add && (
            <button type="button" className="btn-primary" onClick={() => setAdding(true)} disabled={!storeItems.length}>
              <Plus className="h-4 w-4" /> Add stock row
            </button>
          )
        }
      />
      <div className="card overflow-hidden">
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[220px_1fr_auto] sm:items-center">
          <select className="input" value={knownStore ? storeId : ''} onChange={(e) => setStoreId(e.target.value)} aria-label="Store">
            <option value="">All stores</option>
            {storeItems.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} ({s.code}){s.isActive ? '' : ' — inactive'}
              </option>
            ))}
          </select>
          <label className="relative block sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search product, SKU or barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} /> Low stock only
          </label>
        </div>
        <Alert className="m-4">{rowError || stores.error?.message}</Alert>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Store</th>
                <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Price</th>
                <th className="px-4 py-3 text-center font-medium">Quantity</th>
                <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">Reorder at</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {list.items.map((row) => {
                const low = row.quantity <= row.reorderLevel;
                return (
                  <tr key={row._id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductThumb src={row.productId?.imageUrl || row.productId?.thumbnailBase64} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{row.productId?.name || 'Deleted product'}</p>
                          <p className="truncate font-mono text-xs text-slate-500">{row.productId?.sku}</p>
                          <p className="truncate text-xs text-slate-500 sm:hidden">{row.storeId?.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{row.storeId?.name}</td>
                    <td className="hidden px-4 py-3 text-right text-slate-600 md:table-cell">{formatMoney(row.productId?.price)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {perm.update && (
                          <button type="button" className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40" onClick={() => adjust(row, -1)} disabled={row.quantity < 1} aria-label="Decrease">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <span className={`min-w-10 rounded-md px-2 py-0.5 text-center font-semibold tabular-nums ${low ? 'bg-amber-50 text-amber-700' : 'text-slate-900'}`}>
                          {row.quantity}
                        </span>
                        {perm.update && (
                          <button type="button" className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-100" onClick={() => adjust(row, 1)} aria-label="Increase">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {low && <TriangleAlert className="h-4 w-4 text-amber-500" aria-label="Low stock" />}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-right text-slate-600 lg:table-cell">{row.reorderLevel}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {perm.update && (
                          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit" onClick={() => setEditing(row)}>
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {perm.delete && (
                          <button type="button" className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Remove" onClick={() => onDelete(row)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {list.loading && <SkeletonTableRows rows={list.initialLoading ? 6 : 2} columns={6} />}
            </tbody>
          </table>
        </div>
        {!list.loading && !list.items.length && !list.error && <p className="p-6 text-center text-sm text-slate-500">No stock rows match.</p>}
        <Alert className="m-4">{list.error?.message}</Alert>
        {list.hasMore && <div ref={sentinel} className="h-1" />}
        {!list.initialLoading && list.total > 0 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">Showing {list.items.length} of {list.total}</p>}
      </div>

      {editing && <EditStockModal row={editing} onClose={() => setEditing(null)} onSaved={(row) => { replaceRow(row); setEditing(null); }} />}
      {adding && (
        <AddStockModal
          stores={storeItems.filter((s) => s.isActive)}
          defaultStoreId={storeId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function EditStockModal({ row, onClose, onSaved }) {
  const [quantity, setQuantity] = useState(String(row.quantity));
  const [reorderLevel, setReorderLevel] = useState(String(row.reorderLevel));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      onSaved(await api.put(`/inventory/${row._id}`, { quantity: Number(quantity), reorderLevel: Number(reorderLevel) }));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`${row.productId?.name} · ${row.storeId?.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="stock-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="stock-form" className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <Alert className="sm:col-span-2">{error}</Alert>
        <div>
          <label className="label" htmlFor="st-qty">Quantity on hand</label>
          <input id="st-qty" type="number" min="0" step="1" className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="st-reorder">Reorder level</label>
          <input id="st-reorder" type="number" min="0" step="1" className="input" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} required />
        </div>
      </form>
    </Modal>
  );
}

function AddStockModal({ stores, defaultStoreId, onClose, onSaved }) {
  const [product, setProduct] = useState(null);
  const [storeId, setStoreId] = useState(stores.some((s) => s._id === defaultStoreId) ? defaultStoreId : stores[0]?._id || '');
  const [quantity, setQuantity] = useState('0');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!product) return setError('Choose a product');
    setSaving(true);
    try {
      await api.post('/inventory', { productId: product._id, storeId, quantity: Number(quantity), reorderLevel: Number(reorderLevel) });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
    return undefined;
  }

  return (
    <Modal
      open
      title="Add stock row"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="add-stock-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>
        </>
      }
    >
      <form id="add-stock-form" className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <Alert className="sm:col-span-2">{error}</Alert>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="as-product">Product</label>
          <AsyncPicker id="as-product" path="/products" params={{ active: 'true' }} value={product} onChange={setProduct} getLabel={(p) => p.name} getSub={(p) => `${p.sku} · ${p.barcode}`} placeholder="Search products" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="as-store">Store</label>
          <select id="as-store" className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)} required>
            {stores.map((s) => (
              <option key={s._id} value={s._id}>{s.name} ({s.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="as-qty">Opening quantity</label>
          <input id="as-qty" type="number" min="0" step="1" className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="as-reorder">Reorder level</label>
          <input id="as-reorder" type="number" min="0" step="1" className="input" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} required />
        </div>
      </form>
    </Modal>
  );
}
