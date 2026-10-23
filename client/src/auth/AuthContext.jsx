import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, tokenStore, UNAUTHORIZED_EVENT } from '../lib/api';
import { AuthContext } from './authContextValue';

const FOCUS_THROTTLE_MS = 30_000; // don't re-fetch /auth/me more than once per 30 s on focus

// Holds the logged-in user, their role and the live permission map from GET /api/auth/me.
// Permissions are re-fetched when the window regains focus so runtime RBAC changes show up quickly.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(tokenStore.get() ? 'loading' : 'anonymous');
  const lastRefreshAt = useRef(0);

  const clear = useCallback(() => {
    tokenStore.clear();
    setSession(null);
    setStatus('anonymous');
    lastRefreshAt.current = 0;
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return clear();
    try {
      const data = await api.get('/auth/me');
      lastRefreshAt.current = Date.now();
      setSession(data);
      setStatus('authenticated');
    } catch (err) {
      if (err.status === 401) clear();
      else setStatus((s) => (s === 'loading' ? 'error' : s));
    }
  }, [clear]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, clear);
    const onFocus = () => {
      if (!tokenStore.get()) return;
      if (Date.now() - lastRefreshAt.current < FOCUS_THROTTLE_MS) return;
      refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, clear);
      window.removeEventListener('focus', onFocus);
    };
  }, [clear, refresh]);

  const login = useCallback(async (email, password) => {
    const { token, ...data } = await api.post('/auth/login', { email, password });
    tokenStore.set(token);
    lastRefreshAt.current = Date.now();
    setSession(data);
    setStatus('authenticated');
    return data;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* clear locally regardless */ }
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({
      status,
      user: session?.user ?? null,
      permissions: session?.permissions ?? {},
      pages: session?.pages ?? [],
      isSuperAdmin: Boolean(session?.user?.role?.isSuperAdmin),
      login,
      logout,
      refresh,
    }),
    [status, session, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
