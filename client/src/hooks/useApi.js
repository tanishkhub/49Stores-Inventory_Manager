import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

// Fetch a single resource when the component mounts (lazy fetch: nothing loads until the page is opened).
//   const { data, loading, error, reload } = useApi('/roles');
export function useApi(path, { params, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: Boolean(enabled), error: null });
  const paramsKey = JSON.stringify(params || {});

  const load = useCallback(
    async (signal) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await api.get(path, { params: JSON.parse(paramsKey), signal });
        setState({ data, loading: false, error: null });
      } catch (error) {
        if (error.name !== 'AbortError') setState({ data: null, loading: false, error });
      }
    },
    [path, paramsKey],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  return { ...state, reload: () => load() };
}
