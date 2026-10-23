import { useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth, usePermission } from '../../../auth/hooks';
import { useApi } from '../../../hooks/useApi';
import { useInfiniteList } from '../../../hooks/useInfiniteList';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { SkeletonTableRows, Skeleton } from '../../../components/skeleton/Skeleton';
import PageHeader from '../../../components/ui/PageHeader';
import Modal from '../../../components/ui/Modal';
import Alert from '../../../components/ui/Alert';

const EMPTY_FORM = { name: '', email: '', password: '', roleId: '', storeIds: [], isActive: true };

// Reference implementation of the list pattern: debounced search + skeleton rows + scroll-to-load.
export default function UsersPage() {
  const perm = usePermission('users');
  const { user: me, isSuperAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const { sentinel, ...list } = useInfiniteList('/users', { params: { search: debouncedSearch }, limit: 20 });
  const [editing, setEditing] = useState(null);

  async function onDelete(u) {
    if (!window.confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${u._id}`);
      list.setItems((items) => items.filter((i) => i._id !== u._id));
    } catch (err) {
      window.alert(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Create accounts and assign each user a role and stores."
        actions={
          perm.add && (
            <button type="button" className="btn-primary" onClick={() => setEditing(EMPTY_FORM)}>
              <Plus className="h-4 w-4" /> Add user
            </button>
          )
        }
      />

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-4">
          <label className="relative block max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {list.items.map((u) => {
                const locked = u.role?.isSuperAdmin && !isSuperAdmin;
                return (
                  <tr key={u._id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{u.role?.name || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${u.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {perm.update && !locked && (
                          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit" onClick={() => setEditing({ ...u, password: '' })}>
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {perm.delete && !locked && u._id !== me?.id && (
                          <button type="button" className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Delete" onClick={() => onDelete(u)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {list.loading && <SkeletonTableRows rows={list.initialLoading ? 6 : 2} columns={5} />}
            </tbody>
          </table>
        </div>
        {!list.loading && !list.items.length && !list.error && <p className="p-6 text-center text-sm text-slate-500">No users found.</p>}
        <Alert className="m-4">{list.error?.message}</Alert>
        {list.hasMore && <div ref={sentinel} className="h-1" />}
        {!list.initialLoading && list.total > 0 && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            Showing {list.items.length} of {list.total}
          </p>
        )}
      </div>

      {editing && (
        <UserFormModal
          initial={editing}
          canAssignSuperAdmin={isSuperAdmin}
          isSelf={editing._id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function UserFormModal({ initial, canAssignSuperAdmin, isSelf, onClose, onSaved }) {
  const isNew = !initial._id;
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial, roleId: initial.roleId || '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const roles = useApi('/roles');
  // Store assignment appears automatically once the Stores feature exposes GET /api/stores.
  const stores = useApi('/stores', { params: { limit: 100 } });
  const storeItems = Array.isArray(stores.data) ? stores.data : stores.data?.items;
  const roleOptions = (roles.data?.items || []).filter((r) => canAssignSuperAdmin || !r.isSuperAdmin);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = { name: form.name, email: form.email, roleId: form.roleId, isActive: form.isActive, storeIds: form.storeIds || [] };
    if (form.password) body.password = form.password;
    try {
      if (isNew) await api.post('/users', body);
      else await api.put(`/users/${initial._id}`, body);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isNew ? 'Add user' : `Edit ${initial.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="user-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="user-form" className="space-y-4" onSubmit={onSubmit}>
        <Alert>{error}</Alert>
        <div>
          <label className="label" htmlFor="u-name">Name</label>
          <input id="u-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="u-email">Email</label>
          <input id="u-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="u-password">{isNew ? 'Password' : 'New password (optional)'}</label>
          <input
            id="u-password"
            type="password"
            autoComplete="new-password"
            className="input"
            value={form.password}
            minLength={8}
            placeholder="At least 8 characters"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={isNew}
          />
        </div>
        <div>
          <label className="label" htmlFor="u-role">Role</label>
          {roles.loading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <select id="u-role" className="input" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} required disabled={isSelf}>
              <option value="" disabled>Select a role</option>
              {roleOptions.map((r) => (
                <option key={r._id} value={r._id}>{r.name}</option>
              ))}
            </select>
          )}
        </div>
        {storeItems && (
          <fieldset>
            <legend className="label">Stores</legend>
            <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
              {storeItems.map((s) => (
                <label key={s._id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={form.storeIds?.includes(s._id)}
                    onChange={(e) =>
                      setForm({ ...form, storeIds: e.target.checked ? [...(form.storeIds || []), s._id] : form.storeIds.filter((id) => id !== s._id) })
                    }
                  />
                  {s.name}
                </label>
              ))}
              {!storeItems.length && <p className="text-sm text-slate-500">No stores yet.</p>}
            </div>
          </fieldset>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} disabled={isSelf} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Active
        </label>
      </form>
    </Modal>
  );
}
