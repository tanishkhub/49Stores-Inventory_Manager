import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequirePermission } from '../auth/guards';
import { useAuth } from '../auth/hooks';
import { navEntries, resolvePageComponent } from '../navConfig';
import AppLayout from '../components/layout/AppLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageSkeleton } from '../components/skeleton/Skeleton';
import LoginPage from '../pages/LoginPage';
import NotFoundPage from '../pages/NotFoundPage';
import NoAccessPage from '../pages/NoAccessPage';

// Route table generated from navConfig; feature modules never edit this file.
const routeTable = navEntries.map((entry) => ({ ...entry, Component: resolvePageComponent(entry.component) }));

function LandingRedirect() {
  const { permissions } = useAuth();
  const first = routeTable.find((r) => r.showInNav && permissions[r.pageKey]?.[r.action] && !r.path.includes(':'));
  return first ? <Navigate to={first.path} replace /> : <NoAccessPage />;
}

export default function AppRoutes() {
  const { permissions } = useAuth();
  const hasRootRoute = routeTable.some((r) => r.path === '/' && permissions[r.pageKey]?.[r.action]);

  return (
    <ErrorBoundary>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          {!hasRootRoute && <Route index element={<LandingRedirect />} />}
          {routeTable.map(({ path, pageKey, action, Component, source }) => (
            <Route
              key={`${source}:${path}`}
              path={path}
              element={
                <RequirePermission pageKey={pageKey} action={action}>
                  <ErrorBoundary key={path}>
                    <Suspense fallback={<PageSkeleton />}>
                      <Component />
                    </Suspense>
                  </ErrorBoundary>
                </RequirePermission>
              }
            />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      </Routes>
    </ErrorBoundary>
  );
}
