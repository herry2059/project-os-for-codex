import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProjects } from '@/lib/api';
import type { Project } from '@/lib/types';
import { HealthDot, ProgressBar, Empty } from '@/components/ui';
import { ArrowUpRight, Plus, Rocket, Activity, AlertTriangle, FolderGit2 } from 'lucide-react';
import OnboardingChecklist from '@/components/OnboardingChecklist';

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  const red = projects?.filter((p) => p.health === 'red').length ?? 0;
  const active = projects?.filter((p) => p.status === 'active').length ?? 0;
  const avg = projects && projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)
    : 0;

  return (
    <div className="max-w-6xl">
      <OnboardingChecklist />

      <div className="dash-canvas relative overflow-hidden rounded-3xl p-4 sm:p-5 md:p-6">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-full dash-card">
              <Rocket size={17} className="text-white" />
            </span>
            <div>
              <div className="text-sm font-semibold text-white">Project Dashboard</div>
              <div className="text-[11px] text-white/50">Live project portfolio</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full dash-card px-3 py-1.5 text-xs text-white/70">
              Active {active}{red > 0 && <span className="text-rose-300"> - Blocked {red}</span>} - Average {avg}%
            </span>
            <Link to="/projects/new" className="btn-primary text-xs"><Plus size={14} /> New project</Link>
          </div>
        </div>

        {/* Bento grid */}
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {/* New project call to action */}
          <Link to="/projects/new" className="dash-card group flex min-h-[160px] flex-col items-center justify-center rounded-2xl p-6 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-sky-500 text-black transition group-hover:scale-105">
              <Plus size={22} />
            </span>
            <div className="mt-3 text-sm font-medium text-white">New project</div>
            <div className="mt-0.5 text-xs text-white/50">Kick off and create a Git record</div>
          </Link>

          {/* Key metrics */}
          <div className="dash-card rounded-2xl p-5 md:col-span-2">
            <div className="mb-3 text-[11px] uppercase tracking-wider text-white/40">Portfolio overview</div>
            <div className="grid grid-cols-3 gap-3">
              <Metric icon={<Activity size={15} />} label="Active" value={active} />
              <Metric icon={<AlertTriangle size={15} />} label="Blocked" value={red} tone={red > 0 ? 'red' : undefined} />
              <Metric icon={<FolderGit2 size={15} />} label="Average progress" value={avg} suffix="%" />
            </div>
          </div>

          {/* Project cards */}
          {!projects ? (
            <div className="dash-card rounded-2xl p-8 text-center text-sm text-white/40 md:col-span-3 xl:col-span-4">Loading…</div>
          ) : projects.length === 0 ? (
            <div className="dash-card rounded-2xl p-8 text-center md:col-span-3 xl:col-span-4">
              <Empty text="No projects yet. Select New project to get started." />
            </div>
          ) : (
            projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="dash-card group rounded-2xl p-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-white">{p.name}</span>
                  <HealthDot health={p.health} />
                </div>
                <p className="mb-4 line-clamp-2 min-h-[32px] text-xs text-white/50">{p.kickoff.goal || 'No goal provided'}</p>
                <ProgressBar value={p.progress} />
                <div className="mt-3 flex items-center justify-between text-xs text-white/40">
                  <span>{p.progress}%</span>
                  <span className="inline-flex max-w-[60%] items-center gap-1 truncate">
                    {p.nextStep ?? '—'}
                    <ArrowUpRight size={12} className="opacity-0 transition group-hover:opacity-100" />
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, suffix = '', tone }: { icon: React.ReactNode; label: string; value: number; suffix?: string; tone?: 'red' }) {
  return (
    <div className="rounded-xl2 border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] text-white/40">{icon}{label}</div>
      <div className={`text-2xl font-normal leading-none ${tone === 'red' && value > 0 ? 'text-rose-300' : 'text-white'}`}>{value}{suffix}</div>
    </div>
  );
}
