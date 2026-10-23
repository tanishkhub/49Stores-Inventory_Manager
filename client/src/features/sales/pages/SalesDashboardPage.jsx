import { useState } from 'react';
import { FileSpreadsheet, FileText, Printer, Search } from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import { useInfiniteList } from '../../../hooks/useInfiniteList';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { Skeleton, SkeletonTableRows, SkeletonText } from '../../../components/skeleton/Skeleton';
import PageHeader from '../../../components/ui/PageHeader';
import Modal from '../../../components/ui/Modal';
import Alert from '../../../components/ui/Alert';
import AsyncPicker from '../../shared/AsyncPicker';
import PrintPortal from '../../shared/PrintPortal';
import { downloadFile } from '../../shared/download';
import { dayEndIso, dayStartIso, formatDateTime, formatMoney, localDateInput } from '../../shared/format';
import Receipt from '../../pos/components/Receipt';

const PRESETS = [
  ['Today', 0],
  ['7 days', 6],
  ['30 days', 29],
  ['90 days', 89],
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateInput(d);
}

export default function SalesDashboardPage() {
  const stores = useApi('/sales/options/stores');
  const [storeId, setStoreId] = useState('');
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(localDateInput());
  const [product, setProduct] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const [viewing, setViewing] = useState(null);

  // The same params drive the table, the summary and both exports, so downloads match the view.
  const params = { storeId, from: dayStartIso(from), to: dayEndIso(to), productId: product?._id, customerId: customer?._id, q: debounced };
  const summary = useApi('/sales/summary', { params });
  const { sentinel, ...list } = useInfiniteList('/sales', { params, limit: 25 });
  const s = summary.data;

  async function exportAs(format) {
    setExporting(format);
    setExportError('');
    try {
      await downloadFile('/sales/export', { ...params, format });
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting('');
    }
  }

  function clearFilters() {
    setStoreId('');
    setFrom('');
    setTo('');
    setProduct(null);
    setCustomer(null);
    setSearch('');
  }

  return (
    <div>
      <PageHeader
        title="Sales Dashboard"
        description="Filter sales and export exactly what you see to CSV or Excel."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => exportAs('csv')} disabled={Boolean(exporting)}>
              <FileText className="h-4 w-4" /> {exporting === 'csv' ? 'Exporting…' : 'CSV'}
            </button>
            <button type="button" className="btn-primary" onClick={() => exportAs('xlsx')} disabled={Boolean(exporting)}>
              <FileSpreadsheet className="h-4 w-4" /> {exporting === 'xlsx' ? 'Exporting…' : 'Excel'}
            </button>
          </>
        }
      />
      <Alert className="mb-4">{exportError}</Alert>

      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div>
          <label className="label" htmlFor="f-store">Store</label>
          <select id="f-store" className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">All stores</option>
            {(stores.data?.items || []).map((st) => (
              <option key={st._id} value={st._id}>{st.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-from">From</label>
          <input id="f-from" type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="f-to">To</label>
          <input id="f-to" type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="f-product">Product</label>
          <AsyncPicker id="f-product" path="/sales/options/products" value={product} onChange={setProduct} getLabel={(p) => p.name} getSub={(p) => p.sku} placeholder="Any product" />
        </div>
        <div>
          <label className="label" htmlFor="f-customer">Customer</label>
          <AsyncPicker id="f-customer" path="/sales/options/customers" value={customer} onChange={setCustomer} getLabel={(c) => c.name || c.phone} getSub={(c) => c.phone} placeholder="Any customer" />
        </div>
        <div>
          <label className="label" htmlFor="f-q">Receipt / phone</label>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="f-q" className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="R-000123" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-6">
          {PRESETS.map(([label, n]) => (
            <button key={label} type="button" className={`rounded-full border px-3 py-1 text-xs ${from === daysAgo(n) && to === localDateInput() ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`} onClick={() => { setFrom(daysAgo(n)); setTo(localDateInput()); }}>
              {label}
            </button>
          ))}
          <button type="button" className="ml-auto text-xs text-slate-500 hover:text-slate-800" onClick={clearFilters}>Clear filters</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Revenue', s && formatMoney(s.revenue), s && `Net after returns ${formatMoney(s.netRevenue)}`],
          ['Sales', s?.salesCount, s && `${s.units} units · avg ${formatMoney(s.averageSale)}`],
          ['Member discounts', s && formatMoney(s.discount), s && `Membership fees ${formatMoney(s.membershipRevenue)}`],
          ['Returns / exchanges', s?.returns.count, s && `Refunded ${formatMoney(s.returns.refunded)} · collected ${formatMoney(s.returns.collected)}`],
        ].map(([label, value, sub]) => (
          <div key={label} className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            {summary.loading && !s ? <Skeleton className="mt-2 h-7 w-24" /> : <p className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{value ?? '—'}</p>}
            {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
          </div>
        ))}
      </div>

      {s && (s.topProducts.length > 0 || s.byStore.length > 1) && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <BarList title="Top products by revenue" rows={s.topProducts.map((p) => ({ key: p._id, label: p.name, value: p.revenue, sub: `${p.units} units` }))} />
          <BarList title="Revenue by store" rows={s.byStore.map((st) => ({ key: st._id, label: st.name, value: st.revenue, sub: `${st.salesCount} sales` }))} />
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Receipt</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Date</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Store</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Customer</th>
                <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Items</th>
                <th className="hidden px-4 py-3 font-medium xl:table-cell">Payment</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((sale) => (
                <tr key={sale._id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/60" onClick={() => setViewing(sale._id)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-brand-700">{sale.receiptNo}</p>
                    <p className="text-xs text-slate-500 sm:hidden">{formatDateTime(sale.createdAt)}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{formatDateTime(sale.createdAt)}</td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{sale.storeName}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {sale.customerPhone ? (
                      <>
                        <p className="text-slate-800">{sale.customerName || '—'}</p>
                        <p className="font-mono text-xs text-slate-500">{sale.customerPhone}</p>
                      </>
                    ) : (
                      <span className="text-slate-400">Walk-in</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">{sale.itemCount}</td>
                  <td className="hidden px-4 py-3 capitalize text-slate-600 xl:table-cell">{sale.paymentMethod}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(sale.total)}</td>
                </tr>
              ))}
              {list.loading && <SkeletonTableRows rows={list.initialLoading ? 8 : 2} columns={7} />}
            </tbody>
          </table>
        </div>
        {!list.loading && !list.items.length && !list.error && <p className="p-6 text-center text-sm text-slate-500">No sales match these filters.</p>}
        <Alert className="m-4">{list.error?.message || summary.error?.message}</Alert>
        {list.hasMore && <div ref={sentinel} className="h-1" />}
        {!list.initialLoading && list.total > 0 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">Showing {list.items.length} of {list.total}</p>}
      </div>

      {viewing && <SaleModal id={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function BarList({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="card p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {!rows.length && <p className="text-sm text-slate-500">No data.</p>}
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="mb-1 flex justify-between gap-2 text-sm">
              <span className="truncate text-slate-700">{r.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{formatMoney(r.value)} <span className="text-xs font-normal text-slate-400">· {r.sub}</span></span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SaleModal({ id, onClose }) {
  const sale = useApi(`/sales/${id}`);
  return (
    <Modal
      open
      size="max-w-xl"
      title={sale.data ? `Receipt ${sale.data.receiptNo}` : 'Receipt'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn-primary" disabled={!sale.data} onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>
        </>
      }
    >
      {sale.loading && <SkeletonText lines={8} />}
      <Alert>{sale.error?.message}</Alert>
      {sale.data && (
        <>
          <div className="overflow-x-auto rounded-lg bg-slate-100 p-4">
            <div className="mx-auto w-fit bg-white p-3 shadow"><Receipt sale={sale.data} /></div>
          </div>
          <PrintPortal pageCss="size: 80mm 297mm; margin: 4mm"><Receipt sale={sale.data} /></PrintPortal>
        </>
      )}
    </Modal>
  );
}
