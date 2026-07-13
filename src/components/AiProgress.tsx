import { useEffect, useMemo, useState } from 'react';

type AiProgressProps = {
  active: boolean;
  label?: string;
  startedAt?: number;
  expectedMs?: number;
};

function formatEta(ms: number) {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.ceil(sec / 60)} min`;
}

export function AiProgress({
  active,
  label = 'AI is working',
  startedAt,
  expectedMs = 22000,
}: AiProgressProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 650);
    return () => window.clearInterval(timer);
  }, [active]);

  const state = useMemo(() => {
    const start = startedAt || now;
    const elapsed = Math.max(0, now - start);
    const dynamicExpected = Math.max(expectedMs, elapsed + expectedMs * 0.22);
    const raw = elapsed / dynamicExpected;
    const percent = Math.min(92, Math.max(8, Math.round((1 - Math.exp(-raw * 2.6)) * 100)));
    const eta = Math.max(1000, dynamicExpected - elapsed);
    return { percent, eta, elapsed };
  }, [expectedMs, now, startedAt]);

  if (!active) return null;

  return (
    <div className="ai-progress mt-3 rounded-xl2 border border-cyan-200/15 bg-cyan-300/[0.045] p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-cyan-100">{label}</span>
        <span className="text-white/55">
          {state.percent}% - About {formatEta(state.eta)} remaining
        </span>
      </div>
      <div className="ai-progress-track">
        <div className="ai-progress-fill" style={{ width: `${state.percent}%` }} />
        <div className="ai-progress-scan" />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-white/35">
        <span>Reading context</span>
        <span>Drafting</span>
        <span>Waiting for response</span>
      </div>
    </div>
  );
}
