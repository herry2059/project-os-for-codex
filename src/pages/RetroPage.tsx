import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  draftRetro,
  getProject,
  getRetroSummary,
  retroProject,
  type KnowledgeItem,
  type RetroAnswers,
} from '@/lib/api';
import type { Project } from '@/lib/types';
import { Empty } from '@/components/ui';
import { BookOpen, Check, FileText, Sparkles } from 'lucide-react';
import { AiProgress } from '@/components/AiProgress';

const emptyAnswers = (): RetroAnswers => ({
  uncertainties: [],
  omissions: [],
  failureRisks: [],
  leadingFeatures: [],
  betterWays: [],
  wins: [],
  pitfalls: [],
  improvements: [],
});

const FIELDS: Array<{ key: keyof RetroAnswers; label: string; hint: string; placeholder: string }> = [
  {
    key: 'uncertainties',
    label: 'What remains uncertain or insufficiently understood?',
    hint: 'Trace the root cause before declaring the project finished.',
    placeholder: 'For example: AI usage metrics have not been tested under long-running load',
  },
  {
    key: 'omissions',
    label: 'What was the biggest omission or blind spot?',
    hint: 'Finding blind spots matters more than listing achievements.',
    placeholder: 'For example: credential-copy actions were not included in the audit design',
  },
  {
    key: 'failureRisks',
    label: 'If this fails in three months, what is the most likely cause?',
    hint: 'Identify latent failure modes early.',
    placeholder: 'For example: a third-party endpoint changes without a health-check alert',
  },
  {
    key: 'leadingFeatures',
    label: 'Which one industry-leading capability would you add?',
    hint: 'Explore ideas without adding them to the current scope.',
    placeholder: 'For example: AI reads the repository and forecasts next-week risks',
  },
  {
    key: 'betterWays',
    label: 'Which different choices would make delivery more efficient?',
    hint: 'Turn the answer into a reusable method.',
    placeholder: 'For example: define the acceptance script before building the UI',
  },
  {
    key: 'wins',
    label: 'What worked well?',
    hint: 'Keep the practices that proved effective.',
    placeholder: 'For example: prove one complete project workflow before expanding',
  },
  {
    key: 'pitfalls',
    label: 'What failed or caused trouble?',
    hint: 'Be specific enough that another AI can reuse the lesson.',
    placeholder: 'For example: UI-only configuration left the server-side AI integration unavailable',
  },
  {
    key: 'improvements',
    label: 'What should change next time?',
    hint: 'Turn the lesson into an executable standard.',
    placeholder: 'For example: create a tested rollback backup before every destructive action',
  },
];

const splitLines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

const joinLines = (items?: string[]) => (items || []).join('\n');

