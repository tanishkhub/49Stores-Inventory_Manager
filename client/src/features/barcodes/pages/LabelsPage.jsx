import { useMemo, useState } from 'react';
import { Minus, Plus, Printer, Search, X } from 'lucide-react';
import { useInfiniteList } from '../../../hooks/useInfiniteList';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { SkeletonTableRows } from '../../../components/skeleton/Skeleton';
import PageHeader from '../../../components/ui/PageHeader';
import Alert from '../../../components/ui/Alert';
import BarcodeSvg from '../../shared/BarcodeSvg';
import PrintPortal from '../../shared/PrintPortal';
import { formatMoney } from '../../shared/format';
import { APP_NAME, LOGO_URL } from '../../../config/brand';

// Label stock presets. Thermal presets print one label per page (set the printer's media to the
// same size, margins "None"); the A4 preset prints a 3 x 7 sheet for standard printers.
const LAYOUTS = {
  'thermal-50x25': { label: 'Thermal 50 × 25 mm', w: 50, h: 25, sheet: false, barHeight: 32, font: 10 },
  'thermal-58x40': { label: 'Thermal 58 × 40 mm', w: 58, h: 40, sheet: false, barHeight: 50, font: 12 },
  'thermal-100x50': { label: 'Thermal 4 × 2 in (100 × 50 mm)', w: 100, h: 50, sheet: false, barHeight: 60, font: 14 },
  'a4-3x7': { label: 'A4 sheet, 3 × 7 (63.5 × 38.1 mm)', w: 63.5, h: 38.1, sheet: true, barHeight: 44, font: 11 },
};

