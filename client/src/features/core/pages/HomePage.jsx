import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../../auth/hooks';
import { visibleNavGroups } from '../../../navConfig';
import PageHeader from '../../../components/ui/PageHeader';

export default function HomePage() {
  const { user, permissions } = useAuth();
  const shortcuts = visibleNavGroups(permissions)
    .flatMap((g) => g.items)
    .filter((item) => item.path !== '/');

  return (
    <div>
      <PageHeader title={`Welcome, ${user?.name?.split(' ')[0] || 'there'}`} description={`Signed in as ${user?.role?.name}.`} />
      {shortcuts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map(({ path, label, icon: Icon, group }, i) => (
            <Link
              key={path}
              to={path}
              className="card group animate-fade-up p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                {Icon ? <Icon className="h-5 w-5" /> : null}
              </span>
              <p className="mt-4 font-medium text-slate-900">{label}</p>
              <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                {group}
                <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card p-6 text-sm text-slate-500">More pages will appear here as features are enabled for your role.</div>
      )}
    </div>
  );
}
