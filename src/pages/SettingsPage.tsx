import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  listUsersApi,
  addUserApi,
  updateUserApi,
  deleteUserApi,
  listKbKeysApi,
  createKbKeyApi,
  revokeKbKeyApi,
  removeKbKeyApi,
  type UserAccount,
  type KbApiKey,
  getAuthState,
} from '@/lib/api';
import { Empty } from '@/components/ui';
import { Plus, Trash2, KeyRound, ShieldCheck, Copy, UserCircle2, Users, BookOpen } from 'lucide-react';
import { workspaceConnections, type WorkspaceConnections } from '@/lib/saas';
import ProfilePage from './ProfilePage';

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') || 'profile') as 'profile' | 'team' | 'kb';
  const [users, setUsers] = useState<UserAccount[] | null>(null);
  const [kbKeys, setKbKeys] = useState<KbApiKey[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ username: string; displayName: string; password: string; role: 'admin' | 'member' }>({
    username: '',
    displayName: '',
    password: '',
    role: 'member',
  });
  const [err, setErr] = useState('');
  const [keyForm, setKeyForm] = useState({ name: 'Knowledge API', ownerName: '' });
  const [newToken, setNewToken] = useState('');
  const [connections, setConnections] = useState<WorkspaceConnections | null>(null);
  const kbBaseUrl = connections?.kb?.baseUrl || `${window.location.origin}/api/w/default/kb/v1`;

  const load = () => {
    listUsersApi().then(setUsers);
    listKbKeysApi().then(setKbKeys);
    workspaceConnections().then(setConnections);
  };
  useEffect(() => {
    load();
    getAuthState().then((a) => setIsAdmin(a.user?.role === 'admin'));
  }, []);

  const submit = async () => {
    setErr('');
    if (!form.username.trim() || !form.password.trim()) return;
    const r = await addUserApi(form);
    if (!r) {
      setErr('Could not add the member. The username may already exist or the backend may be unavailable.');
      return;
    }
    setForm({ username: '', displayName: '', password: '', role: 'member' });
    setAdding(false);
    load();
  };
  const setRole = async (u: UserAccount, role: 'admin' | 'member') => {
    const r = await updateUserApi(u.id, { role });
    if (!r) setErr('Could not change the role. The last administrator cannot be demoted.');
    load();
  };
  const toggleActive = async (u: UserAccount) => {
    const r = await updateUserApi(u.id, { active: !u.active });
    if (!r) setErr('Could not update status. The last administrator cannot be disabled.');
    load();
  };
  const resetPw = async (u: UserAccount) => {
    const pw = window.prompt(`Set a new password for ${u.displayName}:`);
    if (!pw) return;
    await updateUserApi(u.id, { password: pw });
    window.alert('Password reset');
  };
  const del = async (u: UserAccount) => {
    if (!window.confirm(`Remove member ${u.displayName}?`)) return;
    await deleteUserApi(u.id);
    load();
  };
  const createKey = async () => {
    setErr('');
    const r = await createKbKeyApi(keyForm);
    if (!r) {
      setErr('Could not create the knowledge key');
      return;
    }
    setNewToken(r.token);
    setKeyForm({ name: 'Knowledge API', ownerName: '' });
    load();
  };
  const revokeKey = async (k: KbApiKey) => {
    if (!window.confirm(`Disable ${k.name}? External tools will immediately lose access to the knowledge base.`)) return;
    await revokeKbKeyApi(k.id);
    load();
  };
  const removeKey = async (k: KbApiKey) => {
    if (k.status === 'active') {
      window.alert('Disable the key before deleting it.');
      return;
    }
    if (!window.confirm(`Delete ${k.name}? It will be removed from this list permanently.`)) return;
    await removeKbKeyApi(k.id);
    load();
  };
  const copyText = async (text: string, label = 'Copied') => {
    await navigator.clipboard.writeText(text);
    window.alert(label);
  };
  const kbImportText = (token: string) => [
    `Base URL: ${kbBaseUrl}`,
    'Auth: Bearer Token',
    `API Key: ${token}`,
    'Read public knowledge: GET /public',
    'Read or search knowledge: GET /items?q=keyword',
    'Create a draft: POST /items',
    'Semantic search: POST /search',
  ].join('\n');
  const copyToken = async () => {
    if (!newToken) return;
    await copyText(newToken, 'Key copied. Store it in a server-side secret manager now and never post it in public chat.');
  };
  const copyImport = async () => {
    if (!newToken) return;
    await copyText(kbImportText(newToken), 'Knowledge connection details copied.');
  };
  const switchTab = (next: 'profile' | 'team' | 'kb') => setSearchParams({ tab: next });
  const tabs = (
    <div className="flex flex-wrap gap-2 rounded-xl2 border border-white/10 bg-white/[0.03] p-1">
      <button className={`btn-ghost ${tab === 'profile' ? 'bg-white/10 text-white' : ''}`} onClick={() => switchTab('profile')}>
        <UserCircle2 size={15} /> My profile
      </button>
      {isAdmin && (
        <button className={`btn-ghost ${tab === 'team' ? 'bg-white/10 text-white' : ''}`} onClick={() => switchTab('team')}>
          <Users size={15} /> Members
        </button>
      )}
      {isAdmin && (
        <button className={`btn-ghost ${tab === 'kb' ? 'bg-white/10 text-white' : ''}`} onClick={() => switchTab('kb')}>
          <BookOpen size={15} /> Knowledge API
        </button>
      )}
    </div>
  );

  if (tab === 'profile' || !isAdmin) {
    return (
      <div className="max-w-4xl space-y-6">
        {tabs}
        <ProfilePage />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      {tabs}
      {tab === 'team' && (
      <section>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-500">Add workspace members, assign member or administrator roles, disable access, and reset passwords.</p>
        <button className="btn-primary" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} /> Add member
        </button>
      </div>

      {err && (
        <div className="card p-3 mb-4 border-amber-200/20 bg-amber-300/10 text-sm text-amber-100">{err}</div>
      )}

      {adding && (
        <div className="card p-5 mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Username *</label>
            <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className="label">Display name</label>
            <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <div>
            <label className="label">Initial password *</label>
            <input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'member' })}>
              <option value="member">Member</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn-primary disabled:opacity-40" disabled={!form.username.trim() || !form.password.trim()} onClick={submit}>
              Save
            </button>
          </div>
        </div>
      )}

      {!users ? (
        <Empty text="Loading…" />
      ) : users.length === 0 ? (
        <Empty text="No members yet. Use Add member to get started." />
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="card p-4 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink-900">{u.displayName}</span>
                  {u.role === 'admin' && (
                    <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-emerald-300/10 text-emerald-200 border border-emerald-200/20">
                      <ShieldCheck size={11} /> Administrator
                    </span>
                  )}
                  {!u.active && <span className="text-xs text-white/30">(disabled)</span>}
                </div>
                <div className="text-xs text-ink-400 mt-0.5">@{u.username}</div>
              </div>
              <select
                className="input w-24 py-1 text-sm"
                value={u.role}
                onChange={(e) => setRole(u, e.target.value as 'admin' | 'member')}
              >
                <option value="member">Member</option>
                <option value="admin">Administrator</option>
              </select>
              <button className="btn-soft text-xs" onClick={() => toggleActive(u)}>
                {u.active ? 'Disable' : 'Enable'}
              </button>
              <button className="text-white/30 hover:text-white p-1" title="Reset password" onClick={() => resetPw(u)}>
                <KeyRound size={15} />
              </button>
              <button className="text-white/30 hover:text-rose-300 p-1" onClick={() => del(u)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      </section>
      )}

      {tab === 'kb' && (
      <section className="border-t border-white/10 pt-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Knowledge API key</h2>
            <p className="mt-1 text-sm leading-6 text-ink-500">
              Authorize a team or AI tool to use the knowledge base. The key is shown once; writes become drafts and still require human review before publication.
            </p>
          </div>
        </div>

        {newToken && (
          <div className="card mb-4 border-emerald-200/20 bg-emerald-300/10 p-4">
            <div className="mb-2 text-sm font-medium text-emerald-100">This new key is shown only once</div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-xs text-white/80">{newToken}</code>
              <button className="btn-soft" onClick={copyToken}>
                <Copy size={14} /> Copy key
              </button>
              <button className="btn-soft" onClick={copyImport}>
                <Copy size={14} /> Copy setup
              </button>
              <button className="btn-ghost" onClick={() => setNewToken('')}>I saved it</button>
            </div>
          </div>
        )}

        <div className="card mb-4 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">API endpoints</h3>
            <p className="mt-1 text-xs text-white/40">These endpoints access this workspace knowledge base. They do not grant project Git access or AI service access.</p>
            </div>
            <button className="btn-soft shrink-0" onClick={() => copyText(kbBaseUrl, 'Knowledge Base URL copied.')}>
              <Copy size={14} /> Copy URL
            </button>
          </div>
          <div className="grid gap-2 text-xs text-white/55 md:grid-cols-2">
            <Endpoint label="Base URL" value={kbBaseUrl} />
            <Endpoint label="Public" value="GET /public - GET /llms.txt - GET /sitemap.xml" />
            <Endpoint label="Knowledge items" value="GET /items - POST /items - PUT /items/:id" />
            <Endpoint label="Semantic search" value="POST /search" />
          </div>
        </div>

        <div className="card mb-4 grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="label">Key name</label>
            <input className="input" value={keyForm.name} onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Owner</label>
            <input className="input" value={keyForm.ownerName} onChange={(e) => setKeyForm({ ...keyForm, ownerName: e.target.value })} />
          </div>
          <button className="btn-primary self-end" onClick={createKey}>
            <KeyRound size={15} /> Create key
          </button>
        </div>

        {!kbKeys ? (
          <Empty text="Loading…" />
        ) : kbKeys.length === 0 ? (
          <Empty text="No knowledge API keys yet" />
        ) : (
          <div className="space-y-2">
            {kbKeys.map((k) => (
              <div key={k.id} className="card flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink-900">{k.name}</div>
                  <div className="mt-0.5 text-xs text-ink-400">
                    {k.ownerName || 'No owner'} - prefix {k.tokenPrefix} - {k.status === 'active' ? 'active' : 'disabled'}
                  </div>
                  <div className="mt-1 text-xs text-white/30">Full historical keys are never displayed. Create a new key and copy it once when a replacement is needed.</div>
                </div>
                {k.status === 'active' && (
                  <button className="btn-soft text-xs" onClick={() => revokeKey(k)}>
                    Disable
                  </button>
                )}
                {k.status !== 'active' && (
                  <button className="btn-ghost text-xs text-rose-200" onClick={() => removeKey(k)}>
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  );
}

function Endpoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl2 border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-1 text-white/35">{label}</div>
      <code className="break-all text-white/70">{value}</code>
    </div>
  );
}
