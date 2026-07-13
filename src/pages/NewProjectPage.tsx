import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createProject,
  emptyKickoff,
  matchKnowledge,
  listProjects,
  assistProjectDraft,
  type KnowledgeItem,
} from '@/lib/api';
import type { KickoffCard, Project } from '@/lib/types';
import { Plus, X, AlertTriangle, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { TypeBadge } from './KnowledgePage';
import { AiProgress } from '@/components/AiProgress';

/**
 * A new project starts with one kickoff card, then the backend creates its Git repository.
 * This page has one purpose: project kickoff.
 */
export default function NewProjectPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [k, setK] = useState<KickoffCard>(emptyKickoff());
  const [saving, setSaving] = useState(false);
  const [hints, setHints] = useState<KnowledgeItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistStartedAt, setAssistStartedAt] = useState<number | undefined>(undefined);
  const [err, setErr] = useState('');

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem('project_os_newproject_draft');
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      setStep(Number(d.step || 0));
      setName(d.name || '');
      setOwner(d.owner || '');
      setK(d.k || emptyKickoff());
    } catch {
      localStorage.removeItem('project_os_newproject_draft');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      'project_os_newproject_draft',
      JSON.stringify({ step, name, owner, k }),
    );
  }, [step, name, owner, k]);

  const canSubmit = name.trim() && k.forWhom.trim() && k.goal.trim();
  const duplicate = Boolean(
    name.trim() && projects.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase()),
  );

  // Surface related risks, lessons, and standards while the kickoff card is being completed.
  useEffect(() => {
    const text = `${name} ${k.forWhom} ${k.goal}`.trim();
    if (text.length < 2) {
      setHints([]);
      return;
    }
    const t = setTimeout(() => {
      matchKnowledge(text).then(setHints);
    }, 400);
    return () => clearTimeout(t);
  }, [name, k.forWhom, k.goal]);

  const setAcc = (i: number, v: string) => {
    const acc = [...k.acceptance];
    acc[i] = v;
    setK({ ...k, acceptance: acc });
  };
  const addAcc = () => setK({ ...k, acceptance: [...k.acceptance, ''] });
  const delAcc = (i: number) =>
    setK({ ...k, acceptance: k.acceptance.filter((_, idx) => idx !== i) });

  const draft = {
    name,
    owner,
    kickoff: k,
  };

  const aiHelp = async (field: string) => {
    setErr('');
    setAssistBusy(true);
    setAssistStartedAt(Date.now());
    const r = await assistProjectDraft(field, draft);
    setAssistBusy(false);
    setAssistStartedAt(undefined);
    if (!r) {
      setErr('AI is unavailable. Confirm that the server-side AI service is configured.');
      return;
    }
    if (field === 'goal' && r.text) setK({ ...k, goal: r.text });
    if (field === 'acceptance' && r.items.length) setK({ ...k, acceptance: r.items });
    if (field === 'notDoing' && r.text) setK({ ...k, notDoing: r.text });
    if (field === 'forWhom' && r.text) setK({ ...k, forWhom: r.text });
  };

  const canNext = () => {
    if (step === 0) return Boolean(name.trim()) && !duplicate;
    if (step === 1) return Boolean(k.forWhom.trim());
    if (step === 2) return Boolean(k.goal.trim());
    if (step === 3) return k.acceptance.some((a) => a.trim());
    return true;
  };

  const next = () => {
    if (!canNext()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    const acceptance = k.acceptance.map((s) => s.trim()).filter(Boolean);
    const p = await createProject({
      name: name.trim(),
      ownerName: owner.trim() || undefined,
      kickoff: { ...k, acceptance },
    });
    localStorage.removeItem('project_os_newproject_draft');
    nav(`/projects/${p.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-xs text-white/35">
          <span>Kickoff guide</span>
          <span>
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {hints.length > 0 && (
        <div className="card p-4 mb-5 border-amber-200/20 bg-amber-300/10">
          <div className="flex items-center gap-1.5 text-amber-100 text-sm font-medium mb-2">
            <AlertTriangle size={16} />
            Review these related risks before starting
          </div>
          <ul className="space-y-1.5">
            {hints.map((h) => (
              <li key={h.id} className="flex items-start gap-2 text-sm text-white/70">
                <TypeBadge type={h.type} />
                <span>{h.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {err && <div className="card mb-4 px-3 py-2 text-sm text-amber-100">{err}</div>}

      <div className="card min-h-[420px] p-6">
        <div className="mb-8 text-center">
          <div className="mb-2 text-xs text-white/35">{STEPS[step].eyebrow}</div>
          <h2 className="text-2xl font-semibold text-white">{STEPS[step].title}</h2>
          <p className="mt-2 text-sm leading-6 text-white/50">{STEPS[step].hint}</p>
        </div>

        {step === 0 && (
          <div className="mx-auto max-w-md">
          <input
            className="input text-center text-lg"
            placeholder="Example: AI delivery control center"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
            {duplicate && <p className="mt-3 text-center text-sm text-rose-200">A project with this name already exists.</p>}
        </div>
        )}

        {step === 1 && (
          <StepBlock onAi={() => aiHelp('forWhom')} busy={assistBusy} startedAt={assistStartedAt}>
          <input
              className="input text-center text-lg"
            placeholder="Example: small support team using AI agents"
            value={k.forWhom}
            onChange={(e) => setK({ ...k, forWhom: e.target.value })}
          />
          </StepBlock>
        )}

        {step === 2 && (
          <StepBlock onAi={() => aiHelp('goal')} busy={assistBusy} startedAt={assistStartedAt}>
          <textarea
              className="input scroll-textarea h-40 resize-none text-base leading-7"
            placeholder="Example: the team can see AI progress, risks, and next steps"
            value={k.goal}
            onChange={(e) => setK({ ...k, goal: e.target.value })}
          />
          </StepBlock>
        )}

        {step === 3 && (
          <StepBlock onAi={() => aiHelp('acceptance')} busy={assistBusy} startedAt={assistStartedAt}>
            <div className="space-y-2">
            {k.acceptance.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input"
                    placeholder={`Acceptance ${i + 1}, e.g. every AI step creates a project event`}
                  value={a}
                  onChange={(e) => setAcc(i, e.target.value)}
                />
                {k.acceptance.length > 1 && (
                  <button
                    className="text-white/30 hover:text-rose-300 p-1"
                    onClick={() => delAcc(i)}
                    aria-label="Delete"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
            <button className="btn-ghost mt-3 text-brand-600" onClick={addAcc}>
            <Plus size={16} /> Add another
          </button>
          </StepBlock>
        )}

        {step === 4 && (
          <StepBlock onAi={() => aiHelp('notDoing')} busy={assistBusy} startedAt={assistStartedAt}>
          <textarea
              className="input scroll-textarea h-36 resize-none text-base leading-7"
            placeholder={'Example: this slice does not connect production accounts or private provider adapters.\\nYou can write multiple lines here.'}
            value={k.notDoing}
            onChange={(e) => setK({ ...k, notDoing: e.target.value })}
          />
          </StepBlock>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div>
              <label className="label">Owner</label>
              <input
                className="input"
                placeholder="For example: project owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </div>
            <div className="rounded-xl2 border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/65">
              <div>Project: <span className="text-white">{name || 'Not provided'}</span></div>
              <div>Audience: <span className="text-white">{k.forWhom || 'Not provided'}</span></div>
              <div>Goal: <span className="text-white">{k.goal || 'Not provided'}</span></div>
              <div>Acceptance: <span className="text-white">{k.acceptance.filter(Boolean).join('; ') || 'Not provided'}</span></div>
              <div>Out of scope: <span className="text-white">{k.notDoing || 'Not provided'}</span></div>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <button className="btn-ghost" onClick={() => (step === 0 ? nav(-1) : setStep((s) => s - 1))}>
            <ArrowLeft size={15} />
            {step === 0 ? 'Exit' : 'Previous'}
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn-primary disabled:opacity-40" disabled={!canNext()} onClick={next}>
              Next
              <ArrowRight size={15} />
            </button>
          ) : (
            <button className="btn-primary disabled:opacity-40" disabled={!canSubmit || saving} onClick={submit}>
              {saving ? 'Creating…' : 'Create project'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { eyebrow: 'Step 1', title: 'Name the project', hint: 'Use a name that tells the team what this work is at a glance.' },
  { eyebrow: 'Step 2', title: 'Who is this for?', hint: 'Define the audience before choosing the outcome.' },
  { eyebrow: 'Step 3', title: 'What will become possible?', hint: 'Describe what the user will be able to do, not an abstract vision.' },
  { eyebrow: 'Step 4', title: 'What counts as done?', hint: 'Specific acceptance criteria make handoff and review easier.' },
  { eyebrow: 'Step 5', title: 'What is out of scope?', hint: 'Clear boundaries keep the project focused.' },
  { eyebrow: 'Final step', title: 'Owner and related information', hint: 'The system will create the project record and Git audit repository.' },
];

function StepBlock({
  children,
  onAi,
  busy,
  startedAt,
}: {
  children: ReactNode;
  onAi: () => void;
  busy: boolean;
  startedAt?: number;
}) {
  return (
    <div className="mx-auto max-w-lg">
      {children}
      <div className="mt-3 text-center">
        <button className="btn-soft" disabled={busy} onClick={onAi}>
          <Sparkles size={15} />
          {busy ? 'AI is drafting' : 'Draft with AI'}
        </button>
      </div>
      <AiProgress active={busy} startedAt={startedAt} label="AI is reading the kickoff draft and preparing suggestions" expectedMs={18000} />
    </div>
  );
}
