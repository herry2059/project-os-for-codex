import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getProject,
  getProjectConnection,
  getProjectLog,
  getRetroSummary,
  listAgentCredentials,
  createAgentCredential,
  revokeAgentCredential,
  listAgentAudit,
  deleteProject,
  postEvent,
  rotateProjectKey,
  updateProject,
} from '@/lib/api';
import type { AgentAuditEvent, AgentCredential, AgentCredentialCreateResult, ProjectConnection } from '@/lib/api';
import type { Project, ProjectEvent } from '@/lib/types';
import { HealthDot, ProgressBar, Empty } from '@/components/ui';
import { GitBranch, KeyRound, Target, ShieldCheck, Ban, ArrowRightLeft, BookOpen, Users, FileText, Trash2, ArrowUpRight, Plus, Pencil, X, Copy, Link2 } from 'lucide-react';
import Tabs from '@/components/Tabs';

export default function ProjectDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [log, setLog] = useState<ProjectEvent[] | null>(null);
  const [logging, setLogging] = useState(false);
  const [msg, setMsg] = useState('');
  const [prog, setProg] = useState<number | ''>('');
  const [nextStepInput, setNextStepInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasRetroSummary, setHasRetroSummary] = useState(false);
  const [connection, setConnection] = useState<ProjectConnection | null>(null);
  const [keyMsg, setKeyMsg] = useState('');
  const [oneTimeProjectKey, setOneTimeProjectKey] = useState('');
  const [oneTimeBootText, setOneTimeBootText] = useState('');
  const [agentCredentials, setAgentCredentials] = useState<AgentCredential[]>([]);
  const [agentAudit, setAgentAudit] = useState<AgentAuditEvent[]>([]);
  const [agentLabel, setAgentLabel] = useState('Codex');
  const [agentDuration, setAgentDuration] = useState<24 | 168>(24);
  const [createdAgent, setCreatedAgent] = useState<AgentCredentialCreateResult | null>(null);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState({
    name: '',
    forWhom: '',
    goal: '',
    acceptance: [''] as string[],
    notDoing: '',
    ownerName: '',
  });

  const load = () => {
    getProject(id).then(setProject);
    getProjectLog(id).then(setLog);
    getRetroSummary(id).then((r) => setHasRetroSummary(Boolean(r?.summary)));
    getProjectConnection(id).then(setConnection);
    listAgentCredentials(id).then(setAgentCredentials);
    listAgentAudit(id).then(setAgentAudit);
  };
  useEffect(() => {
    load();
  }, [id]);

  const startEditProject = () => {
    const p = project as Project;
    setEf({
      name: p.name,
      forWhom: p.kickoff.forWhom,
      goal: p.kickoff.goal,
      acceptance: p.kickoff.acceptance.length ? p.kickoff.acceptance : [''],
      notDoing: p.kickoff.notDoing,
      ownerName: p.ownerName || '',
    });
    setEditing(true);
  };
  const saveEdit = async () => {
    const acceptance = ef.acceptance.map((s) => s.trim()).filter(Boolean);
    await updateProject(id, {
      name: ef.name.trim() || (project as Project).name,
      kickoff: { forWhom: ef.forWhom, goal: ef.goal, acceptance, notDoing: ef.notDoing },
      ownerName: ef.ownerName.trim() || null,
    });
    setEditing(false);
    load();
  };

  const submitEvent = async () => {
    if (!msg.trim() || saving) return;
    setSaving(true);
    const r = await postEvent(id, {
      message: msg.trim(),
      actor: (project as Project)?.ownerName || 'Me',
      progressTo: prog === '' ? undefined : Number(prog),
      nextStep: nextStepInput.trim() || undefined,
    });
    setSaving(false);
    if (r) {
      setMsg('');
      setProg('');
      setNextStepInput('');
      setLogging(false);
      load();
    }
  };

  const onDelete = async () => {
    if (!window.confirm('Delete this project and its Git repository? This cannot be undone.')) return;
    const ok = await deleteProject(id);
    if (!ok) {
      window.alert('Deletion was not confirmed by the backend. Refresh and verify the project before trying again.');
      return;
    }
    nav('/projects');
  };

  const copyProjectText = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setKeyMsg(ok);
      setTimeout(() => setKeyMsg(''), 2200);
    } catch {
      setKeyMsg('Copy failed. Check the browser clipboard permission.');
    }
  };

  // Build a legacy REST brief locally from the one-time secret and the /context and /events contracts.
  const buildAiBrief = (key: string, conn = connection, proj = project) => {
    const ctx = conn?.contextUrl || proj?.projectContextUrl || `${location.origin}/api/projects/${id}/context`;
    const ev = conn?.eventsUrl || `${location.origin}/api/projects/${id}/events`;
    const git = conn?.cloneUrl || proj?.repoUrl || '(repository pending)';
    const name = proj?.name || id;
    const k = key || 'pkey_your_project_key';
    return [
      `# Legacy REST Script Setup`,
      `# Project: ${name}`,
      ``,
      `Use this only for local scripts you control. New integrations should use a short-lived AI credential with MCP.`,
      ``,
      `## Credential scope`,
      `- This Project-Key begins with pkey_ and can access only this project's records and Git repository.`,
      `- Provider credentials stay on the server. Do not mix them with project secrets.`,
      ``,
      `## Authentication`,
      `Send this header with every request:`,
      `X-Project-Key: ${k}`,
      ``,
      `## Step 1: read the complete project context before working`,
      `GET ${ctx}`,
      `curl -H "X-Project-Key: ${k}" "${ctx}"`,
      `The JSON response includes:`,
      `- bootPrompt: a one-line start instruction`,
      `- project: name, progress, next step, and owner`,
      `- files: HANDOFF.md, PROJECT.md, AGENTS.md, and PROGRESS.md`,
      `- recentLog: recent audit events`,
      `Read HANDOFF.md, PROJECT.md, AGENTS.md, and PROGRESS.md in that order to understand the goal, acceptance criteria, guardrails, current progress, and next step.`,
      ``,
      `## Step 2: do the work`,
      `Start from the recorded next step, follow AGENTS.md, and meet the acceptance criteria in PROJECT.md.`,
      ``,
      `## Step 3: append an audit event after each verified step`,
      `POST ${ev}`,
      `Headers: X-Project-Key: ${k}   Idempotency-Key: your-stable-retry-key   Content-Type: application/json`,
      `Body:`,
      `{`,
      `  "message": "What was completed in one sentence",`,
      `  "progressTo": 20,`,
      `  "nextStep": "What should happen next"`,
      `}`,
      `Example:`,
      `curl -X POST -H "X-Project-Key: ${k}" -H "Idempotency-Key: step-login-001" -H "Content-Type: application/json" \\`,
      `  -d '{"message":"Connected the sign-in page","progressTo":20,"nextStep":"Connect the project list endpoint"}' \\`,
      `  "${ev}"`,
      ``,
      `## Optional: clone the repository for direct file changes`,
      `git clone ${git}`,
      `Update HANDOFF.md, PROJECT.md, PROGRESS.md, or ISSUES/ in the repository, then push the changes.`,
      ``,
      `## Guardrails`,
      `- Never put a project key in AI chat, code, logs, or commits. Use a local environment variable or trusted secret store.`,
      `- Work only on this project.`,
      `- Stop for human approval before destructive or irreversible actions such as deletion, release, deployment, or payment.`,
      `- When uncertain, read context and ask instead of guessing.`,
      `- Finish by recording a precise next step so another person or AI can continue.`,
    ].join('\n');
  };

  const rotateAndCopyProjectKey = async () => {
    if (!window.confirm('Create or rotate this legacy project key? The old key will stop working immediately.')) return;
    const r = await rotateProjectKey(id);
    if (!r?.ok) {
      setKeyMsg('Could not create the project key. Check permissions and backend status.');
      return;
    }
    setProject(r.project);
    setConnection(r.connection);
    setOneTimeProjectKey(r.projectKey);
    const bootText = r.bootText || buildAiBrief(r.projectKey, r.connection, r.project);
    setOneTimeBootText(bootText);
    setKeyMsg('Legacy project key created. It is shown only once; new integrations should still use a short-lived AI credential with MCP.');
  };

  const shellValue = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
  const mcpCommand = (created = createdAgent) => {
    if (!created) return '';
    const env = [
      `--env PROJECT_OS_BASE_URL=${shellValue(created.baseUrl)}`,
      `--env PROJECT_OS_AGENT_TOKEN=${shellValue(created.token)}`,
      `--env PROJECT_OS_PROJECT_ID=${shellValue(created.projectId)}`,
    ].join(' ');
    const name = `project-os-${created.projectId}`;
    const command = `npx -y ${created.mcpPackage}`;
    return `codex mcp add ${name} ${env} -- ${command}`;
  };

  const createAiAccess = async () => {
    if (creatingAgent) return;
    if (!window.confirm(`Create a ${agentDuration === 24 ? '24-hour' : '7-day'} AI credential that can only read this project and append progress?`)) return;
    setCreatingAgent(true);
    const result = await createAgentCredential(id, { label: agentLabel.trim() || 'Project AI', expiresInHours: agentDuration });
    setCreatingAgent(false);
    if (!result) {
      setKeyMsg('Could not create the AI credential. Project owner or workspace administrator permission is required.');
      return;
    }
    setCreatedAgent(result);
    setKeyMsg('AI credential created. It is shown only once; run the setup command directly in your terminal.');
    listAgentCredentials(id).then(setAgentCredentials);
    listAgentAudit(id).then(setAgentAudit);
  };

  const revokeAiAccess = async (credential: AgentCredential) => {
    if (!window.confirm(`Revoke the AI credential ${credential.label} now? Codex will lose access immediately.`)) return;
    if (!(await revokeAgentCredential(id, credential.id))) {
      setKeyMsg('Could not revoke the credential. Refresh and try again.');
      return;
    }
    setCreatedAgent((current) => (current?.credential.id === credential.id ? null : current));
    setKeyMsg('AI credential revoked.');
    listAgentCredentials(id).then(setAgentCredentials);
    listAgentAudit(id).then(setAgentAudit);
  };

  const guardRetro = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!project || project.progress >= 100) return;
    e.preventDefault();
    window.alert(`The project is ${project.progress}% complete. Reach 100% before starting the retrospective.`);
  };

  if (project === undefined) return <Empty text="Loading…" />;
  if (project === null)
    return (
      <div>
        <Empty text="Project not found" />
        <div className="text-center">
          <Link to="/projects" className="btn-soft">
            Back to projects
          </Link>
        </div>
      </div>
    );

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="card p-6 mb-5 overflow-hidden relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(141,233,255,0.16),transparent_34%)]" />
        <div className="relative flex items-start justify-between gap-6 mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-[clamp(26px,4vw,46px)] leading-tight font-normal text-white">{project.name}</h2>
            <HealthDot health={project.health} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to={`/projects/${project.id}/handoff`} className="btn-soft text-xs">
              <ArrowRightLeft size={14} />
              Hand off
            </Link>
            <Link
              to={`/projects/${project.id}/retro`}
              onClick={guardRetro}
              className={`btn-soft text-xs ${project.progress < 100 ? 'opacity-60' : ''}`}
              title={project.progress < 100 ? `Currently ${project.progress}%. Reach 100% before starting the retrospective.` : undefined}
            >
              <BookOpen size={14} />
              {hasRetroSummary ? 'View retrospective' : 'Run retrospective'}
            </Link>
          </div>
        </div>
        <div className="relative grid grid-cols-[1fr_auto] items-center gap-4">
          <ProgressBar value={project.progress} />
          <span className="text-3xl text-white leading-none">{project.progress}%</span>
        </div>

        {project.nextStep && (
          <div className="relative mt-5 rounded-xl2 bg-white/10 border border-white/10 px-4 py-3">
            <div className="text-[10px] text-white/30 mb-1">Next step</div>
            <div className="text-white font-medium">{project.nextStep}</div>
          </div>
        )}

        <div className="relative flex flex-wrap gap-4 mt-5 text-xs text-white/40">
          <span className="inline-flex items-center gap-1.5">
            <GitBranch size={14} />
            {project.repoUrl ? project.repoUrl : 'Repository pending backend provisioning'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <KeyRound size={14} />
            {project.projectKeyPrefix ? `Project key: ${project.projectKeyPrefix}` : 'Project key not created'}
          </span>
          {project.ownerName && <span>Owner: {project.ownerName}</span>}
        </div>
      </div>

      <Tabs
        items={[
          {
            key: 'overview',
            label: 'Overview',
            icon: <Target size={15} />,
            node: (
              <section className="card p-5">
                <h3 className="mb-3 text-sm font-semibold text-white/75">Project overview</h3>
                {/* Project summary with the goal and acceptance context. */}
                <div className="mb-4 rounded-xl2 border border-cyan-200/20 bg-cyan-300/[0.05] p-4">
                  <div className="mb-1 text-xs text-white/40">What this project will achieve</div>
                  <div className="text-sm leading-6 text-white/85">
                    {project.kickoff.goal || 'No project goal yet. Complete the kickoff card so people and AI can understand it.'}
                  </div>
                  {(project.kickoff.forWhom || project.kickoff.notDoing || (project.kickoff.acceptance && project.kickoff.acceptance.length > 0)) && (
                    <div className="mt-2 space-y-1 text-xs text-white/50">
                      {project.kickoff.forWhom && <div>For: {project.kickoff.forWhom}</div>}
                      {project.kickoff.acceptance && project.kickoff.acceptance.length > 0 && (
                        <div>Acceptance criteria: {project.kickoff.acceptance.length} items in the kickoff card</div>
                      )}
                      {project.kickoff.notDoing && <div>Out of scope: {project.kickoff.notDoing}</div>}
                    </div>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MiniStat label="Progress" value={`${project.progress}%`} />
                  <MiniStat label="Owner" value={project.ownerName || 'Unassigned'} />
                  <MiniStat label="Health" value={project.health} />
                </div>
                <div className="mt-4 rounded-xl2 border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-1 text-xs text-white/35">Next step</div>
                  <div className="text-sm text-white/75">{project.nextStep || 'No next step recorded'}</div>
                </div>
                <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
                  <MiniMeta icon={<GitBranch size={14} />} label="Repository" value={project.repoUrl || 'Pending'} />
                  <MiniMeta icon={<KeyRound size={14} />} label="Project key" value={project.projectKeyPrefix || 'Not created'} />
                </div>
              </section>
            ),
          },
          {
            key: 'access',
            label: 'Access',
            icon: <Link2 size={15} />,
            node: (
              <>
      <div className="card p-5 mb-5 border-brand-400/25 bg-brand-400/[0.045]">
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <ShieldCheck size={17} /> Connect Codex (recommended)
          </h3>
          <p className="mt-1 text-sm leading-6 text-white/55">
            Never give AI a website username or password. Create a short-lived, revocable credential scoped to this project so AI can only read context and append progress.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_150px_auto]">
          <label className="text-xs text-white/45">
            AI label, recorded in the audit and Git trail
            <input className="input mt-1 w-full" value={agentLabel} onChange={(event) => setAgentLabel(event.target.value)} maxLength={80} />
          </label>
          <label className="text-xs text-white/45">
            Expires after
            <select className="input mt-1 w-full" value={agentDuration} onChange={(event) => setAgentDuration(Number(event.target.value) as 24 | 168)}>
              <option value={24}>24 hours</option>
              <option value={168}>7 days</option>
            </select>
          </label>
          <button className="btn-primary self-end" onClick={createAiAccess} disabled={creatingAgent}>
            <KeyRound size={14} /> {creatingAgent ? 'Creating…' : 'Create AI credential'}
          </button>
        </div>

        {createdAgent && (
          <div className="mt-4 rounded-xl2 border border-amber-200/25 bg-amber-300/[0.08] p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-amber-100">Plaintext is shown only once</div>
                <div className="mt-1 text-xs leading-5 text-white/50">Run the command directly in your terminal. Never paste the command or credential into chat, issues, screenshots, or a repository.</div>
              </div>
              <button className="btn-ghost shrink-0 text-xs" onClick={() => setCreatedAgent(null)}><X size={13} /> I saved it</button>
            </div>
            <div className="mb-3 break-all rounded-lg border border-white/10 bg-black/35 p-3 font-mono text-xs text-white/75">{createdAgent.token}</div>
            <div>
              <div className="rounded-xl2 border border-white/10 bg-black/20 p-3">
                <div className="mb-2 text-xs font-medium text-white/60">Codex</div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-white/50">{mcpCommand()}</pre>
                <button className="btn-soft mt-3 text-xs" onClick={() => copyProjectText(mcpCommand(), 'Codex MCP command copied. Run it in your terminal and never paste it into chat.')}><Copy size={13} /> Copy Codex command</button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl2 border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-xs font-medium text-white/55">AI credentials</div>
            {agentCredentials.length === 0 ? (
              <div className="text-xs text-white/35">No credentials yet.</div>
            ) : (
              <div className="space-y-2">
                {agentCredentials.slice(0, 6).map((credential) => {
                  const expired = new Date(credential.expiresAt).getTime() <= Date.now();
                  return (
                    <div key={credential.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="truncate text-white/65">{credential.label} - {credential.tokenPrefix}</div>
                        <div className="mt-0.5 text-white/30">{credential.status === 'revoked' ? 'Revoked' : expired ? 'Expired' : `Valid until ${new Date(credential.expiresAt).toLocaleString('en-US')}`}</div>
                      </div>
                      {credential.status === 'active' && !expired && <button className="btn-ghost shrink-0 text-xs" onClick={() => revokeAiAccess(credential)}>Revoke</button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="rounded-xl2 border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-xs font-medium text-white/55">Recent AI activity</div>
            {agentAudit.length === 0 ? (
              <div className="text-xs text-white/35">No activity yet.</div>
            ) : (
              <div className="space-y-1.5 text-xs text-white/40">
                {agentAudit.slice(0, 6).map((event) => (
                  <div key={event.id} className="flex justify-between gap-3"><span className="truncate">{event.tokenLabel || 'AI'} - {event.action} - {event.outcome}</span><span className="shrink-0">{new Date(event.at).toLocaleString('en-US')}</span></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legacy project API and key */}
      <div className="card p-5 mb-5 border-cyan-200/15 bg-cyan-300/[0.03]">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80">
              <Link2 size={15} /> Legacy REST access
            </h3>
            <p className="mt-1 text-xs leading-5 text-white/45">
              Retained for existing scripts. New integrations should use the short-lived AI credential with MCP. Never share website credentials.
            </p>
          </div>
          <button className="btn-soft shrink-0 text-xs" onClick={rotateAndCopyProjectKey}>
            <KeyRound size={13} /> Create or rotate legacy key
          </button>
        </div>
        {keyMsg && <div className="mb-3 rounded-xl2 border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">{keyMsg}</div>}
        {oneTimeProjectKey && (
          <div className="mb-3 rounded-xl2 border border-amber-200/25 bg-amber-300/[0.08] p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-amber-100">The complete project key is shown only once</div>
                <div className="mt-1 text-xs leading-5 text-white/45">
                  This Project-Key connects to this project's repository. After refresh, only the prefix remains visible.
                </div>
              </div>
              <button className="btn-ghost shrink-0 text-xs" onClick={() => { setOneTimeProjectKey(''); setOneTimeBootText(''); }}>
                <X size={13} /> I saved it; hide
              </button>
            </div>
            <div className="mb-3 rounded-lg border border-white/10 bg-black/35 p-3 font-mono text-xs text-white/80 break-all">
              {oneTimeProjectKey}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-soft text-xs" onClick={() => copyProjectText(oneTimeProjectKey, 'Complete project key copied.')}>
                <Copy size={13} /> Copy complete key
              </button>
              <button className="btn-soft text-xs" onClick={() => copyProjectText(buildAiBrief(oneTimeProjectKey), 'Legacy REST example copied. Use it only in your trusted terminal and never paste it into AI chat.')}>
                <Copy size={13} /> Copy legacy REST example
              </button>
            </div>
            {oneTimeBootText && (
              <pre className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-black/35 p-3 text-xs leading-6 text-white/65 whitespace-pre-wrap">
                {oneTimeBootText}
              </pre>
            )}
          </div>
        )}
        <div className="grid gap-3 text-xs md:grid-cols-2">
          <div className="rounded-xl2 border border-white/10 bg-black/20 p-3">
            <div className="mb-1 text-white/35">Context URL</div>
            <div className="break-all font-mono text-white/70">{connection?.contextUrl || project.projectContextUrl || `${location.origin}/api/projects/${project.id}/context`}</div>
          </div>
          <div className="rounded-xl2 border border-white/10 bg-black/20 p-3">
            <div className="mb-1 text-white/35">Git repository</div>
            <div className="break-all font-mono text-white/70">{connection?.cloneUrl || project.repoUrl || 'Repository pending'}</div>
          </div>
          <div className="rounded-xl2 border border-white/10 bg-black/20 p-3">
            <div className="mb-1 text-white/35">Project key status</div>
            <div className="font-mono text-white/70">{connection?.projectKeyPrefix || project.projectKeyPrefix || 'Not created'}</div>
          </div>
          <button
            className="rounded-xl2 border border-white/10 bg-white/[0.04] p-3 text-left transition hover:bg-white/[0.07]"
            onClick={() =>
              copyProjectText(
                [
                  `Context URL: ${connection?.contextUrl || project.projectContextUrl || ''}`,
                  `Events URL: ${connection?.eventsUrl || ''}`,
                  `Git: ${connection?.cloneUrl || project.repoUrl || ''}`,
                  'Project-Key: create or rotate the key to receive the complete value once',
                ].join('\n'),
                'Project endpoint details copied.',
              )
            }
          >
            <div className="mb-1 flex items-center gap-1.5 text-white/35">
              <Copy size={13} /> Copy endpoint details
            </div>
            <div className="text-white/60">This does not include a plaintext key and can be shared for handoff planning.</div>
          </button>
        </div>
      </div>
              </>
            ),
          },
          {
            key: 'assign',
            label: 'Assignments',
            icon: <Users size={15} />,
            node: (
              <section className="card p-5">
                <h3 className="mb-2 text-sm font-semibold text-white/75">Phase assignments</h3>
                <p className="text-sm leading-6 text-white/50">
                  This area is reserved for human-reviewed AI phase breakdowns and assignments based on member profiles, project goals, and acceptance criteria.
                </p>
              </section>
            ),
          },
          {
            key: 'blueprint',
            label: 'Blueprint',
            icon: <FileText size={15} />,
            node: (
              <section className="card p-5">
                <h3 className="mb-2 text-sm font-semibold text-white/75">Project blueprint</h3>
                <p className="text-sm leading-6 text-white/50">
                  Architecture, technology choices, repository conventions, and execution standards are organized here to keep the project record focused.
                </p>
              </section>
            ),
          },
          {
            key: 'kickoff',
            label: 'Kickoff Card',
            icon: <ShieldCheck size={15} />,
            node: (
              <>

      {/* Kickoff card */}
      <div className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white/75">Kickoff card</h3>
          {!editing && (
            <button className="btn-soft text-xs" onClick={startEditProject}>
              <Pencil size={13} /> Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3 text-sm">
            <div>
              <label className="label">Project name</label>
              <input className="input" value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Audience</label>
              <input className="input" value={ef.forWhom} onChange={(e) => setEf({ ...ef, forWhom: e.target.value })} />
            </div>
            <div>
              <label className="label">Desired outcome</label>
              <textarea className="input min-h-[70px] resize-y" value={ef.goal} onChange={(e) => setEf({ ...ef, goal: e.target.value })} />
            </div>
            <div>
              <label className="label">Acceptance criteria</label>
              <div className="space-y-2">
                {ef.acceptance.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="input"
                      value={a}
                      onChange={(e) => {
                        const acc = [...ef.acceptance];
                        acc[i] = e.target.value;
                        setEf({ ...ef, acceptance: acc });
                      }}
                    />
                    {ef.acceptance.length > 1 && (
                      <button
                        className="text-white/30 hover:text-rose-300 p-1"
                        onClick={() => setEf({ ...ef, acceptance: ef.acceptance.filter((_, idx) => idx !== i) })}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button className="btn-ghost text-xs mt-2" onClick={() => setEf({ ...ef, acceptance: [...ef.acceptance, ''] })}>
                <Plus size={13} /> Add another
              </button>
            </div>
            <div>
              <label className="label">Out of scope</label>
              <input className="input" value={ef.notDoing} onChange={(e) => setEf({ ...ef, notDoing: e.target.value })} />
            </div>
            <div className="grid gap-3 grid-cols-1">
              <div>
                <label className="label">Owner</label>
                <input className="input" value={ef.ownerName} onChange={(e) => setEf({ ...ef, ownerName: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit}>Save</button>
            </div>
          </div>
        ) : (
          <dl className="space-y-3 text-sm">
            <Field icon={<Target size={15} />} label="Audience and desired outcome">
              <div className="text-white/40">{project.kickoff.forWhom}</div>
              <div className="text-white">{project.kickoff.goal}</div>
            </Field>
            <Field icon={<ShieldCheck size={15} />} label="Acceptance criteria">
              {project.kickoff.acceptance.length ? (
                <ul className="list-disc pl-5 text-white/70 space-y-0.5">
                  {project.kickoff.acceptance.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-white/30">Not provided</span>
              )}
            </Field>
            <Field icon={<Ban size={15} />} label="Out of scope">
              <span className="text-white/70">{project.kickoff.notDoing || '-'}</span>
            </Field>
          </dl>
        )}
      </div>
              </>
            ),
          },
          {
            key: 'log',
            label: 'Progress Trail',
            icon: <GitBranch size={15} />,
            node: (
              <>

      {/* Git-backed progress timeline */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white/75">Progress trail (generated from Git history)</h3>
          <button className="btn-soft text-xs" onClick={() => setLogging((v) => !v)}>
            <Plus size={14} /> Record progress
          </button>
        </div>

        {logging && (
          <div className="rounded-xl2 border border-white/10 bg-white/5 p-4 mb-4 space-y-3">
            <div>
              <label className="label">What was completed? This creates a Git-backed event.</label>
              <input
                className="input"
                placeholder="Example: add handoff checklist"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Update progress to (optional, %)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="input"
                  placeholder={`Current ${project.progress}%`}
                  value={prog}
                  onChange={(e) => setProg(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Next step (optional)</label>
                <input
                  className="input"
                  placeholder="What should happen after this step?"
                  value={nextStepInput}
                  onChange={(e) => setNextStepInput(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setLogging(false)}>
                Cancel
              </button>
              <button
                className="btn-primary disabled:opacity-40"
                disabled={!msg.trim() || saving}
                onClick={submitEvent}
              >
                {saving ? 'Recording…' : 'Record'}
              </button>
            </div>
          </div>
        )}

        {!log ? (
          <Empty text="Loading…" />
        ) : log.length === 0 ? (
          <Empty text="No progress events yet. Connect Codex, complete and verify one step, and the record will appear here." />
        ) : (
          <ol className="relative border-l border-white/10 ml-2 space-y-5">
            {log.map((e) => (
              <li key={e.id} className="ml-4">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.55)]" />
                <div className="flex items-center gap-2 text-xs text-white/30">
                  <span>{new Date(e.at).toLocaleString('en-US')}</span>
                  <span>-</span>
                  <span>{e.actor}</span>
                  {e.keyName && (
                    <span className="inline-flex items-center gap-1 text-white/70">
                      <KeyRound size={11} />
                      {e.keyName}
                    </span>
                  )}
                </div>
                <div className="text-white mt-1 flex items-center gap-2">
                  {e.plainMessage || e.message}
                  <ArrowUpRight size={12} className="text-white/20" />
                </div>
                {e.plainMessage && e.plainMessage !== e.message && (
                  <div className="mt-1 text-xs font-mono text-white/35">Engineering record: {e.message}</div>
                )}
                {(e.why || e.benefit || e.verification || e.nextStep) && (
                  <div className="mt-2 space-y-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-white/50">
                    {e.why && <div><span className="text-white/30">Why: </span>{e.why}</div>}
                    {e.benefit && <div><span className="text-white/30">Benefit: </span>{e.benefit}</div>}
                    {e.verification && <div><span className="text-white/30">Verification note: </span>{e.verification}</div>}
                    {e.nextStep && <div><span className="text-white/30">Next step: </span>{e.nextStep}</div>}
                  </div>
                )}
                {e.progressFrom !== null && e.progressTo !== null && (
                  <div className="text-xs text-emerald-300 mt-0.5">
                    Progress {e.progressFrom}% to {e.progressTo}%
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
              </>
            ),
          },
        ]}
      />

      {/* Destructive action */}
      <div className="mt-6 text-right">
        <button
          className="text-xs text-white/30 hover:text-rose-300 inline-flex items-center gap-1"
          onClick={onDelete}
        >
          <Trash2 size={13} /> Delete project
        </button>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-ink-400 mb-1">
        {icon}
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl2 border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-1 text-xs text-white/35">{label}</div>
      <div className="truncate text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function MiniMeta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl2 border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-white/35">
        {icon}
        <span>{label}</span>
      </div>
      <div className="truncate font-mono text-white/65">{value}</div>
    </div>
  );
}