function Label({ product, layout, show }) {
  const pad = layout.h < 30 ? 1.2 : 2;
  return (
    <div
      className="print-avoid-break flex flex-col items-center justify-center overflow-hidden bg-white text-black"
      style={{ width: `${layout.w}mm`, height: `${layout.h}mm`, padding: `${pad}mm`, boxSizing: 'border-box', fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      {(show.name || show.logo) && (
        <div className="flex w-full items-center justify-center gap-1 leading-tight" style={{ fontSize: `${layout.font * 0.75}pt` }}>
          {show.logo && <img src={LOGO_URL} alt={APP_NAME} style={{ height: `${layout.h < 30 ? 3.2 : 5}mm`, width: 'auto' }} className="shrink-0" />}
          {show.name && <span className="truncate font-semibold">{product.name}</span>}
        </div>
      )}
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <BarcodeSvg
          value={product.barcode}
          format={product.barcodeType || 'CODE128'}
          height={layout.barHeight}
          width={2}
          fontSize={layout.font + 2}
          margin={0}
          className="block h-full max-h-full w-auto max-w-full"
        />
      </div>
      {(show.price || show.sku) && (
        <div className="flex w-full items-baseline justify-between gap-1 leading-tight" style={{ fontSize: `${layout.font * 0.7}pt` }}>
          <span className="truncate">{show.sku ? product.sku : ''}</span>
          {show.price && <span className="font-bold" style={{ fontSize: `${layout.font * 0.85}pt` }}>{formatMoney(product.price)}</span>}
        </div>
      )}
    </div>
  );
}

export default function LabelsPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const { sentinel, ...list } = useInfiniteList('/barcodes/products', { params: { q: debounced }, limit: 25 });
  const [queue, setQueue] = useState([]); // [{ product, copies }]
  const [layoutKey, setLayoutKey] = useState('thermal-50x25');
  const [show, setShow] = useState({ logo: true, name: true, price: true, sku: false });
  const layout = LAYOUTS[layoutKey];

  const addToQueue = (product, copies = 1) =>
    setQueue((q) => (q.some((e) => e.product._id === product._id) ? q.map((e) => (e.product._id === product._id ? { ...e, copies: e.copies + copies } : e)) : [...q, { product, copies }]));
  const setCopies = (id, copies) => setQueue((q) => q.map((e) => (e.product._id === id ? { ...e, copies: Math.max(1, Math.min(500, copies || 1)) } : e)));
  const labels = useMemo(() => queue.flatMap((e) => Array.from({ length: e.copies }, (_, i) => ({ key: `${e.product._id}-${i}`, product: e.product }))), [queue]);
  const pageCss = layout.sheet ? 'size: A4 portrait; margin: 15mm 7mm' : `size: ${layout.w}mm ${layout.h}mm; margin: 0`;

  return (
    <div>
      <PageHeader
        title="Barcode / Labels"
        description="Pick products, set copies, preview and print labels on a thermal label printer or A4 sheets."
        actions={
          <button type="button" className="btn-primary" disabled={!labels.length} onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print {labels.length || ''} label{labels.length === 1 ? '' : 's'}
          </button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search name, SKU or barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <button type="button" className="btn-secondary" disabled={!list.items.length} onClick={() => list.items.forEach((p) => addToQueue(p))}>
              <Plus className="h-4 w-4" /> Add all shown
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Barcode</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {list.items.map((p) => (
                  <tr key={p._id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{p.name}</p>
                      <p className="font-mono text-xs text-slate-500">{p.sku}<span className="md:hidden"> · {p.barcode}</span></p>
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-slate-600 md:table-cell">
                      {p.barcode} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{p.barcodeType}</span>
                    </td>
                    <td className="px-4 py-3 text-right">{formatMoney(p.price)}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" className="btn-secondary px-2.5 py-1.5" onClick={() => addToQueue(p)}>
                        <Plus className="h-4 w-4" /> Add
                      </button>
                    </td>
                  </tr>
                ))}
                {list.loading && <SkeletonTableRows rows={list.initialLoading ? 6 : 2} columns={4} />}
              </tbody>
            </table>
          </div>
          {!list.loading && !list.items.length && !list.error && <p className="p-6 text-center text-sm text-slate-500">No products found.</p>}
          <Alert className="m-4">{list.error?.message}</Alert>
          {list.hasMore && <div ref={sentinel} className="h-1" />}
        </div>

        <div className="space-y-4">
          <div className="card space-y-4 p-4">
            <div>
              <label className="label" htmlFor="l-layout">Label size</label>
              <select id="l-layout" className="input" value={layoutKey} onChange={(e) => setLayoutKey(e.target.value)}>
                {Object.entries(LAYOUTS).map(([k, l]) => (
                  <option key={k} value={k}>{l.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                {layout.sheet ? 'Standard printer: A4 paper, scale 100%, margins "Default".' : `Thermal printer: set paper size to ${layout.w} × ${layout.h} mm, margins "None", scale 100%.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {['logo', 'name', 'price', 'sku'].map((k) => (
                <label key={k} className="flex items-center gap-2 capitalize">
                  <input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} /> {k === 'sku' ? 'SKU' : k}
                </label>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Print queue</h2>
              {queue.length > 0 && <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => setQueue([])}>Clear</button>}
            </div>
            {!queue.length && <p className="text-sm text-slate-500">Add products from the list to build a single or batch print job.</p>}
            <ul className="space-y-2">
              {queue.map((e) => (
                <li key={e.product._id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{e.product.name}</span>
                  <button type="button" className="rounded-md border border-slate-200 p-1 hover:bg-slate-100" onClick={() => setCopies(e.product._id, e.copies - 1)} aria-label="Fewer copies"><Minus className="h-3.5 w-3.5" /></button>
                  <input className="input w-14 px-1 py-1 text-center" type="number" min="1" max="500" value={e.copies} onChange={(ev) => setCopies(e.product._id, Number(ev.target.value))} aria-label="Copies" />
                  <button type="button" className="rounded-md border border-slate-200 p-1 hover:bg-slate-100" onClick={() => setCopies(e.product._id, e.copies + 1)} aria-label="More copies"><Plus className="h-3.5 w-3.5" /></button>
                  <button type="button" className="rounded-md p-1 text-slate-400 hover:text-red-600" onClick={() => setQueue((q) => q.filter((x) => x.product._id !== e.product._id))} aria-label="Remove"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </div>

          {queue.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Preview (actual size)</h2>
              <div className="flex max-h-[28rem] flex-wrap justify-center gap-3 overflow-auto rounded-lg bg-slate-100 p-3">
                {queue.map((e) => (
                  <div key={e.product._id} className="shadow ring-1 ring-slate-300">
                    <Label product={e.product} layout={layout} show={show} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {labels.length > 0 && (
        <PrintPortal pageCss={pageCss}>
          {layout.sheet ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${layout.w}mm)`, gridAutoRows: `${layout.h}mm`, columnGap: '2.5mm' }}>
              {labels.map((l) => (
                <Label key={l.key} product={l.product} layout={layout} show={show} />
              ))}
            </div>
          ) : (
            labels.map((l, i) => (
              <div key={l.key} className={i < labels.length - 1 ? 'print-break-after' : ''}>
                <Label product={l.product} layout={layout} show={show} />
              </div>
            ))
          )}
        </PrintPortal>
      )}
    </div>
  );
}
