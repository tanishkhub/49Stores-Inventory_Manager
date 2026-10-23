import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

// Searchable dropdown backed by a paginated list endpoint ({ items }), e.g. /products or /customers.
//   <AsyncPicker path="/products" value={product} onChange={setProduct} getLabel={(p) => p.name} />
export default function AsyncPicker({ path, value, onChange, getLabel, getSub, placeholder = 'Search…', id, params, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q);
  const [state, setState] = useState({ items: [], loading: false, error: '' });
  const boxRef = useRef(null);
  const paramsKey = JSON.stringify(params || {});

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    api
      .get(path, { params: { ...JSON.parse(paramsKey), q: debounced, limit: 20 }, signal: controller.signal })
      .then((data) => setState({ items: data.items || [], loading: false, error: '' }))
      .catch((err) => err.name !== 'AbortError' && setState({ items: [], loading: false, error: err.message }));
    return () => controller.abort();
  }, [open, debounced, path, paramsKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      {value && !open ? (
        <div className="input flex items-center justify-between gap-2">
          <button type="button" id={id} className="min-w-0 flex-1 truncate text-left" onClick={() => !disabled && setOpen(true)} disabled={disabled}>
            {getLabel(value)}
          </button>
          {!disabled && (
            <button type="button" className="rounded p-0.5 text-slate-400 hover:text-slate-700" onClick={() => onChange(null)} aria-label="Clear">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <label className="relative block">
          <input
            id={id}
            className="input pr-8"
            placeholder={placeholder}
            value={q}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            autoComplete="off"
          />
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </label>
      )}
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {state.loading && (
            <p className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}
          {state.error && <p className="px-3 py-2 text-sm text-red-600">{state.error}</p>}
          {!state.loading && !state.error && !state.items.length && <p className="px-3 py-2 text-sm text-slate-500">No matches.</p>}
          {!state.loading &&
            state.items.map((item) => (
              <button
                type="button"
                key={item._id}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                  setQ('');
                }}
              >
                <span className="block truncate font-medium text-slate-800">{getLabel(item)}</span>
                {getSub && <span className="block truncate text-xs text-slate-500">{getSub(item)}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
