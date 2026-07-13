import { useEffect, useRef, useState } from 'react';
import { Rocket, ChevronDown, Check, Plus, Building2 } from 'lucide-react';
import { myWorkspaces, currentWorkspace, switchWorkspace, createWorkspace, type Workspace } from '@/lib/saas';

/**
 * Workspace switcher in the upper-left product area.
 * A user may have up to three workspaces. Switching reloads the page so all data uses the new context.
 * The backend enforces strict membership isolation between workspaces.
 * Falls back to the product name when the backend is unavailable.
 */
const MAX_WORKSPACES = 3;

export default function WorkspaceSwitcher() {
  const [list, setList] = useState<Workspace[]>([]);
  const [cur, setCur] = useState<Workspace | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    myWorkspaces().then(setList);
    currentWorkspace().then(setCur);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const title = cur?.name || list.find((w) => w.current)?.name || 'Project OS for Codex';
  const reload = () => window.location.reload();

  const onSwitch = async (w: Workspace) => {
    if (busy || w.id === cur?.id) return setOpen(false);
    setBusy(true);
    const ok = await switchWorkspace(w.id);
    setBusy(false);
    if (ok) reload();
    else window.alert('Could not switch workspace. Please try again.');
  };

  const onCreate = async () => {
    if (list.length >= MAX_WORKSPACES) {
      window.alert(`Each account can create up to ${MAX_WORKSPACES} workspaces.`);
      return;
    }
    const name = window.prompt('New workspace name:')?.trim();
    if (!name) return;
    setBusy(true);
    const ws = await createWorkspace(name);
    setBusy(false);
    if (ws) {
      window.alert('Workspace created. You can open it now.');
      myWorkspaces().then(setList);
    } else {
      window.alert('Could not create workspace. Please try again.');
    }
  };

  return (
    <div ref={boxRef} className="relative h-16 border-b border-white/10">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-full w-full items-center justify-center md:justify-start gap-3 px-3 md:px-5 transition hover:bg-white/[0.04]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-white/10">
          <Rocket className="text-white" size={18} />
        </span>
        <div className="hidden min-w-0 flex-1 md:block text-left">
          <div className="truncate text-sm font-semibold text-white">{title}</div>
          <div className="text-[10px] text-white/30">Workspace - Click to switch</div>
        </div>
        <ChevronDown size={15} className="hidden shrink-0 text-white/40 md:block" />
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-[60px] z-30 rounded-xl2 border border-white/12 bg-[#0a0c10] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
          <div className="px-2.5 py-1.5 text-[10px] uppercase text-white/30">My workspaces ({list.length}/{MAX_WORKSPACES})</div>
          {list.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-white/40">{title}</div>
          )}
          {list.map((w) => (
            <button
              key={w.id}
              onClick={() => onSwitch(w)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-white/75 transition hover:bg-white/[0.06]"
            >
              <Building2 size={14} className="shrink-0 text-white/40" />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.status === 'pending' && <span className="shrink-0 text-[10px] text-amber-200/80">Pending</span>}
              {(w.current || w.id === cur?.id) && <Check size={14} className="shrink-0 text-cyan-300" />}
            </button>
          ))}
          <div className="my-1 border-t border-white/[0.06]" />
          <button
            onClick={onCreate}
            disabled={busy}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-cyan-200 transition hover:bg-white/[0.06] disabled:opacity-40"
          >
            <Plus size={14} className="shrink-0" />
            <span>New workspace</span>
            {list.length >= MAX_WORKSPACES && <span className="ml-auto text-[10px] text-white/30">Limit reached</span>}
          </button>
        </div>
      )}
    </div>
  );
}
