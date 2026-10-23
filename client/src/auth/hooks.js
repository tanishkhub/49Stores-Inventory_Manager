import { useContext } from 'react';
import { AuthContext } from './authContextValue';

const NONE = Object.freeze({ view: false, add: false, update: false, delete: false });

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// const { view, add, update, delete: canDelete } = usePermission('inventory');
export function usePermission(pageKey) {
  const { permissions } = useAuth();
  return permissions[pageKey] || NONE;
}
