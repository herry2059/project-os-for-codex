import { KeyRound, GitBranch, BookOpen, ShieldAlert, Compass, UserCircle2, Bot } from 'lucide-react';
import Tabs from '@/components/Tabs';

/** Organizes the operating guide into short, focused tabs. */
export default function GuidePage() {
  return (
    <div className="max-w-3xl">
      <p className="mb-5 text-sm text-ink-500">
        Learn how the system works, how each credential is scoped, and how projects leave durable records that another human or AI can continue.
      </p>

      <Tabs
        items={[
          { key: 'how', label: 'How It Works', icon: <GitBranch size={15} />, node: <HowItWorks /> },
          { key: 'agent', label: 'Connect AI', icon: <Bot size={15} />, node: <AgentAccess /> },
          { key: 'keys', label: 'Credentials', icon: <KeyRound size={15} />, node: <Keys /> },
          { key: 'spec', label: 'Project Standard', icon: <Compass size={15} />, node: <Spec /> },
          { key: 'profile-import', label: 'Profile Import', icon: <UserCircle2 size={15} />, node: <ProfileImport /> },
          { key: 'retro', label: 'Retrospective', icon: <BookOpen size={15} />, node: <Retro /> },
          { key: 'redline', label: 'AI Guardrails', icon: <ShieldAlert size={15} />, node: <Redline /> },
        ]}
      />
    </div>
  );
}

function HowItWorks() {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-white">
        <GitBranch size={18} /> How Project OS works with AI, Git, and scoped credentials
      </h2>
      <ol className="space-y-2.5 text-sm text-ink-700">
        <li><b>1. Create a project.</b> Complete a kickoff card. The system creates a Git record with PROJECT.md, AGENTS.md, PROGRESS.md, ISSUES/, and HANDOFF.md.</li>
        <li><b>2. Give Codex a short-lived credential.</b> Create a 24-hour or 7-day credential from the Access tab, then connect Codex through MCP. Codex never needs your website password and can access only that project.</li>
        <li><b>3. Record work explicitly.</b> After a checked human or AI step, submit a progress event. The system writes an audit event and a project-record Git commit with the actor, result, verification note, and progress change.</li>
        <li><b>4. See the portfolio.</b> The dashboard shows project health, current progress, the next action, and clear blockers.</li>
        <li><b>5. Hand off safely.</b> Create a separate credential for the next AI or maintainer. They read HANDOFF.md and the repository context, while the old credential can be revoked immediately.</li>
      </ol>
      <div className="mt-3 rounded-xl2 border border-white/10 bg-white/5 p-3 text-xs text-ink-500">
        Each project endpoint maps to that project's own Git record repository. Teams can add risks and lessons to <code className="text-brand-400">ISSUES/</code> so the next maintainer can continue from durable context instead of reconstructing it from chat history.
      </div>
    </section>
  );
}

function AgentAccess() {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-white"><Bot size={18} /> Connect Codex</h2>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-700">
        <li>Open the Access tab in a project record.</li>
        <li>Name the AI, choose 24 hours or 7 days, and create a short-lived credential.</li>
        <li>Run the generated Codex MCP command in your own terminal. Never paste the credential into chat.</li>
        <li>Ask the AI to call <code className="text-brand-400">project_os_get_context</code> before starting from the recorded next step.</li>
        <li>After completing and verifying one slice, call <code className="text-brand-400">project_os_append_progress</code> to update the web view and Git trail together.</li>
      </ol>
      <div className="mt-4 rounded-xl2 border border-amber-200/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
        Never give an AI your website account or password. A human must still confirm deletion, permissions, credential changes, releases, and deployments.
      </div>
      <a className="btn-soft mt-4 inline-flex text-xs" href="https://github.com/herry2059/project-os-for-codex/blob/main/docs/CODEX_SETUP.md" target="_blank" rel="noreferrer">Read the complete setup guide</a>
    </section>
  );
}

function Keys() {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-white">
        <KeyRound size={18} /> Credential types and boundaries
      </h2>
      <div className="mb-4 grid gap-3 text-xs md:grid-cols-3">
        <RelationCard
          title="AI service connection"
          where="Server environment"
          base="PROJECT_OS_AI_BASE + PROJECT_OS_AI_KEY"
          can="Run assisted tasks through your compatible AI service"
          cannot="Cannot read project records or cross workspaces"
        />
        <RelationCard
          title="Short-lived AI credential + MCP"
          where="Project record"
          base="/api/agent/v1 + MCP"
          can="Read one project and append idempotent progress"
          cannot="Cannot call the AI service or access another project"
        />
        <RelationCard
          title="Knowledge connection"
          where="Settings for this workspace"
          base="Displayed once after key creation"
          can="Read and write workspace knowledge, FAQs, and search"
          cannot="Cannot call AI, read project Git, or cross workspaces"
        />
      </div>
      <div className="space-y-4 text-sm">
        <div className="rounded-xl2 border border-white/10 bg-white/5 p-4">
          <div className="mb-1 font-medium text-white">1. AI service key, configured by the deployer</div>
          <div className="mb-2 text-ink-600">Used for kickoff guidance, knowledge summaries, and retrospective drafts. The open-source edition connects to your own OpenAI-compatible service through server environment variables.</div>
          <div className="space-y-1 text-xs text-ink-500">
            <div>Configure <code className="text-brand-400">PROJECT_OS_AI_BASE</code>, <code className="text-brand-400">PROJECT_OS_AI_KEY</code>, and the model name on the server only.</div>
            <div>The secret never enters the browser, repository, or handoff package.</div>
          </div>
        </div>
        <div className="rounded-xl2 border border-white/10 bg-white/5 p-4">
          <div className="mb-1 font-medium text-white">2. Short-lived AI credential for one project</div>
          <div className="mb-2 text-ink-600">Allows Codex to read one project and append progress. Create it from Project Record / Access; each credential expires and can be revoked independently.</div>
          <div className="space-y-1 text-xs">
            <div>Endpoint format: <code className="text-brand-400">.../api/agent/v1/projects/:projectId/context</code></div>
            <div className="text-ink-500">Run the generated MCP command in your terminal instead of pasting the credential into AI chat.</div>
          </div>
        </div>
        <div className="rounded-xl2 border border-white/10 bg-white/5 p-4">
          <div className="mb-1 font-medium text-white">3. Workspace knowledge key</div>
          <div className="mb-2 text-ink-600">Authorizes a tool to access the active workspace knowledge base. Generate it in Settings; writes land as drafts and require human review before publication.</div>
        </div>
        <div className="text-xs text-ink-400">
          Plaintext credentials are shown only for copying and are never displayed again. Creation, copying, and revocation are audited with actor, time, and target.
        </div>
      </div>
    </section>
  );
}

