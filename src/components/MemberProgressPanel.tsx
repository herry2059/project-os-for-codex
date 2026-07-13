import { useEffect, useState } from 'react';

/**
 * Member and phase progress panel with horizontal gradient bars, tabs, and a scale.
 * Used in project records to show completion by member or phase at a glance.
 * Backend contract (Codex): GET /api/projects/:id/progress-panels ->
 *   { groups: [{ key, label, caption?, rows: [{ label, sub?, pct }] }] }
 * Each group contains progress rows for members or phases.
 * Falls back to an empty state when the backend is unavailable.
 */
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, '/');

interface Row { label: string; sub?: string; pct: number }
interface Group { key: string; label: string; caption?: string; rows: Row[] }

export default function MemberProgressPanel({ projectId }: { projectId: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [active, setActive] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/projects/${projectId}/progress-panels`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const gs: Group[] = Array.isArray(d?.groups) ? d.groups : [];
        setGroups(gs);
        if (gs.length) setActive(gs[0].key);
      })
      .catch(() => setGroups([]));
  }, [projectId]);

  if (groups === null) {
    return <div className="dash-card rounded-2xl p-8 text-center text-sm text-white/40">Loading…</div>;
  }
  if (groups.length === 0) {
    return (
      <div className="dash-card rounded-2xl p-8 text-center text-sm text-white/45">
        No member or phase progress yet. Progress will appear here after AI work allocation.
      </div>
    );
  }

  const cur = groups.find((g) => g.key === active) ?? groups[0];

  return (
    <div className="dash-card overflow-hidden rounded-2xl">
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-4">
        {groups.map((g) => {
          const on = g.key === cur.key;
          return (
            <button
              key={g.key}
              onClick={() => setActive(g.key)}
              className={`relative shrink-0 whitespace-nowrap px-3 py-3 text-sm transition ${on ? 'text-white' : 'text-white/45 hover:text-white/80'}`}
            >
              {g.label}
              {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500" />}
            </button>
          );
        })}
      </div>

      {/* Heading and caption */}
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">{cur.label}</div>
        {cur.caption && <div className="text-[11px] text-white/35">{cur.caption}</div>}
      </div>

      {/* Progress rows */}
      <div className="space-y-3 px-5 py-4">
        {cur.rows.length === 0 && <div className="py-6 text-center text-sm text-white/30">No data</div>}
        {cur.rows.map((r, i) => {
          const pct = Math.max(0, Math.min(100, Math.round(r.pct)));
          return (
            <div key={i} className="grid grid-cols-[minmax(120px,180px)_1fr_44px] items-center gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm text-white/85">{r.label}</div>
                {r.sub && <div className="truncate text-[11px] text-white/40">{r.sub}</div>}
              </div>
              <div className="h-6 overflow-hidden rounded-md bg-white/[0.06]">
                <div
                  className="h-full rounded-md bg-gradient-to-r from-cyan-500/80 via-sky-400/70 to-white/40 transition-[width] duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-right text-xs font-medium text-white/80">{pct}%</div>
            </div>
          );
        })}
      </div>

      {/* Scale */}
      <div className="grid grid-cols-[minmax(120px,180px)_1fr_44px] gap-3 px-5 pb-4">
        <div />
        <div className="flex justify-between text-[10px] text-white/25">
          {[0, 20, 40, 60, 80, 100].map((t) => <span key={t}>{t}</span>)}
        </div>
        <div />
      </div>
    </div>
  );
}
