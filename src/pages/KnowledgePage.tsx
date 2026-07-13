import { useEffect, useState } from 'react';
import {
  exportKnowledgePdf,
  getKnowledgeOrganizeStatus,
  listKnowledge,
  type KnowledgeItem,
  type KnowledgeOrganizeStatus,
} from '@/lib/api';
import { Empty } from '@/components/ui';
import { Search, X } from 'lucide-react';

const TYPES = ['all', 'principle', 'method', 'risk', 'lesson', 'note'];

const TYPE_STYLE: Record<string, string> = {
  principle: 'bg-sky-300/10 text-sky-100 border border-sky-200/20',
  method: 'bg-cyan-300/10 text-cyan-100 border border-cyan-200/20',
  risk: 'bg-rose-400/10 text-rose-200 border border-rose-300/20',
  lesson: 'bg-amber-300/10 text-amber-200 border border-amber-200/20',
  note: 'bg-white/10 text-white/60 border border-white/10',
};

function titleOf(item: KnowledgeItem) {
  return item.aiTitle || item.title || 'Untitled knowledge item';
}

function summaryOf(item: KnowledgeItem) {
  return item.aiSummary || item.body || item.aiDetail || '';
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${TYPE_STYLE[type] || 'bg-white/10 text-white/60 border border-white/10'}`}>
      {type}
    </span>
  );
}

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[] | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState<KnowledgeItem | null>(null);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<KnowledgeOrganizeStatus | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      listKnowledge({ q: q || undefined, type: type === 'all' ? undefined : type }).then(setItems);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q, type]);

  useEffect(() => {
    const load = () => getKnowledgeOrganizeStatus().then(setStatus);
    load();
    const timer = window.setInterval(load, 3500);
    return () => window.clearInterval(timer);
  }, []);

  const downloadPdf = async (scope: 'current' | KnowledgeItem) => {
    setExporting(true);
    setMsg('');
    const body =
      scope === 'current'
        ? { q: q || undefined, type: type === 'all' ? undefined : type, title: 'Knowledge export' }
        : { ids: [scope.id], title: `${titleOf(scope)} export` };
    const result = await exportKnowledgePdf(body);
    setExporting(false);
    if (!result.ok) {
      setMsg(`Export failed: ${result.error}`);
      return;
    }
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg('PDF generated.');
  };

  return (
    <div className="max-w-5xl">
      <p className="mb-4 text-sm text-ink-500">
        Project lessons, reusable methods, and handoff knowledge captured from real delivery work.
      </p>
      <KnowledgeAutoStatus status={status} />

      <section className="card mb-5 p-5">
        <h2 className="text-base font-semibold text-white">Knowledge API</h2>
        <p className="mt-2 text-sm leading-7 text-white/60">
          Each workspace can keep its own project knowledge. External tools can write curated items through the API after a workspace key is created in settings.
        </p>
        <pre className="mt-4 overflow-auto rounded-xl2 border border-white/10 bg-black/35 p-4 text-xs leading-6 text-white/65">
{`curl -X POST "http://localhost:8790/api/w/<workspace>/kb/v1/items" \\
  -H "Authorization: Bearer kb_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "method",
    "title": "Run acceptance checks before handoff",
    "body": "Describe the verification steps and known risks.",
    "businessLine": "project execution",
    "tags": ["handoff", "verification"]
  }'`}
        </pre>
      </section>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
          <input
            className="input pl-9"
            placeholder="Search project lessons, methods, or handoff notes"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <button className="btn-soft shrink-0" disabled={exporting} onClick={() => downloadPdf('current')}>
          {exporting ? 'Exporting' : 'Export PDF'}
        </button>
      </div>

      {msg && <div className="card mb-4 px-3 py-2 text-sm text-white/70">{msg}</div>}

      <div className="mb-5 flex flex-wrap gap-2">
        {TYPES.map((item) => (
          <button
            key={item}
            onClick={() => setType(item)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              type === item ? 'bg-white text-black' : 'bg-white/10 text-white/60 hover:bg-white/10'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {!items ? (
        <Empty text="Loading knowledge..." />
      ) : items.length === 0 ? (
        <Empty text="No matching knowledge yet." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              className="card block w-full p-4 text-left transition hover:border-white/25"
              onClick={() => setSelected(item)}
            >
              <div className="mb-1 flex items-center gap-2">
                <TypeBadge type={item.type} />
                <span className="font-medium text-ink-900">{titleOf(item)}</span>
              </div>
              <p className="mb-2 line-clamp-2 text-sm leading-6 text-white/60">{summaryOf(item)}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
                <span className="text-brand-600">{item.businessLine}</span>
                {item.tags.slice(0, 6).map((tag) => (
                  <span key={tag} className="rounded bg-white/10 px-1.5 py-0.5">
                    {tag}
                  </span>
                ))}
                <span className="ml-auto">source: {item.source}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <KnowledgeSheet item={selected} onClose={() => setSelected(null)} onExport={downloadPdf} exporting={exporting} />
    </div>
  );
}

function KnowledgeAutoStatus({ status }: { status: KnowledgeOrganizeStatus | null }) {
  if (!status || status.total <= 0) return null;
  const success = Math.max(0, status.organized - status.failed);
  const processed = Math.min(status.total, success + status.failed);
  const percent = Math.round((processed / status.total) * 100);
  const active = status.running || status.scheduled || status.pending > 0;

  return (
    <section className="card mb-5 border-cyan-200/15 bg-cyan-300/[0.035] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="font-medium text-cyan-100">Knowledge organization {active ? 'running' : 'complete'}</span>
        <span className="text-white/55">
          {percent}% - processed {processed} / {status.total}
        </span>
      </div>
      <div className="ai-progress-track">
        <div className="ai-progress-fill" style={{ width: `${Math.min(100, Math.max(4, percent))}%` }} />
        {active && <div className="ai-progress-scan" />}
      </div>
    </section>
  );
}

function KnowledgeSheet({
  item,
  onClose,
  onExport,
  exporting,
}: {
  item: KnowledgeItem | null;
  onClose: () => void;
  onExport: (item: KnowledgeItem) => void;
  exporting: boolean;
}) {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#08090f] p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <TypeBadge type={item.type} />
            <h2 className="mt-3 text-2xl font-semibold text-white">{titleOf(item)}</h2>
            <p className="mt-2 text-sm text-white/45">{item.businessLine}</p>
          </div>
          <button className="rounded-full bg-white/10 p-2 text-white/60 hover:text-white" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <button className="btn-soft mb-4" disabled={exporting} onClick={() => onExport(item)}>
          {exporting ? 'Exporting' : 'Export this item'}
        </button>
        <div className="space-y-5 text-sm leading-7 text-white/70">
          {item.aiSummary && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-white">Summary</h3>
              <p>{item.aiSummary}</p>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-white">Body</h3>
            <p className="whitespace-pre-wrap">{item.body}</p>
          </section>
          {item.tags.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-white">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/65">
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
