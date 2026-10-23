import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../auth/hooks';
import { visibleNavGroups } from '../../navConfig';
import Logo from '../brand/Logo';

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

// Rendered entirely from navConfig entries filtered by the user's RBAC permissions.
export default function Sidebar({ onClose }) {
  const { user, permissions, logout, refresh } = useAuth();
  const groups = visibleNavGroups(permissions);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo size={34} withName nameClassName="text-lg" />
        <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={onClose} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main">
        {groups.map((group) => (
          <div key={group.name}>
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{group.name}</p>
            <ul className="space-y-1">
              {group.items.map(({ path, label, icon: Icon }) => (
                <li key={path}>
                  <NavLink
                    to={path}
                    end
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    }
                  >
                    {Icon ? <Icon className="h-4.5 w-4.5 shrink-0" /> : <span className="h-4.5 w-4.5 shrink-0 rounded bg-slate-200" />}
                    <span className="truncate">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups.length === 0 && <p className="px-3 text-sm text-slate-500">No pages are enabled for your role.</p>}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">{initials(user?.name)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">{user?.role?.name}</p>
          </div>
          <button type="button" onClick={handleRefresh} disabled={refreshing} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50" title="Refresh permissions" aria-label="Refresh permissions">
            <RefreshCw className={`h-4.5 w-4.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={logout} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Log out" aria-label="Log out">
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
