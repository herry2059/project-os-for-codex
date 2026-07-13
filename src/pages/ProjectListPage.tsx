import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProjects } from '@/lib/api';
import type { Project } from '@/lib/types';
import { HealthDot, ProgressBar, Empty } from '@/components/ui';
import { ArrowUpRight, Plus, CircleDashed, CheckCircle2 } from 'lucide-react';

export default function ProjectListPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [tab, setTab] = useState<'active' | 'done'>('active');

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  const isDone = (p: Project) => p.progress >= 100;
  const all = projects ?? [];
  const active = all.filter((p) => !isDone(p));
  const done = all.filter(isDone);
  const shown = tab === 'active' ? active : done;

  return (
    <div className="max-w-6xl">
      <div className="dash-canvas relative overflow-hidden rounded-3xl p-4 sm:p-5 md:p-6">
        {/* Header with status tabs and create action */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Projects</div>
            <div className="text-[11px] text-white/50">Project records - Git audit trail</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full dash-card p-1 text-xs">
              <button
                onClick={() => setTab('active')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${tab === 'active' ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'}`}
              >
                <CircleDashed size={13} /> Active {active.length > 0 && `(${active.length})`}
              </button>
              <button
                onClick={() => setTab('done')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${tab === 'done' ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'}`}
              >
                <CheckCircle2 size={13} /> Completed {done.length > 0 && `(${done.length})`}
              </button>
            </div>
            <Link to="/projects/new" className="btn-primary text-xs"><Plus size={14} /> New project</Link>
          </div>
        </div>

        {/* Bento grid */}
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {/* Show the create action only in the active view. */}
          {tab === 'active' && (
            <Link to="/projects/new" className="dash-card group flex min-h-[168px] flex-col items-center justify-center rounded-2xl p-6 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-sky-500 text-black transition group-hover:scale-105">
                <Plus size={22} />
              </span>
              <div className="mt-3 text-sm font-medium text-white">New project</div>
              <div className="mt-0.5 text-xs text-white/50">Kick off and create a Git record</div>
            </Link>
          )}

          {!projects ? (
            <div className="dash-card rounded-2xl p-8 text-center text-sm text-white/40 md:col-span-3 xl:col-span-4">Loading…</div>
          ) : shown.length === 0 ? (
            <div className="dash-card rounded-2xl p-8 md:col-span-3 xl:col-span-4">
              <Empty text={tab === 'active' ? 'No active projects' : 'No completed projects yet'} />
            </div>
          ) : (
            shown.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="dash-card group flex min-h-[168px] flex-col rounded-2xl p-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="truncate font-medium text-white">{p.name}</span>
                  <HealthDot health={p.health} />
                  {isDone(p) && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] text-emerald-200">
                      <CheckCircle2 size={11} /> Completed
                    </span>
                  )}
                </div>
                <p className="mb-3 line-clamp-2 text-xs text-white/50">{p.kickoff.goal || 'No goal provided'}</p>
                <div className="mb-3 flex flex-wrap gap-x-3 text-[11px] text-white/35">
                  <span>Owner: {p.ownerName || 'Unassigned'}</span>
                  {p.createdAt && <span>Created {String(p.createdAt).slice(0, 10)}</span>}
                </div>
                <div className="mt-auto">
                  <ProgressBar value={p.progress} />
                  <div className="mt-2 flex items-center justify-between text-xs text-white/40">
                    <span>{p.progress}%</span>
                    <span className="inline-flex max-w-[60%] items-center gap-1 truncate">
                      {p.nextStep ?? '—'}
                      <ArrowUpRight size={12} className="opacity-0 transition group-hover:opacity-100" />
                    </span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
