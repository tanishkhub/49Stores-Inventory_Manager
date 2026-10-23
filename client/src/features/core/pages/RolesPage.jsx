import { useEffect, useMemo, useState } from 'react';
import { Lock, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../auth/hooks';
import { useApi } from '../../../hooks/useApi';
import { Skeleton, SkeletonText } from '../../../components/skeleton/Skeleton';
import PageHeader from '../../../components/ui/PageHeader';
import Modal from '../../../components/ui/Modal';
import Alert from '../../../components/ui/Alert';

const ACTIONS = ['view', 'add', 'update', 'delete'];

export default function RolesPage() {
  const { isSuperAdmin, refresh: refreshSession } = useAuth();
  const roles = useApi('/roles');
  const pages = useApi('/pages');
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);

  const roleItems = useMemo(() => roles.data?.items || [], [roles.data]);
  const selected = roleItems.find((r) => r._id === selectedId) || roleItems[0];

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Toggle which pages each role can see and which actions it can perform. Changes apply immediately."
        actions={
          isSuperAdmin && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New role
            </button>
          )
        }
      />
      <Alert className="mb-4">{roles.error?.message || pages.error?.message}</Alert>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="card h-fit p-2">
          {roles.loading
            ? Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="p-3">
                  <Skeleton className="mb-2 h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))
            : roleItems.map((r) => (
                <button
                  key={r._id}
                  type="button"
                  onClick={() => setSelectedId(r._id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left transition ${selected?._id === r._id ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    {r.name}
                    {r.isSystem && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">system</span>}
                  </span>
                  <span className="text-xs text-slate-500">{r.userCount} user{r.userCount === 1 ? '' : 's'}</span>
                </button>
              ))}
        </div>

        {roles.loading || pages.loading ? (
          <div className="card p-6">
            <Skeleton className="mb-4 h-6 w-48" />
            <SkeletonText lines={6} />
          </div>
        ) : selected ? (
          <RoleEditor
            key={selected._id}
            role={selected}
            pages={pages.data?.items || []}
            editable={isSuperAdmin}
            onChanged={async ({ deleted } = {}) => {
              if (deleted) setSelectedId(null);
              await roles.reload();
              refreshSession();
            }}
          />
        ) : null}
      </div>

      {creating && (
        <RoleFormModal
          onClose={() => setCreating(false)}
          onSaved={async (role) => {
            setCreating(false);
            await roles.reload();
            setSelectedId(role._id);
          }}
        />
      )}
    </div>
  );
}

function RoleEditor({ role, pages, editable, onChanged }) {
  const detail = useApi(`/roles/${role._id}`);
  const [draft, setDraft] = useState(null);
  const [meta, setMeta] = useState({ name: role.name, description: role.description || '' });
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const locked = role.isSuperAdmin || !editable;

  useEffect(() => {
    if (detail.data) setDraft(detail.data.permissions);
  }, [detail.data]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const p of pages) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group).push(p);
    }
    return [...map.entries()];
  }, [pages]);

  const dirty = draft && detail.data && JSON.stringify(draft) !== JSON.stringify(detail.data.permissions);
  const metaDirty = meta.name !== role.name || meta.description !== (role.description || '');

  function toggle(pageKey, action, value) {
    setDraft((d) => {
      const next = { ...d[pageKey], [action]: value };
      if (action !== 'view' && value) next.view = true;
      if (action === 'view' && !value) for (const a of ACTIONS) next[a] = false;
      return { ...d, [pageKey]: next };
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      if (metaDirty) await api.put(`/roles/${role._id}`, meta);
      if (dirty) {
        const changed = Object.fromEntries(
          Object.entries(draft).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(detail.data.permissions[k])),
        );
        await api.put(`/roles/${role._id}/permissions`, { permissions: changed });
      }
      await detail.reload();
      setMessage({ tone: 'success', text: 'Saved. Users with this role see the change on their next page load.' });
      onChanged();
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    try {
      await api.delete(`/roles/${role._id}`);
      onChanged({ deleted: true });
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    }
  }

  return (
    <div className="card min-w-0">
      <div className="space-y-3 border-b border-slate-200 p-5">
        {editable ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="role-name">Name</label>
              <input id="role-name" className="input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="role-desc">Description</label>
              <input id="role-desc" className="input" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold">{role.name}</h2>
            <p className="text-sm text-slate-500">{role.description}</p>
          </div>
        )}
        {role.isSuperAdmin && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Lock className="h-4 w-4" /> Super Admin always has full access to every page.
          </p>
        )}
        {!editable && <p className="text-sm text-slate-500">Only a Super Admin can change roles and permissions.</p>}
      </div>

      <div className="overflow-x-auto">
        {!draft ? (
          <div className="p-5"><SkeletonText lines={6} /></div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Page</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="px-3 py-3 text-center font-medium">{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, groupPages]) => (
                <GroupRows key={group} group={group} pages={groupPages} draft={draft} locked={locked} onToggle={toggle} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
          <div className="min-w-0 flex-1">{message && <Alert tone={message.tone}>{message.text}</Alert>}</div>
          <div className="flex gap-2">
            {!role.isSystem && (
              <button type="button" className="btn-secondary text-red-600" onClick={remove}>
                <Trash2 className="h-4 w-4" /> Delete role
              </button>
            )}
            <button type="button" className="btn-primary" onClick={save} disabled={saving || (!dirty && !metaDirty)}>
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupRows({ group, pages, draft, locked, onToggle }) {
  return (
    <>
      <tr className="border-t border-slate-200 bg-slate-50/60">
        <td colSpan={ACTIONS.length + 1} className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{group}</td>
      </tr>
      {pages.map((page) => (
        <tr key={page.key} className="border-t border-slate-100">
          <td className="px-5 py-3">
            <p className="font-medium text-slate-900">{page.label}</p>
            {page.description && <p className="text-xs text-slate-500">{page.description}</p>}
          </td>
          {ACTIONS.map((a) => {
            const supported = page.actions.includes(a);
            return (
              <td key={a} className="px-3 py-3 text-center">
                {supported ? (
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    aria-label={`${page.label} ${a}`}
                    checked={Boolean(draft[page.key]?.[a])}
                    disabled={locked}
                    onChange={(e) => onToggle(page.key, a, e.target.checked)}
                  />
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function RoleFormModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      onSaved(await api.post('/roles', form));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title="New role"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="role-form" className="btn-primary" disabled={saving || !form.name.trim()}>Create</button>
        </>
      }
    >
      <form id="role-form" className="space-y-4" onSubmit={onSubmit}>
        <Alert>{error}</Alert>
        <div>
          <label className="label" htmlFor="new-role-name">Name</label>
          <input id="new-role-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
        </div>
        <div>
          <label className="label" htmlFor="new-role-desc">Description</label>
          <input id="new-role-desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <p className="text-xs text-slate-500">New roles start with no access. Enable pages after creating it.</p>
      </form>
    </Modal>
  );
}
