import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, tokenStore, UNAUTHORIZED_EVENT } from '../lib/api';
import { AuthContext } from './authContextValue';

const FOCUS_THROTTLE_MS = 30_000; // don't re-fetch /auth/me more than once per 30 s on focus
const SESSION_KEY = 'inventory_poc.session';

// A cached copy of the last /auth/me payload lets a returning visit render the app
// shell instantly (no "Loading your workspace" gate) while the session revalidates
// in the background — important when the API cold-starts on serverless.
function readSessionSnapshot() {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return data && data.user ? data : null;
  } catch {
    return null;
  }
}

function writeSessionSnapshot(data) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: data.user, permissions: data.permissions, pages: data.pages }));
  } catch {
    // Storage unavailable/full — the snapshot is best-effort.
  }
}

// Holds the logged-in user, their role and the live permission map from GET /api/auth/me.
// Permissions are re-fetched when the window regains focus so runtime RBAC changes show up quickly.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => (tokenStore.get() ? readSessionSnapshot() : null));
  const [status, setStatus] = useState(() => {
    if (!tokenStore.get()) return 'anonymous';
    return readSessionSnapshot() ? 'authenticated' : 'loading';
  });
  const lastRefreshAt = useRef(0);

  const clear = useCallback(() => {
    tokenStore.clear();
    localStorage.removeItem(SESSION_KEY);
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
      writeSessionSnapshot(data);
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
    writeSessionSnapshot(data);
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