function Spec() {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-white">
        <BookOpen size={18} /> A practical project standard refined through real delivery work
      </h2>
      <ul className="space-y-2 text-sm text-ink-700">
        <li><b>Five delivery stages:</b> diagnose, design, build, hand off, and improve.</li>
        <li><b>Kickoff card:</b> define what changes, the expected outcome, acceptance criteria, and what is out of scope.</li>
        <li><b>One screen, one action:</b> every view points to a clear next step instead of presenting an intimidating wall of fields.</li>
        <li><b>One vertical slice at a time:</b> deliver and accept one complete slice before starting the next.</li>
        <li><b>Done means usable in the real environment,</b> not merely working on a developer machine.</li>
        <li><b>Automatic evidence:</b> AI work creates a Git-backed audit event instead of relying on a manually updated progress report.</li>
      </ul>
    </section>
  );
}

function ProfileImport() {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-white">
        <UserCircle2 size={18} /> Let your own AI draft a member profile
      </h2>
      <div className="space-y-3 text-sm text-ink-700">
        <p>
          A member can enter a profile manually or ask a local AI to extract structured skills from their own resume, work files, Git history, and portfolio. Import creates a draft and never overwrites the confirmed profile without the member's approval.
        </p>
        <div className="rounded-xl2 border border-white/10 bg-white/[0.04] p-3 text-xs">
          <div className="mb-1 text-white/50">Endpoints</div>
          <code className="block break-all text-brand-400">POST /api/profile/import</code>
          <code className="mt-1 block break-all text-brand-400">POST /api/profile/import/apply</code>
        </div>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Use a local AI to read the source material and output only structured results.</li>
          <li>Follow the schema for role, level, skills, domains, team tendency, responsibilities, boundaries, authority, capacity, and portfolio links.</li>
          <li>Upload the draft through <code className="text-brand-400">/profile/import</code>.</li>
          <li>Review it personally, then confirm in the UI or call <code className="text-brand-400">/profile/import/apply</code>.</li>
        </ol>
        <div className="rounded-xl2 border border-amber-200/20 bg-amber-300/10 p-3 text-xs text-amber-100">
          Do not upload identity documents, payment details, customer data, credentials, or raw chat transcripts. Import only the structured capability profile.
        </div>
      </div>
    </section>
  );
}

function Retro() {
  return (
    <section className="card p-5">
      <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-white">
        <BookOpen size={18} /> Project retrospective
      </h2>
      <p className="mb-3 text-sm text-ink-600">
        At project close, AI can read the project's recorded trail and project files to draft RETROSPECTIVE.md. A human reviews it before useful lessons enter the workspace knowledge base.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-700">
        <li>What remains uncertain or insufficiently understood?</li>
        <li>What did we overlook, including risks we did not notice at first?</li>
        <li>If this result fails in three months, what is the most likely reason?</li>
        <li>Which one industry-leading capability would create the most value?</li>
        <li>Which different choices would make the next delivery more efficient?</li>
        <li>What worked, what failed, and what method should change next time?</li>
      </ol>
    </section>
  );
}

function Redline() {
  return (
    <section className="card border-amber-200/20 p-5">
      <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-amber-100">
        <ShieldAlert size={18} /> Non-negotiable AI guardrails
      </h2>
      <p className="text-sm text-ink-700">
        AI may suggest, organize, draft, and remind, but it <b>cannot approve payments, permission changes, deletion, releases, deployments, or reveal complete secrets</b>. Never give AI a website password. For destructive work: stop, back up, obtain human approval, then proceed.
      </p>
    </section>
  );
}

function RelationCard({ title, where, base, can, cannot }: { title: string; where: string; base: string; can: string; cannot: string }) {
  return (
    <div className="rounded-xl2 border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-1 font-medium text-white">{title}</div>
      <div className="mb-2 text-white/35">Managed in: {where}</div>
      <code className="block break-all text-brand-400">{base}</code>
      <div className="mt-2 text-white/55">Can: {can}</div>
      <div className="mt-1 text-white/35">Cannot: {cannot}</div>
    </div>
  );
}
