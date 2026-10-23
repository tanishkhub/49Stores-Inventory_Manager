import { useState } from 'react';
import { ImagePlus, Pencil, Plus, RefreshCw, Search, Trash2, WandSparkles, X } from 'lucide-react';
import { api } from '../../../lib/api';
import { usePermission } from '../../../auth/hooks';
import { useApi } from '../../../hooks/useApi';
import { useInfiniteList } from '../../../hooks/useInfiniteList';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { Skeleton, SkeletonTableRows } from '../../../components/skeleton/Skeleton';
import PageHeader from '../../../components/ui/PageHeader';
import Modal from '../../../components/ui/Modal';
import Alert from '../../../components/ui/Alert';
import BarcodeSvg from '../../shared/BarcodeSvg';
import ProductThumb from '../../shared/ProductThumb';
import { formatMoney } from '../../shared/format';
import { fileToProductImages } from '../../shared/image';

const EMPTY = { name: '', sku: '', price: '', category: '', description: '', barcodeMode: 'auto', barcode: '', barcodeType: 'CODE128', isActive: true };

export default function ProductsPage() {
  const perm = usePermission('products');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const debounced = useDebouncedValue(search);
  const categories = useApi('/products/categories');
  const { sentinel, ...list } = useInfiniteList('/products', { params: { q: debounced, category }, limit: 20 });
  const [editing, setEditing] = useState(null);

  async function onDelete(p) {
    if (!window.confirm(`Delete ${p.name}? Stock rows in every store are removed too.`)) return;
    try {
      await api.delete(`/products/${p._id}`);
      list.setItems((items) => items.filter((i) => i._id !== p._id));
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function openEdit(p) {
    setEditing({ ...p, loadingImage: true });
    try {
      const full = await api.get(`/products/${p._id}`);
      setEditing((cur) => (cur?._id === p._id ? { ...full, barcodeMode: 'manual' } : cur));
    } catch (err) {
      window.alert(err.message);
      setEditing(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description="Catalog shared by all stores. Each product maps to one barcode used on labels and at the POS."
        actions={
          perm.add && (
            <button type="button" className="btn-primary" onClick={() => setEditing(EMPTY)}>
              <Plus className="h-4 w-4" /> Add product
            </button>
          )
        }
      />
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row">
          <label className="relative block flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search name, SKU or barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <select className="input sm:w-48" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {(categories.data?.items || []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">SKU</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Barcode</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Category</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {list.items.map((p) => (
                <tr key={p._id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProductThumb src={p.thumbnailBase64} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{p.name}</p>
                        <p className="truncate text-xs text-slate-500 md:hidden">{p.sku}</p>
                        {!p.isActive && <span className="text-xs font-medium text-slate-400">Inactive</span>}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-slate-600 md:table-cell">{p.sku}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <span className="font-mono text-xs text-slate-600">{p.barcode}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{p.barcodeType}</span>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{p.category || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(p.price)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {perm.update && (
                        <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {perm.delete && (
                        <button type="button" className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Delete" onClick={() => onDelete(p)}>
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
        {!list.loading && !list.items.length && !list.error && <p className="p-6 text-center text-sm text-slate-500">No products found.</p>}
        <Alert className="m-4">{list.error?.message}</Alert>
        {list.hasMore && <div ref={sentinel} className="h-1" />}
        {!list.initialLoading && list.total > 0 && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">Showing {list.items.length} of {list.total}</p>
        )}
      </div>

      {editing && (
        <ProductFormModal
          key={editing._id ? `${editing._id}-${editing.loadingImage ? 'loading' : 'ready'}` : 'new'}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
            categories.reload();
          }}
        />
      )}
    </div>
  );
}

function ProductFormModal({ initial, onClose, onSaved }) {
  const isNew = !initial._id;
  const [form, setForm] = useState({ ...EMPTY, ...initial, price: initial.price ?? '' });
  const [image, setImage] = useState({ imageBase64: initial.imageBase64 || '', thumbnailBase64: initial.thumbnailBase64 || '', changed: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const loading = initial.loadingImage;

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('image');
    setError('');
    try {
      setImage({ ...(await fileToProductImages(file)), changed: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function generate() {
    setBusy('barcode');
    try {
      const { barcode } = await api.post('/barcodes/generate', {});
      setForm((f) => ({ ...f, barcodeMode: 'manual', barcode }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      name: form.name,
      sku: form.sku,
      price: form.price,
      category: form.category,
      description: form.description,
      isActive: form.isActive,
      barcodeType: form.barcodeType,
      barcodeMode: form.barcodeMode,
      ...(form.barcodeMode === 'manual' ? { barcode: form.barcode } : {}),
      ...(image.changed ? { imageBase64: image.imageBase64, thumbnailBase64: image.thumbnailBase64 } : {}),
    };
    if (!isNew && form.barcodeMode === 'auto') body.regenerateBarcode = true;
    try {
      if (isNew) await api.post('/products', body);
      else await api.put(`/products/${initial._id}`, body);
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
      size="max-w-3xl"
      title={isNew ? 'Add product' : `Edit ${initial.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="product-form" className="btn-primary" disabled={saving || loading || Boolean(busy)}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="product-form" className="grid gap-5 md:grid-cols-[220px_1fr]" onSubmit={onSubmit}>
        <Alert className="md:col-span-2">{error}</Alert>
        <div>
          <span className="label">Image</span>
          {loading ? (
            <Skeleton className="aspect-square w-full" />
          ) : (
            <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
              {image.imageBase64 || image.thumbnailBase64 ? (
                <img src={image.imageBase64 || image.thumbnailBase64} alt="Product preview" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                  <ImagePlus className="h-8 w-8" />
                  <span className="text-xs">No image</span>
                </div>
              )}
              {(image.imageBase64 || image.thumbnailBase64) && (
                <button
                  type="button"
                  className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-slate-600 shadow hover:text-red-600"
                  onClick={() => setImage({ imageBase64: '', thumbnailBase64: '', changed: true })}
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <label className="btn-secondary mt-2 w-full cursor-pointer">
            <ImagePlus className="h-4 w-4" /> {busy === 'image' ? 'Processing…' : 'Upload image'}
            <input type="file" accept="image/*" className="sr-only" onChange={onFile} disabled={loading} />
          </label>
          <p className="mt-1 text-xs text-slate-400">Resized in the browser and stored as Base64 in MongoDB.</p>
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="p-name">Name</label>
            <input id="p-name" className="input" value={form.name} onChange={set('name')} required maxLength={150} />
          </div>
          <div>
            <label className="label" htmlFor="p-sku">SKU</label>
            <input id="p-sku" className="input font-mono uppercase" value={form.sku} onChange={set('sku')} required pattern="[A-Za-z0-9._\-]{1,40}" />
          </div>
          <div>
            <label className="label" htmlFor="p-price">Price</label>
            <input id="p-price" type="number" min="0" step="0.01" className="input" value={form.price} onChange={set('price')} required />
          </div>
          <div>
            <label className="label" htmlFor="p-category">Category</label>
            <input id="p-category" className="input" value={form.category} onChange={set('category')} maxLength={80} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Active (sellable)
          </label>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="p-desc">Description</label>
            <textarea id="p-desc" rows={2} className="input" value={form.description} onChange={set('description')} maxLength={2000} />
          </div>

          <fieldset className="rounded-xl border border-slate-200 p-4 sm:col-span-2">
            <legend className="px-1 text-sm font-medium text-slate-700">Barcode mapping</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="barcodeMode" checked={form.barcodeMode === 'auto'} onChange={() => setForm({ ...form, barcodeMode: 'auto' })} />
                {isNew ? 'Auto-generate on save' : 'Regenerate on save'}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="barcodeMode" checked={form.barcodeMode === 'manual'} onChange={() => setForm({ ...form, barcodeMode: 'manual' })} />
                {isNew ? 'Custom / existing barcode' : 'Keep or edit barcode'}
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px]">
              <div>
                <label className="label" htmlFor="p-barcode">Barcode value</label>
                <div className="flex gap-2">
                  <input
                    id="p-barcode"
                    className="input font-mono"
                    value={form.barcodeMode === 'manual' ? form.barcode : ''}
                    placeholder={form.barcodeMode === 'auto' ? 'Generated when you save' : 'Scan or type a barcode'}
                    disabled={form.barcodeMode === 'auto'}
                    onChange={set('barcode')}
                    required={form.barcodeMode === 'manual'}
                  />
                  <button type="button" className="btn-secondary shrink-0" onClick={generate} disabled={busy === 'barcode'} title="Generate a unique value now">
                    {busy === 'barcode' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                    <span className="hidden sm:inline">Generate</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="p-symbology">Symbology</label>
                <select id="p-symbology" className="input" value={form.barcodeType} onChange={set('barcodeType')}>
                  <option value="CODE128">Code 128</option>
                  <option value="EAN13">EAN-13</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Generated values are 13-digit numbers with a valid EAN-13 check digit, so they print as Code 128 or EAN-13. EAN-13 accepts 12 digits (check
              digit added) or 13 digits.
            </p>
            {form.barcodeMode === 'manual' && form.barcode && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 text-center">
                <BarcodeSvg value={form.barcode} format={form.barcodeType} height={48} className="mx-auto max-w-full" />
              </div>
            )}
          </fieldset>
        </div>
      </form>
    </Modal>
  );
}
