import Logo from '../../../components/brand/Logo';
import { APP_NAME } from '../../../config/brand';
import { formatDate, formatDateTime, formatMoney } from '../../shared/format';

// Print-friendly bill. `variant="thermal"` is a 72 mm column for 80 mm receipt printers; "a4" is a full page.
export default function Receipt({ sale, variant = 'thermal' }) {
  const thermal = variant === 'thermal';
  const store = sale.store || {};
  return (
    <div
      className="mx-auto bg-white text-black"
      style={{ width: thermal ? '72mm' : '180mm', fontFamily: thermal ? 'ui-monospace, Menlo, Consolas, monospace' : 'Arial, Helvetica, sans-serif', fontSize: thermal ? '9pt' : '10.5pt' }}
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <Logo size={thermal ? 36 : 48} />
        <div className="font-bold" style={{ fontSize: thermal ? '11pt' : '14pt' }}>{APP_NAME}</div>
        <div className="font-semibold">{sale.storeName || store.name}</div>
        {(store.location || store.city) && <div>{[store.location, store.city].filter(Boolean).join(', ')}</div>}
        {store.phone && <div>Tel: {store.phone}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>Receipt</span><span className="font-semibold">{sale.receiptNo}</span></div>
      <div className="flex justify-between"><span>Date</span><span>{formatDateTime(sale.createdAt)}</span></div>
      {sale.soldByName && <div className="flex justify-between"><span>Cashier</span><span>{sale.soldByName}</span></div>}
      {sale.customerPhone && (
        <div className="flex justify-between"><span>Customer</span><span>{[sale.customerName, sale.customerPhone].filter(Boolean).join(' · ')}</span></div>
      )}
      <div className="my-2 border-t border-dashed border-black" />
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr className="text-left">
            <th className="pb-1 font-semibold">Item</th>
            <th className="pb-1 text-right font-semibold">Qty</th>
            {!thermal && <th className="pb-1 text-right font-semibold">Price</th>}
            <th className="pb-1 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it) => (
            <tr key={String(it.productId)} className="align-top">
              <td className="py-0.5 pr-1">
                {it.name}
                {thermal && <div style={{ fontSize: '8pt' }}>{it.quantity} × {formatMoney(it.unitPrice)}</div>}
                {!thermal && <div style={{ fontSize: '8.5pt', color: '#444' }}>{it.sku}</div>}
              </td>
              <td className="py-0.5 text-right">{it.quantity}</td>
              {!thermal && <td className="py-0.5 text-right">{formatMoney(it.unitPrice)}</td>}
              <td className="py-0.5 text-right">{formatMoney(it.lineTotal)}</td>
            </tr>
          ))}
          {(sale.memberships || []).map((m) => (
            <tr key={`m-${m.planId}`} className="align-top">
              <td className="py-0.5 pr-1">
                Membership: {m.planName} ({m.months} mo)
                <div style={{ fontSize: '8pt' }}>Valid {formatDate(m.startsAt)} – {formatDate(m.endsAt)}</div>
              </td>
              <td className="py-0.5 text-right">1</td>
              {!thermal && <td className="py-0.5 text-right">{formatMoney(m.price)}</td>}
              <td className="py-0.5 text-right">{formatMoney(m.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>Items</span><span>{sale.itemCount}</span></div>
      {sale.discount > 0 && (
        <>
          <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(sale.subtotal)}</span></div>
          <div className="flex justify-between"><span>{sale.discountLabel || 'Member discount'}</span><span>-{formatMoney(sale.discount)}</span></div>
        </>
      )}
      {sale.membershipTotal > 0 && <div className="flex justify-between"><span>Membership</span><span>{formatMoney(sale.membershipTotal)}</span></div>}
      <div className="flex justify-between font-bold" style={{ fontSize: thermal ? '11pt' : '13pt' }}><span>TOTAL</span><span>{formatMoney(sale.total)}</span></div>
      <div className="flex justify-between capitalize"><span>Paid by</span><span>{sale.paymentMethod}</span></div>
      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center">Thank you for shopping at {APP_NAME}!</p>
    </div>
  );
}
