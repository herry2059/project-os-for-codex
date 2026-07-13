import { useEffect, useState } from 'react';
import {
  myWorkspaces,
  currentWorkspace,
  switchWorkspace,
  createWorkspace,
  workspaceMembers,
  workspaceInvite,
  rotateWorkspaceInvite,
  removeMember,
  setMemberRemark,
  joinRequests,
  reviewJoinRequest,
  type Workspace,
  type WorkspaceMember,
  type JoinRequest,
} from '@/lib/saas';
import { Building2, Check, Copy, RefreshCw, Users, Plus, UserPlus, UserMinus, Pencil } from 'lucide-react';
import Tabs from '@/components/Tabs';

export default function WorkspacePage() {
  const [current, setCurrent] = useState<Workspace | null>(null);
  const [spaces, setSpaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [invite, setInvite] = useState<{ code: string; url: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    currentWorkspace().then(setCurrent);
    myWorkspaces().then(setSpaces);
    workspaceMembers().then(setMembers);
    joinRequests().then(setRequests);
    workspaceInvite().then(setInvite);
  };
  useEffect(load, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Copied');
      setTimeout(() => setMsg(''), 1500);
    } catch {
      setMsg('Copy failed');
    }
  };
  const doSwitch = async (id: string) => {
    if (await switchWorkspace(id)) window.location.reload();
    else setMsg('Could not switch workspace');
  };
  const doCreate = async () => {
    if (!newName.trim()) return;
    const r = await createWorkspace(newName.trim());
    if (!r) return setMsg('Could not create workspace');
    setNewName('');
    setCreating(false);
    setMsg('Workspace created and ready to use.');
    load();
  };
  const doRotate = async () => {
    const r = await rotateWorkspaceInvite();
    if (r) setInvite(r);
  };
  const doReviewJoin = async (requestId: string, approve: boolean) => {
    if (await reviewJoinRequest(requestId, approve)) load();
    else setMsg('Operation failed');
  };
  const canManage = current?.role === 'owner' || current?.role === 'admin';
  const doRemark = async (m: WorkspaceMember) => {
    const remark = window.prompt(`Set a workspace-only note for ${m.displayName}:`, m.remark || '')?.trim();
    if (remark === undefined) return;
    if (await setMemberRemark(m.userId, remark)) load();
    else setMsg('Could not save the note');
  };
  const doRemoveMember = async (m: WorkspaceMember) => {
    if (m.role === 'owner') return setMsg('The workspace owner cannot be removed.');
    if (!window.confirm(`Remove ${m.displayName} from this workspace? They will lose access immediately.`)) return;
    if (await removeMember(m.userId)) load();
    else setMsg('Could not remove the member');
  };

  return (
    <div className="max-w-3xl space-y-6">
      {msg && <div className="card px-3 py-2 text-sm text-white/70">{msg}</div>}

      <Tabs
        items={[
          {
            key: 'space', label: 'Workspace', icon: <Building2 size={15} />, node: (
      <div className="space-y-6">
      {/* Current workspace */}
      <section className="card p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl2 border border-white/10 bg-white/10">
            <Building2 size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold text-white">{current?.name || 'Current workspace'}</div>
            <div className="text-xs text-ink-400">
              My role: {current?.role || '-'}
              {current?.status && current.status !== 'active' && <span className="text-amber-200"> ({current.status === 'pending' ? 'pending approval' : 'suspended'})</span>}
            </div>
          </div>
        </div>
      </section>

      {/* Invitations */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-white/75 mb-2">Invite collaborators</h2>
        <p className="text-xs text-ink-400 mb-3">Send the invite link. The recipient enters its code during registration, then waits for an administrator to approve the request.</p>
        {invite ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-xs text-white/80">{invite.url}</code>
              <button className="btn-soft" onClick={() => copy(invite.url)}><Copy size={14} /> Copy link</button>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-400">
              Invite code: <span className="font-mono text-white/80">{invite.code}</span>
              <button className="btn-ghost text-xs" onClick={() => copy(invite.code)}><Copy size={12} /> Copy code</button>
              <button className="btn-ghost text-xs" onClick={doRotate}><RefreshCw size={12} /> Rotate</button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-white/30">Invite information is unavailable.</div>
        )}
      </section>

      {/* Workspace list, switching, and creation */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white/75">My workspaces</h2>
          <button className="btn-soft text-xs" onClick={() => setCreating((v) => !v)}><Plus size={13} /> New workspace</button>
        </div>
        {creating && (
          <div className="mb-3 flex gap-2">
            <input className="input" placeholder="New workspace name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn-primary shrink-0" onClick={doCreate}>Create</button>
          </div>
        )}
        {spaces.length === 0 ? (
          <div className="text-xs text-white/30">No additional workspaces are available.</div>
        ) : (
          <div className="space-y-2">
            {spaces.map((w) => (
              <div key={w.id} className={`flex items-center gap-3 rounded-xl2 border px-3 py-2.5 ${w.current ? 'border-brand-400 bg-white/10' : 'border-white/10'}`}>
                <Building2 size={16} className="text-ink-400" />
                <span className="font-medium text-ink-900">{w.name}</span>
                <span className="text-xs text-ink-400">{w.role}</span>
                {w.current ? (
                  <span className="ml-auto text-xs text-emerald-200 inline-flex items-center gap-1"><Check size={12} />Current</span>
                ) : (
                  <button className="ml-auto btn-soft text-xs" onClick={() => doSwitch(w.id)}>Switch</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
            ),
          },
          {
            key: 'members', label: 'Members', icon: <Users size={15} />, node: (
      <div className="space-y-6">
      {/* Join requests requiring approval */}
      {requests.length > 0 && (
        <section className="card p-5 border-cyan-200/20">
          <h2 className="text-sm font-semibold text-cyan-100 mb-3 flex items-center gap-1.5"><UserPlus size={15} />Pending join requests</h2>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl2 border border-white/10 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white">{r.displayName}</div>
                  <div className="text-xs text-ink-400">{r.email} - {new Date(r.createdAt).toLocaleString('en-US')}</div>
                </div>
                <button className="btn-primary text-xs" onClick={() => doReviewJoin(r.id, true)}>Approve</button>
                <button className="btn-ghost text-xs" onClick={() => doReviewJoin(r.id, false)}>Reject</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Member list and removal controls */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-white/75 mb-3 flex items-center gap-1.5"><Users size={15} />Workspace members</h2>
        {members.length === 0 ? (
          <div className="text-xs text-white/30">No members are available. Membership is isolated to this workspace.</div>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 rounded-xl2 border border-white/10 px-3 py-2 text-sm">
                <span className="font-medium text-white">{m.displayName}</span>
                {m.remark && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">Note: {m.remark}</span>}
                <span className="text-xs text-ink-400">{m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Administrator' : 'Member'}</span>
                {m.self && <span className="text-[11px] text-cyan-200">(you)</span>}
                {(m.self || canManage) && (
                  <button className="btn-ghost text-xs" onClick={() => doRemark(m)} title={m.self ? 'Set your workspace note' : 'Set a note for this member'}>
                    <Pencil size={12} /> Note
                  </button>
                )}
                {m.role !== 'owner' && canManage && !m.self && (
                  <button className="btn-ghost text-xs text-rose-200 hover:text-rose-100" onClick={() => doRemoveMember(m)} title="Remove from workspace">
                    <UserMinus size={13} /> Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-white/30">Membership is workspace-scoped. Invitations and removals here do not affect any other workspace.</p>
      </section>
      </div>
            ),
          },
        ]}
      />
    </div>
  );
}
