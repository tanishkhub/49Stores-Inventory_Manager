const LOCALE = import.meta.env.VITE_LOCALE || 'en-IN';
const CURRENCY = import.meta.env.VITE_CURRENCY || 'INR';

const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' });

export const formatMoney = (n) => money.format(Number(n) || 0);
export const formatDateTime = (d) => (d ? dateTime.format(new Date(d)) : '—');
export const formatDate = (d) => (d ? dateOnly.format(new Date(d)) : '—');

// <input type="date"> value (local calendar day) -> ISO instant at local start / end of that day.
export function dayStartIso(value) {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}
export function dayEndIso(value) {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}
export function localDateInput(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
