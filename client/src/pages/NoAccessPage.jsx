import { useAuth } from '../auth/hooks';

export default function NoAccessPage() {
  const { user, logout } = useAuth();
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <h1 className="text-lg font-semibold">No pages enabled</h1>
      <p className="mt-2 text-sm text-slate-500">
        The role <strong>{user?.role?.name}</strong> has no pages enabled yet. Ask a Super Admin to grant access.
      </p>
      <button type="button" className="btn-secondary mt-6" onClick={logout}>Log out</button>
    </div>
  );
}
