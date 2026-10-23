import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';

export default function ForbiddenPage() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <ShieldOff className="mx-auto h-10 w-10 text-slate-400" />
      <h1 className="mt-4 text-lg font-semibold">You don't have access to this page</h1>
      <p className="mt-2 text-sm text-slate-500">Ask a Super Admin to enable it for your role.</p>
      <Link to="/" className="btn-secondary mt-6">Go home</Link>
    </div>
  );
}
