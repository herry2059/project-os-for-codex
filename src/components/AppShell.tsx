import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import type { AuthUser } from '@/lib/api';
import { myProfile } from '@/lib/saas';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import {
  LayoutDashboard,
  ListChecks,
  FolderGit2,
  PlusCircle,
  BookOpen,
  Settings,
  Activity,
  LogOut,
  Compass,
  Building2,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  soon?: boolean;
}
interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    group: 'Execution',
    items: [
      { to: '/', label: 'Project Dashboard', icon: <LayoutDashboard size={18} /> },
      { to: '/next', label: 'My Next Step', icon: <ListChecks size={18} /> },
      { to: '/workspace', label: 'Workspace', icon: <Building2 size={18} /> },
    ],
  },
  {
    group: 'Projects',
    items: [
      { to: '/projects', label: 'All Projects', icon: <FolderGit2 size={18} /> },
      { to: '/projects/new', label: 'New Project', icon: <PlusCircle size={18} /> },
    ],
  },
  {
    group: 'Knowledge - AI',
    items: [
      { to: '/knowledge', label: 'Knowledge Base', icon: <BookOpen size={18} /> },
    ],
  },
  {
    group: 'Help - Settings',
    items: [
      { to: '/guide', label: 'User Guide', icon: <Compass size={18} /> },
      { to: '/settings', label: 'Settings', icon: <Settings size={18} /> },
    ],
  },
];

function pageTitle(pathname: string): string {
  const all = NAV.flatMap((g) => g.items);
  if (pathname.startsWith('/projects/new')) return 'New Project';
  if (pathname.endsWith('/handoff')) return 'Project Handoff';
  if (pathname.endsWith('/retro')) return 'Project Retrospective';
  if (pathname.startsWith('/projects/')) return 'Project Record';
  const hit = all.find((i) => i.to === pathname);
  return hit?.label ?? 'Project OS for Codex';
}

export default function AppShell({
  children,
  user,
  onLogout,
}: {
  children: ReactNode;
  user?: AuthUser | null;
  onLogout?: () => void;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [profileNudge, setProfileNudge] = useState(false);

  useEffect(() => {
    if (!user?.username) return;
    const key = `project-os-profile-nudge:${user.username}`;
    if (localStorage.getItem(key) === 'done') return;
    myProfile().then((p) => {
      if ((p?.completeness ?? 0) < 60) setProfileNudge(true);
    });
  }, [user?.username]);

  const closeProfileNudge = () => {
    if (user?.username) localStorage.setItem(`project-os-profile-nudge:${user.username}`, 'done');
    setProfileNudge(false);
  };

  return (
    <div className="relative flex h-full overflow-hidden bg-[#020203] text-white">
      <div className="surface-line pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-60 bg-[radial-gradient(circle_at_50%_0%,rgba(141,233,255,0.18),transparent_48%)]" />

      <aside className="relative z-10 w-16 md:w-64 shrink-0 border-r border-white/10 bg-black/40 backdrop-blur-2xl flex flex-col">
        <WorkspaceSwitcher />
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((g, gi) => (
            <div key={gi} className="mb-4">
              {g.group && (
                <div className="hidden md:block px-5 py-1.5 text-[10px] uppercase text-white/30">{g.group}</div>
              )}
              {g.items.map((it) =>
                it.soon ? (
                  <div
                    key={it.to}
                    className="mx-2 px-3 py-2 rounded-xl2 flex items-center justify-center md:justify-start gap-2.5 text-white/30 cursor-not-allowed select-none"
                    title="Coming soon"
                  >
                    {it.icon}
                    <span className="hidden md:inline text-sm">{it.label}</span>
                    <span className="hidden md:inline-flex ml-auto text-[10px] bg-white/10 text-white/30 rounded-full px-1.5 py-0.5">
                      Soon
                    </span>
                  </div>
                ) : (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.to === '/'}
                    className={({ isActive }) =>
                      `mx-2 px-3 py-2 rounded-xl2 flex items-center justify-center md:justify-start gap-2.5 text-sm transition border ${
                        isActive
                          ? 'bg-white/10 text-white border-white/20 font-medium shadow-card'
                          : 'text-white/60 border-transparent hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    {it.icon}
                    <span className="hidden md:inline">{it.label}</span>
                  </NavLink>
                ),
              )}
            </div>
          ))}
        </nav>
        <div className="hidden md:block px-5 py-4 border-t border-white/10 text-xs text-white/40">
          <div className="flex items-center gap-2 text-white/70">
            <Activity size={14} />
            <span>Online</span>
          </div>
          <div className="mt-1 text-[10px] text-white/30">Projects - Keys - Knowledge</div>
        </div>
      </aside>

      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 border-b border-white/10 bg-black/20 backdrop-blur-xl flex items-center justify-between px-4 md:px-7">
          <h1 className="text-base font-semibold text-white">
            {pageTitle(pathname)}
          </h1>
          <div className="flex items-center gap-3 text-[11px] text-white/40">
            <NotificationBell />
            <ThemeToggle />
            <span className="hidden md:inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
              Live data
            </span>
            {user && <span className="hidden md:inline">{user.displayName}</span>}
            {onLogout && (
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl2 border border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white md:h-auto md:w-auto md:border-0 md:bg-transparent"
                aria-label="Sign out"
                onClick={onLogout}
              >
                <LogOut size={15} />
                <span className="hidden md:inline">Sign out</span>
              </button>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-7 md:py-7">{children}</main>
      </div>
      {profileNudge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl2 border border-cyan-200/20 bg-[#111416] p-5 shadow-card">
            <div className="text-sm font-semibold text-white">Complete your work profile first</div>
            <p className="mt-2 text-sm leading-6 text-white/55">
              AI work allocation uses roles, skills, and responsibility boundaries. A complete profile makes project breakdowns and assignments more accurate.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={closeProfileNudge}>Later</button>
              <button
                className="btn-primary"
                onClick={() => {
                  closeProfileNudge();
                  navigate('/settings?tab=profile');
                }}
              >
                Complete profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
