import { formatMoney } from '../shared/format';

export function describeDiscount(d = {}) {
  if (!d.value) return 'No member discount';
  const parts = [d.type === 'flat' ? `${formatMoney(d.value)} off` : `${d.value}% off`];
  parts.push(d.categories?.length ? `on ${d.categories.join(', ')}` : 'on every bill');
  if (d.maxDiscount > 0) parts.push(`(max ${formatMoney(d.maxDiscount)})`);
  if (d.minPurchase > 0) parts.push(`for bills of ${formatMoney(d.minPurchase)}+`);
  return parts.join(' ');
}
