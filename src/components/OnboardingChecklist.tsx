import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Check, ArrowRight, X, UserCircle2, FolderGit2, Users, Compass } from 'lucide-react';

/**
 * First-run checklist shown above the dashboard to guide users through the essentials.
 * Optional backend contract (Codex): GET /api/onboarding/status ->
 *   { profileDone, hasProject, invitedMember, viewedGuide } (all booleans)
 * Unavailable backend values are treated as incomplete. The checklist stays hidden once complete or dismissed.
 */
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, '/');

interface Status {
  profileDone?: boolean;
  hasProject?: boolean;
  invitedMember?: boolean;
  viewedGuide?: boolean;
}

export default function OnboardingChecklist() {
  const [st, setSt] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('onboardingDismissed') === '1') setDismissed(true);
    } catch { /* ignore */ }
    fetch(`${API_BASE}/onboarding/status`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSt(d || {}))
      .catch(() => setSt({}));
  }, []);

  if (dismissed || st === null) return null;

  const steps = [
    { done: !!st.profileDone, label: 'Complete your profile', desc: 'AI uses it to allocate work', to: '/profile', icon: <UserCircle2 size={16} /> },
    { done: !!st.hasProject, label: 'Create your first project', desc: 'The system creates a Git record', to: '/projects/new', icon: <FolderGit2 size={16} /> },
    { done: !!st.invitedMember, label: 'Invite a teammate', desc: 'Add collaborators to this workspace', to: '/workspace', icon: <Users size={16} /> },
    { done: !!st.viewedGuide, label: 'Read the operating guide', desc: 'Learn the recommended workflow', to: '/guide', icon: <Compass size={16} /> },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null; // Hide after every step is complete.

  const close = () => {
    try { localStorage.setItem('onboardingDismissed', '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="card mb-5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={16} className="text-cyan-100" />
        <h2 className="text-sm font-semibold text-white">Getting started ({doneCount}/{steps.length})</h2>
        <span className="text-xs text-white/40">A few steps to get running</span>
        <button onClick={close} className="ml-auto text-white/30 hover:text-white" aria-label="Close"><X size={16} /></button>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        {steps.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className={`flex items-center gap-3 rounded-xl2 border px-3 py-2.5 transition ${s.done ? 'border-emerald-200/20 bg-emerald-400/[0.06]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.done ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/60'}`}>
              {s.done ? <Check size={16} /> : s.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium ${s.done ? 'text-white/60 line-through' : 'text-white'}`}>{s.label}</div>
              <div className="text-xs text-white/40">{s.desc}</div>
            </div>
            {!s.done && <ArrowRight size={15} className="shrink-0 text-white/30" />}
          </Link>
        ))}
      </div>
    </div>
  );
}
