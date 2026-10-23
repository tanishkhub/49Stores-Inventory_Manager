import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './hooks';
import BrandLoader from '../components/brand/BrandLoader';
import ForbiddenPage from '../pages/ForbiddenPage';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <BrandLoader fullScreen label="Loading your workspace" />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

export function RequirePermission({ pageKey, action = 'view', children }) {
  const { permissions } = useAuth();
  if (!permissions[pageKey]?.[action]) return <ForbiddenPage />;
  return children;
}
