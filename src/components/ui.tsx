import type { ProjectHealth } from '@/lib/types';

const HEALTH_MAP: Record<ProjectHealth, { color: string; label: string }> = {
  green: { color: 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.72)]', label: 'On track' },
  yellow: { color: 'bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.65)]', label: 'Slowing' },
  red: { color: 'bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.65)]', label: 'Blocked' },
};

export function HealthDot({ health }: { health: ProjectHealth }) {
  const h = HEALTH_MAP[health];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
      <span className={`h-2 w-2 rounded-full ${h.color}`} />
      {h.label}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full rounded-full bg-white transition-all shadow-[0_0_18px_rgba(255,255,255,0.45)]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="text-center text-white/30 text-sm py-16">{text}</div>
  );
}
