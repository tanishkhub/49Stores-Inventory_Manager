import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

// Scroll-to-load list for any endpoint that returns { items, page, limit, total, hasMore }
// (see server/src/utils/paginate.js).
//
//   const { sentinel, ...list } = useInfiniteList('/inventory', { params: { search }, limit: 20 });
//   // list = { items, total, hasMore, loading, initialLoading, error, reload, loadMore, setItems }
//   ...
//   {list.hasMore && <div ref={sentinel} />}   // after the last row; next page loads when it scrolls into view
//
// Destructure `sentinel` separately: the React Compiler lint treats any object holding a ref as a ref.
export function useInfiniteList(path, { params = {}, limit = 20, enabled = true } = {}) {
  const [state, setState] = useState({ items: [], page: 0, total: 0, hasMore: true, loading: false, error: null });
  const paramsKey = JSON.stringify(params);
  const requestRef = useRef(0);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });

  const loadPage = useCallback(
    async (page) => {
      const requestId = ++requestRef.current;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await api.get(path, { params: { ...JSON.parse(paramsKey), page, limit } });
        if (requestId !== requestRef.current) return;
        setState((s) => ({
          items: page === 1 ? data.items : [...s.items, ...data.items],
          page,
          total: data.total ?? 0,
          hasMore: Boolean(data.hasMore),
          loading: false,
          error: null,
        }));
      } catch (error) {
        if (requestId !== requestRef.current) return;
        setState((s) => ({ ...s, loading: false, hasMore: false, error }));
      }
    },
    [path, paramsKey, limit],
  );

  const reload = useCallback(() => loadPage(1), [loadPage]);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (!s.loading && s.hasMore && !s.error) loadPage(s.page + 1);
  }, [loadPage]);

  useEffect(() => {
    if (!enabled) return;
    setState({ items: [], page: 0, total: 0, hasMore: true, loading: true, error: null });
    loadPage(1);
  }, [enabled, loadPage]);

  const observerRef = useRef(null);
  const sentinel = useCallback(
    (node) => {
      observerRef.current?.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
        rootMargin: '200px',
      });
      observerRef.current.observe(node);
    },
    [loadMore],
  );
  useEffect(() => () => observerRef.current?.disconnect(), []);

  return {
    ...state,
    initialLoading: state.loading && state.page === 0,
    loadMore,
    reload,
    sentinel,
    setItems: (updater) => setState((s) => ({ ...s, items: typeof updater === 'function' ? updater(s.items) : updater })),
  };
}
