import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { login } from '@/lib/api';
import { Apple, LockKeyhole, Menu, X } from 'lucide-react';

const HERO_IMAGE = '/login-assets/visual-base.png';

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~|}{[]:;?><';

function randomChar() {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

function SynapseLogo({ className = '' }: { className?: string }) {
  const path =
    'M 1.5,23 L 1.5,33 C 1.5,38.5 6,43 11.5,43 L 16.5,43 C 22,43 26.5,38.5 26.5,33 Q 28,28 33,26.5 C 38.5,26.5 43,22 43,16.5 L 43,11.5 C 43,6 38.5,1.5 33,1.5 L 23,1.5 Q 12,12 1.5,23 Z';
  return (
    <svg className={className} viewBox="-50 -50 100 100" aria-hidden="true">
      {[0, 90, 180, 270].map((deg) => (
        <path key={deg} d={path} fill="currentColor" transform={`rotate(${deg})`} />
      ))}
    </svg>
  );
}

function ScrambleIn({ text, delay = 0, triggered }: { text: string; delay?: number; triggered: boolean }) {
  const [display, setDisplay] = useState(triggered ? text : '\u00a0');

  useEffect(() => {
    if (!triggered) {
      setDisplay('\u00a0');
      return;
    }
    let frame = 0;
    let timer: number | undefined;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        const cursor = frame * 0.5;
        const next = text
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';
            if (index < cursor) return char;
            if (index < cursor + 3) return randomChar();
            return '';
          })
          .join('');
        setDisplay(next || '\u00a0');
        frame += 1;
        if (cursor >= text.length) {
          if (timer) window.clearInterval(timer);
          setDisplay(text);
        }
      }, 25);
    }, delay);
    return () => {
      window.clearTimeout(start);
      if (timer) window.clearInterval(timer);
    };
  }, [delay, text, triggered]);

  return <>{display}</>;
}

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [entranceComplete, setEntranceComplete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setEntranceComplete(true), 800);
    return () => window.clearTimeout(timer);
  }, []);

  const submit = async () => {
    if (!agreed) {
      setError('Please accept the policies before signing in');
      return;
    }
    if (!username.trim() || !password || loading) return;
    setLoading(true);
    setError('');
    const res = await login(username.trim(), password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error || 'Sign-in failed');
      return;
    }
    onLogin();
  };

  return (
    <div className="synapse-login relative h-full overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${HERO_IMAGE})` }} />
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-0 opacity-[0.055] [background-image:radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="synapse-watermark pointer-events-none absolute inset-x-0 top-1/2 -translate-y-[calc(50%-50px)] text-center font-anton text-[clamp(120px,30vw,521px)] uppercase leading-none tracking-[-4px] opacity-10">
        TRANSCENDENCE
      </div>

      <nav className={`fixed inset-x-0 top-0 z-50 flex h-20 items-center justify-between px-4 transition-opacity duration-700 sm:px-6 md:px-8 ${entranceComplete ? 'opacity-100' : 'opacity-0'}`}>
        <div className="hidden items-center gap-2 sm:flex">
          <button className={`hidden h-12 items-center gap-2 rounded-[14px] bg-white/15 px-5 text-white backdrop-blur-md transition hover:scale-[1.02] hover:bg-white/[0.22] md:flex ${menuOpen ? 'md:hidden' : ''}`}>
            <SynapseLogo className="h-[18px] w-[18px]" />
            <span className="text-[16px] font-medium tracking-tight">Project OS</span>
          </button>
          <div className={`flex h-12 items-center overflow-hidden rounded-[14px] bg-white/15 backdrop-blur-md transition-all duration-300 ${menuOpen ? 'w-[290px]' : 'w-12'}`}>
            <button
              className={`relative flex shrink-0 items-center justify-center rounded-[14px] transition ${menuOpen ? 'ml-1.5 h-9 w-9 rounded-[11px] bg-white/10 hover:bg-white/20' : 'h-12 w-12'}`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
            >
              <span className={`absolute h-[1.5px] w-[18px] bg-white transition ${menuOpen ? 'rotate-45' : '-translate-y-[5px]'}`} />
              <span className={`absolute h-[1.5px] w-[18px] bg-white transition ${menuOpen ? 'scale-x-0 opacity-0' : ''}`} />
              <span className={`absolute h-[1.5px] w-[18px] bg-white transition ${menuOpen ? '-rotate-45' : 'translate-y-[5px]'}`} />
            </button>
            <div className={`flex items-center gap-6 px-4 text-[16px] text-white/85 transition ${menuOpen ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}>
              <a href="#login-panel" className="hover:text-white">Login</a>
              <Link to="/legal" className="hover:text-white">Legal</Link>
            </div>
          </div>
        </div>
        <div className="flex w-full items-center justify-between sm:hidden">
          <button className="flex h-9 items-center gap-2 rounded-[10px] bg-white/15 px-3 text-[13px] backdrop-blur-md">
            <SynapseLogo className="h-[15px] w-[15px]" />
            Project OS
          </button>
        </div>
        <button className="hidden h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-black transition hover:scale-[1.03] hover:bg-[#e2e2e6] sm:flex">
          <Apple size={16} />
          Open Source
        </button>
      </nav>

      <main className="relative z-10 flex h-full min-h-[100dvh] flex-col px-4 pb-8 pt-20 sm:px-6 sm:pb-12 sm:pt-24 md:px-8">
        <div className="flex-1" />
        <div className="grid items-end gap-7 md:grid-cols-[minmax(0,1fr)_minmax(340px,430px)_minmax(0,1fr)]">
          <section className={`flex flex-col gap-4 transition-all duration-1000 ${entranceComplete ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
            <h1 className="font-light leading-[0.95] tracking-[-0.03em] text-[clamp(40px,10vw,100px)]">
              <ScrambleIn text="Project" delay={200} triggered={entranceComplete} />
              <br />
              <ScrambleIn text="Handoff" delay={500} triggered={entranceComplete} />
            </h1>
            <p className="max-w-sm text-[13px] leading-relaxed text-white/60 sm:text-[15px]">
              Make AI project progress visible, resumable, and handoff-ready with a Git-backed execution workspace.
            </p>
          </section>

          <section
            id="login-panel"
            className={`rounded-[24px] border border-white/10 bg-black/42 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur-2xl transition-all duration-1000 md:p-5 ${entranceComplete ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SynapseLogo className="h-[18px] w-[18px]" />
                <span className="text-sm font-medium">Secure sign in</span>
              </div>
              <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80" aria-label="Close">
                <X size={17} />
              </button>
            </div>
            <div className="mb-4 rounded-full bg-white/10 p-1 text-xs">
              <div className="rounded-full bg-white py-2 text-center text-black">Account login</div>
            </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs text-white/42">Username</label>
                  <input
                    className="w-full rounded-[14px] border border-white/10 bg-white/[0.08] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/35 focus:bg-white/[0.12]"
                    autoComplete="username"
                    placeholder="Enter your account"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submit();
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-white/42">Password</label>
                  <input
                    className="w-full rounded-[14px] border border-white/10 bg-white/[0.08] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/35 focus:bg-white/[0.12]"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submit();
                    }}
                  />
                </div>
                {error && <div className="rounded-[14px] border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{error}</div>}
                <label className="flex items-start gap-2 text-xs leading-5 text-white/54">
                  <input type="checkbox" className="mt-1 accent-white" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>
                    I have read and accept the
                    <Link to="/legal" className="text-white hover:underline"> Privacy Policy, Terms of Service, and Disclaimer</Link>
                  </span>
                </label>
                <button
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-black transition hover:scale-[1.01] hover:bg-[#e2e2e6] disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!username.trim() || !password || loading || !agreed}
                  onClick={submit}
                >
                  <LockKeyhole size={16} />
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
                <div className="text-center text-xs text-white/42">
                  No account? <Link to="/register" className="text-white hover:underline">Create a workspace</Link>
                  <span className="mx-1.5 text-white/20">-</span>
                  <Link to="/forgot" className="text-white hover:underline">Forgot password</Link>
                </div>
              </div>
          </section>

          <section className={`text-left transition-all duration-1000 md:text-right ${entranceComplete ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
            <h1 className="font-light leading-[0.95] tracking-[-0.03em] text-[clamp(40px,10vw,100px)]">
              <ScrambleIn text="One" delay={700} triggered={entranceComplete} />
              <br />
              <ScrambleIn text="Network" delay={1000} triggered={entranceComplete} />
            </h1>
          </section>
        </div>
      </main>
    </div>
  );
}
