import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, UNAUTHORIZED_EVENT } from '../lib/api';
import { AuthContext } from './authContextValue';

// Holds the logged-in user, their role and the live permission map from GET /api/auth/me.
// Permissions are re-fetched when the window regains focus so runtime RBAC changes show up quickly.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(tokenStore.get() ? 'loading' : 'anonymous');

  const clear = useCallback(() => {
    tokenStore.clear();
    setSession(null);
    setStatus('anonymous');
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return clear();
    try {
      const data = await api.get('/auth/me');
      setSession(data);
      setStatus('authenticated');
    } catch (err) {
      if (err.status === 401) clear();
      else setStatus((s) => (s === 'loading' ? 'error' : s));
    }
  }, [clear]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, clear);
    const onFocus = () => tokenStore.get() && refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, clear);
      window.removeEventListener('focus', onFocus);
    };
  }, [clear, refresh]);

  const login = useCallback(async (email, password) => {
    const { token, ...data } = await api.post('/auth/login', { email, password });
    tokenStore.set(token);
    setSession(data);
    setStatus('authenticated');
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Token may already be invalid; clear locally regardless.
    }
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
