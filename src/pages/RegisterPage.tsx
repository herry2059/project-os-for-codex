import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Rocket, Mail, ShieldCheck } from 'lucide-react';
import { LEGAL_VERSION } from './LegalPage';

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, '/');

async function post<T>(path: string, body: unknown): Promise<{ ok: boolean; data: T | null; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, data: null, error: (data && data.error) || 'Request failed' };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, data: null, error: 'Could not connect to the backend' };
  }
}

async function checkWorkspaceName(name: string): Promise<{ available: boolean; error?: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/workspaces/name-available?name=${encodeURIComponent(name)}`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => null);
    return { available: Boolean(res.ok && data?.available), error: data?.error || '' };
  } catch {
    return null;
  }
}

export default function RegisterPage({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [workspaceName, setWorkspaceName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);
  const [workspaceNameState, setWorkspaceNameState] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [workspaceNameMsg, setWorkspaceNameMsg] = useState('');

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  useEffect(() => {
    if (mode !== 'create') {
      setWorkspaceNameState('idle');
      setWorkspaceNameMsg('');
      return;
    }
    const clean = workspaceName.trim().replace(/\s+/g, ' ');
    if (!clean) {
      setWorkspaceNameState('idle');
      setWorkspaceNameMsg('');
      return;
    }
    if (clean.length < 2) {
      setWorkspaceNameState('taken');
      setWorkspaceNameMsg('Workspace names must be at least 2 characters');
      return;
    }
    setWorkspaceNameState('checking');
    const timer = window.setTimeout(async () => {
      const r = await checkWorkspaceName(clean);
      if (!r) {
        setWorkspaceNameState('idle');
        setWorkspaceNameMsg('');
        return;
      }
      setWorkspaceNameState(r.available ? 'available' : 'taken');
      setWorkspaceNameMsg(r.available ? 'Name is available' : r.error || 'That workspace name is already in use');
    }, 350);
    return () => window.clearTimeout(timer);
  }, [workspaceName, mode]);

  const sendCode = async () => {
    setErr('');
    if (!emailValid) return setErr('Enter a valid email address first');
    const r = await post('/auth/send-code', { email });
    if (!r.ok) return setErr(r.error || 'Could not send the verification code');
    setOk('Verification code sent. Check your email.');
    setCooldown(60);
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? (clearInterval(t), 0) : c - 1)), 1000);
  };

  const canSubmit =
    emailValid &&
    code.trim() &&
    password.length >= 6 &&
    displayName.trim() &&
    (mode === 'create' ? workspaceName.trim() : inviteCode.trim()) &&
    (mode !== 'create' || workspaceNameState === 'available') &&
    agreed;

  const submit = async () => {
    setErr('');
    setOk('');
    if (!canSubmit || loading) return;
    setLoading(true);
    const r = await post<{ status?: string }>('/auth/register', {
      email: email.trim(),
      password,
      displayName: displayName.trim(),
      mode,
      workspaceName: mode === 'create' ? workspaceName.trim() : undefined,
      inviteCode: inviteCode.trim() || undefined,
      emailCode: code.trim(),
      agreedLegalVersion: LEGAL_VERSION,
    });
    setLoading(false);
    if (!r.ok) return setErr(r.error || 'Registration failed');
    if (r.data?.status === 'pending') {
      setOk('Account created. A workspace administrator must approve your request before you can sign in.');
      return;
    }
    onDone();
  };

  return (
    <div className="relative h-full overflow-y-auto bg-[#020203] text-white">
      <div className="surface-line pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative z-10 mx-auto max-w-lg px-5 py-10">
        <div className="mb-6 inline-flex items-center gap-3 rounded-[14px] border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-xl">
          <Rocket size={18} />
          <div>
            <div className="text-sm font-semibold">Create account</div>
            <div className="text-[10px] text-white/40">Create a workspace or join one with an invite code</div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <div className="flex gap-2">
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <button className="btn-soft shrink-0 disabled:opacity-40" disabled={cooldown > 0 || !emailValid} onClick={sendCode}>
                <Mail size={14} />
                {cooldown > 0 ? `${cooldown}s` : 'Send code'}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Email verification code</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Password (6+ characters)</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="label">Your name</label>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="For example: Alex Smith" />
            </div>
          </div>

          <div>
            <label className="label">How would you like to start?</label>
            <div className="flex gap-2">
              <button
                className={`flex-1 rounded-xl2 border px-3 py-2 text-sm ${mode === 'create' ? 'border-brand-400 bg-white/10 text-white' : 'border-white/10 text-white/50'}`}
                onClick={() => setMode('create')}
              >
                Create a workspace
              </button>
              <button
                className={`flex-1 rounded-xl2 border px-3 py-2 text-sm ${mode === 'join' ? 'border-brand-400 bg-white/10 text-white' : 'border-white/10 text-white/50'}`}
                onClick={() => setMode('join')}
              >
                Join an existing workspace
              </button>
            </div>
          </div>

          {mode === 'create' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Workspace name</label>
                <input className="input" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="For example: Acme Labs" />
                {workspaceNameMsg && (
                  <div className={`mt-1 text-[11px] ${workspaceNameState === 'available' ? 'text-emerald-200' : 'text-rose-200'}`}>
                    {workspaceNameState === 'checking' ? 'Checking name…' : workspaceNameMsg}
                  </div>
                )}
              </div>
              <div>
                <label className="label">Invite code, if required</label>
                <input className="input" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          ) : (
            <div>
              <label className="label">Workspace invite code *</label>
              <input className="input" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Enter the invite code you received" />
            </div>
          )}

          <label className="flex items-start gap-2 text-xs text-white/60">
            <input type="checkbox" className="mt-0.5 accent-brand-600" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I have read and accept the
              <Link to="/legal" className="text-brand-400 hover:underline"> Privacy Policy, Terms of Service, and Disclaimer</Link>
            </span>
          </label>

          {err && <div className="rounded-xl2 border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{err}</div>}
          {ok && <div className="rounded-xl2 border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">{ok}</div>}

          <button className="btn-primary w-full disabled:opacity-40" disabled={!canSubmit || loading} onClick={submit}>
            <ShieldCheck size={16} />
            {loading ? 'Creating account…' : 'Create account'}
          </button>

          <div className="text-center text-xs text-white/40">
            Already have an account? <Link to="/" className="text-brand-400 hover:underline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