function MarkdownLite({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-7 text-white/72">
      {text.split('\n').map((line, idx) => {
        const t = line.trim();
        if (!t) return <div key={idx} className="h-2" />;
        if (t.startsWith('##')) return <h3 key={idx} className="pt-3 text-base font-semibold text-white">{t.replace(/^#+\s*/, '')}</h3>;
        if (t.startsWith('#')) return <h2 key={idx} className="pt-3 text-xl font-semibold text-white">{t.replace(/^#+\s*/, '')}</h2>;
        if (t.startsWith('- ')) return <p key={idx} className="pl-4 before:mr-2 before:content-['•']">{t.slice(2)}</p>;
        if (t.startsWith('>')) return <p key={idx} className="text-white/40">{t.replace(/^>\s*/, '')}</p>;
        return <p key={idx}>{t}</p>;
      })}
    </div>
  );
}

export default function RetroPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [form, setForm] = useState<Record<keyof RetroAnswers, string>>({
    uncertainties: '',
    omissions: '',
    failureRisks: '',
    leadingFeatures: '',
    betterWays: '',
    wins: '',
    pitfalls: '',
    improvements: '',
  });
  const [summary, setSummary] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftStartedAt, setDraftStartedAt] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<KnowledgeItem[] | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getProject(id).then(setProject);
    getRetroSummary(id).then((r) => setSummary(r?.summary || ''));
  }, [id]);

  if (project === undefined) return <Empty text="Loading…" />;
  if (project === null) return <Empty text="Project not found" />;

  const answers = (): RetroAnswers =>
    FIELDS.reduce((acc, field) => {
      acc[field.key] = splitLines(form[field.key]);
      return acc;
    }, emptyAnswers());

  const canSubmit = Object.values(form).some((v) => v.trim());

  const fillDraft = async () => {
    setDrafting(true);
    setDraftStartedAt(Date.now());
    setMsg('');
    const r = await draftRetro(id);
    setDrafting(false);
    setDraftStartedAt(undefined);
    if (!r) {
      setMsg('AI drafting failed. Confirm the server-side AI service configuration, or complete the form manually.');
      return;
    }
    const next = { ...form };
    for (const field of FIELDS) next[field.key] = joinLines(r.draft[field.key]);
    setForm(next);
    setMsg('AI draft created. Review every item before submitting.');
  };

  const submit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setMsg('');
    const r = await retroProject(id, answers());
    setSaving(false);
    if (!r) {
      setMsg('Could not close the project. Confirm the backend is online and retry.');
      return;
    }
    setCreated(r.created);
    const s = await getRetroSummary(id);
    setSummary(s?.summary || '');
  };

  if (created) {
    return (
      <div className="max-w-3xl">
        <div className="card p-6">
          <div className="mb-2 flex items-center gap-2 text-emerald-200">
            <Check size={20} />
            <h2 className="text-lg font-semibold">Retrospective complete</h2>
          </div>
          <p className="mb-4 text-sm text-ink-600">
            The project is closed. {created.length} lessons or methods were added to the knowledge base, and RETROSPECTIVE.md was committed to the project repository.
          </p>
          {summary && (
            <div className="mb-5 max-h-[45vh] overflow-y-auto rounded-xl2 border border-white/10 bg-white/[0.03] p-4">
              <MarkdownLite text={summary} />
            </div>
          )}
          <div className="flex gap-2">
            <Link to="/knowledge" className="btn-primary">
              <BookOpen size={16} /> Open knowledge base
            </Link>
            <Link to={`/projects/${id}`} className="btn-ghost">
              Back to project
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (summary && project.status === 'done') {
    return (
      <div className="max-w-3xl">
        <div className="card p-6">
          <div className="mb-4 flex items-center gap-2 text-white">
            <FileText size={18} />
            <h2 className="text-lg font-semibold">Project retrospective</h2>
          </div>
          <div className="max-h-[65vh] overflow-y-auto rounded-xl2 border border-white/10 bg-white/[0.03] p-4">
            <MarkdownLite text={summary} />
          </div>
          <div className="mt-5">
            <Link to={`/projects/${id}`} className="btn-ghost">
              Back to project
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <p className="mb-5 text-sm leading-7 text-ink-500">
        To close <b>{project.name}</b>, let AI draft from the verified project record and Git trail, then require human confirmation. The result is written to
        <code className="mx-1 text-brand-400">RETROSPECTIVE.md</code>, while approved lessons are added to the workspace knowledge base.
      </p>

      {msg && <div className="card mb-4 px-3 py-2 text-sm text-white/70">{msg}</div>}

      <div className="card p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Retrospective checklist</h2>
            <p className="mt-1 text-xs text-white/40">Enter one item per line. Review and edit every AI-generated item.</p>
          </div>
          <button className="btn-soft shrink-0" disabled={drafting} onClick={fillDraft}>
            <Sparkles size={15} />
            {drafting ? 'AI is drafting' : 'Draft with AI'}
          </button>
        </div>
        <AiProgress active={drafting} startedAt={draftStartedAt} label="AI is reading the project trail and drafting the retrospective" expectedMs={32000} />

        <div className="space-y-5">
          {FIELDS.map((field, index) => (
            <div key={field.key}>
              <label className="label">
                {index + 1}. {field.label}
              </label>
              <p className="mb-2 text-xs text-white/35">{field.hint}</p>
              <textarea
                className="input min-h-[82px] resize-y"
                placeholder={`${field.placeholder}\nOne item per line`}
                value={form[field.key]}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button className="btn-ghost" onClick={() => nav(`/projects/${id}`)}>
            Cancel
          </button>
          <button className="btn-primary disabled:opacity-40" disabled={!canSubmit || saving} onClick={submit}>
            {saving ? 'Closing project…' : 'Confirm closure and save knowledge'}
          </button>
        </div>
      </div>
    </div>
  );
}
