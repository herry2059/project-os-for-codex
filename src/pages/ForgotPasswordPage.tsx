import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, ArrowLeft, Check } from 'lucide-react';

/**
 * Password recovery.
 * Backend contract (Codex):
 *   POST /api/auth/forgot { account } -> send a rate-limited, expiring reset code
 *   POST /api/auth/reset { account, code, newPassword } -> reset and invalidate old sessions
 * Unavailable services show a neutral error and never simulate success.
 */
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, '/');

export default function ForgotPasswordPage() {
  const [account, setAccount] = useState('');
  const [code, setCode] = useState('');
  const [pwd, setPwd] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    if (!account.trim() || cooldown > 0) return;
    setMsg('');
    try {
      const res = await fetch(`${API_BASE}/auth/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ account: account.trim() }),
      });
      if (res.ok) {
        setCooldown(60);
        setMsg('A verification code was sent if the account is registered.');
      } else {
        setMsg('Could not send the code. Try again later or contact an administrator.');
      }
    } catch {
      setMsg('The recovery service is unavailable. Try again later or contact an administrator.');
    }
  };

  const submit = async () => {
    if (!account.trim() || !code.trim() || pwd.length < 6 || busy) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`${API_BASE}/auth/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ account: account.trim(), code: code.trim(), newPassword: pwd }),
      });
      if (res.ok) setDone(true);
      else setMsg('Reset failed. The verification code is invalid or expired.');
    } catch {
      setMsg('The reset service is unavailable. Try again later or contact an administrator.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-[#020203] px-4 py-10 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl2 border border-white/10 bg-white/10">
            <KeyRound size={18} />
          </span>
          <div>
            <div className="text-base font-semibold">Reset password</div>
            <div className="text-[11px] text-white/40">Receive a verification code at your registered contact</div>
          </div>
        </div>

        {done ? (
          <div className="card p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
              <Check size={24} />
            </div>
            <div className="font-semibold">Password reset</div>
            <p className="mt-1.5 text-sm text-white/50">Sign in with your new password. Existing sessions were invalidated for security.</p>
            <Link to="/" className="btn-primary mt-5 w-full">Sign in</Link>
          </div>
        ) : (
          <div className="card space-y-3 p-6">
            <div>
              <label className="label">Account email or phone</label>
              <div className="flex gap-2">
                <input className="input" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="you@example.com" />
                <button className="btn-soft shrink-0 whitespace-nowrap" onClick={sendCode} disabled={!account.trim() || cooldown > 0}>
                  {cooldown > 0 ? `${cooldown}s` : 'Send code'}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Verification code</label>
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" inputMode="numeric" />
            </div>
            <div>
              <label className="label">New password (6+ characters)</label>
              <input className="input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
            </div>
            {msg && <div className="rounded-xl2 border border-amber-200/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">{msg}</div>}
            <button className="btn-primary w-full" onClick={submit} disabled={!account.trim() || !code.trim() || pwd.length < 6 || busy}>
              {busy ? 'Resetting…' : 'Reset password'}
            </button>
          </div>
        )}

        <div className="mt-4 text-center">
          <Link to="/" className="btn-ghost text-xs"><ArrowLeft size={13} /> Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
