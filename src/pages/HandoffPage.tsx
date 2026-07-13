import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getProject,
  listKeys,
  getHandoffPackage,
  handoffProject,
  type KeyInfo,
  type HandoffResult,
} from '@/lib/api';
import type { Project } from '@/lib/types';
import { Empty } from '@/components/ui';
import { Copy, Check, KeyRound, ArrowRightLeft } from 'lucide-react';

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn-soft text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* ignore */
        }
      }}
    >
      {ok ? <Check size={14} /> : <Copy size={14} />}
      {ok ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function HandoffPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [toKey, setToKey] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<HandoffResult | null>(null);
  const [noBackend, setNoBackend] = useState(false);

  useEffect(() => {
    getProject(id).then(setProject);
    listKeys().then(setKeys);
    getHandoffPackage(id).then((p) => {
      if (p) setPreview(p.package);
      else setNoBackend(true);
    });
  }, [id]);

  if (project === undefined) return <Empty text="Loading…" />;
  if (project === null) return <Empty text="Project not found" />;

  const submit = async () => {
    if (!toKey || saving) return;
    setSaving(true);
    const key = keys.find((k) => k.name === toKey);
    const r = await handoffProject(id, {
      toOwnerName: key?.ownerName,
      note: note.trim() || undefined,
    });
    setSaving(false);
    if (r) setResult(r);
    else setNoBackend(true);
  };

  // Successful handoff view.
  if (result) {
    return (
      <div className="max-w-2xl">
        <div className="card p-6">
          <div className="flex items-center gap-2 text-emerald-200 mb-2">
            <Check size={20} />
            <h2 className="text-lg font-semibold">Handoff complete</h2>
          </div>
          <p className="text-sm text-ink-600 mb-5">
            <b>{result.project.name}</b> is now assigned to <b>{result.project.ownerName}</b>.
            HANDOFF.md was written to the repository. Give the instruction below to the next maintainer's AI so it can continue from the recorded context.
          </p>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="label mb-0">Boot instruction for the next AI</span>
              <CopyBtn text={result.bootPrompt} />
            </div>
            <pre className="rounded-xl2 bg-black/30 border border-white/10 p-3 text-xs text-white/70 whitespace-pre-wrap">
              {result.bootPrompt}
            </pre>
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="label mb-0">Repository URL</span>
              <CopyBtn text={result.cloneUrl} />
            </div>
            <code className="block rounded-xl2 bg-black/30 border border-white/10 p-3 text-xs text-white/70">
              {result.cloneUrl}
            </code>
          </div>

          <div className="flex gap-2">
            <Link to={`/projects/${id}`} className="btn-primary">
              Back to project record
            </Link>
            <Link to="/projects" className="btn-ghost">
              All projects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const candidates = keys.filter((k) => k.status === 'active');

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-ink-500 mb-5">
        A handoff transfers the <b>owner and durable project record</b> to the next person. The system writes a structured HANDOFF.md file to the repository.
        Afterward, create a new short-lived credential for the receiving AI from the Access tab. Never share a website password or reuse the old credential.
      </p>

      {noBackend && (
        <div className="card p-4 mb-4 border-amber-200/20 bg-amber-300/10 text-sm text-amber-100">
          Handoff requires the backend Git service (<code>server/ npm start</code>). The backend is currently unavailable.
          You may preview below, but start the backend before executing the handoff.
        </div>
      )}

      <div className="card p-6 space-y-5">
        <div>
          <label className="label">New owner (changes ownership only; no service credentials are transferred)</label>
          <div className="space-y-2">
            {candidates.map((k) => (
              <label
                key={k.name}
                className={`flex items-center gap-3 rounded-xl2 border px-3 py-2.5 cursor-pointer transition ${
                  toKey === k.name
                    ? 'border-brand-400 bg-brand-50'
                    : 'border-white/10 hover:bg-white/10'
                }`}
              >
                <input
                  type="radio"
                  name="tokey"
                  className="accent-brand-600"
                  checked={toKey === k.name}
                  onChange={() => setToKey(k.name)}
                />
                <span className="font-medium text-ink-900">{k.ownerName}</span>
                <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                  <KeyRound size={12} />
                  AI service configured
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Handoff note (optional details the next maintainer should notice)</label>
          <textarea
            className="input min-h-[64px] resize-y"
            placeholder="For example: review the authentication risk recorded in ISSUES/ first"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {preview && (
          <details className="rounded-xl2 border border-white/10 bg-black/30 p-3">
            <summary className="text-sm text-ink-600 cursor-pointer">
              Preview HANDOFF.md
            </summary>
            <pre className="mt-3 text-xs text-ink-700 whitespace-pre-wrap max-h-72 overflow-y-auto">
              {preview}
            </pre>
          </details>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={() => nav(`/projects/${id}`)}>
            Cancel
          </button>
          <button
            className="btn-primary disabled:opacity-40"
            disabled={!toKey || saving}
            onClick={submit}
          >
            <ArrowRightLeft size={16} />
            {saving ? 'Handing off…' : 'Confirm handoff'}
          </button>
        </div>
      </div>
    </div>
  );
}
