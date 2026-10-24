import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

// Fetch a single resource when the component mounts (lazy fetch: nothing loads until the page is opened).
//   const { data, loading, error, reload } = useApi('/roles');
//
// NOTE: no AbortSignal is passed to api.get on purpose. A signal makes api.js skip its
// 30 s stale-while-revalidate cache AND its in-flight request dedup — every page mount
// would hit the network. An `alive` flag gives the same unmount safety while letting
// requests complete (and populate the cache for the next mount).
export function useApi(path, { params, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: Boolean(enabled), error: null });
  const paramsKey = JSON.stringify(params || {});
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.get(path, { params: JSON.parse(paramsKey) });
      if (aliveRef.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (aliveRef.current && error.name !== 'AbortError') setState({ data: null, loading: false, error });
    }
  }, [path, paramsKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    aliveRef.current = true;
    load();
    return () => {
      aliveRef.current = false;
    };
  }, [enabled, load]);

  return { ...state, reload: () => load() };
}
