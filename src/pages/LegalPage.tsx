import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, FileText, Lock, AlertTriangle } from 'lucide-react';
import Tabs from '@/components/Tabs';

/**
 * Generic privacy, terms, and disclaimer templates.
 * A hosted operator must obtain legal review and replace the placeholders before production use.
 */
export const LEGAL_VERSION = '2026-07-10';
const COMPANY = 'the project operator';

function Art({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 text-sm font-semibold text-white">{n} {title}</h3>
      <div className="space-y-2 text-[13px] leading-7 text-white/65">{children}</div>
    </div>
  );
}

function Privacy() {
  return (
    <section className="card p-6">
      <p className="mb-4 text-[13px] leading-7 text-white/65">
        {COMPANY} values personal information and workspace data protection. This template explains what data the service may process, how it is used, and which safeguards operators should configure before production use. Please adapt it with legal counsel before offering a hosted service.
      </p>
      <Art n="1." title="Information processed">
        <p>Account data may include email, display name, securely stored credentials, workspace names, and invitation relationships.</p>
        <p>Workspace data may include projects, progress events, HANDOFF.md files, knowledge entries, and collaboration content.</p>
        <p>Security and operations data may include IP address, device and browser details, audit logs, AI feature calls, and usage metrics.</p>
        <p>The default open-source edition does not include payments, subscriptions, or billing.</p>
      </Art>
      <Art n="2." title="How information is used">
        <p>Information is used to operate the service, authenticate users, isolate workspace data, protect against abuse, troubleshoot faults, improve reliability, and meet legal obligations. It must not be used for unrelated purposes.</p>
      </Art>
      <Art n="3." title="Cookies">
        <p>Necessary session cookies maintain authentication and security. Disabling them may prevent parts of the service from working.</p>
      </Art>
      <Art n="4." title="Storage and safeguards">
        <p>Operators must document storage regions and retention periods, then delete or anonymize data when it is no longer required.</p>
        <p>Reasonable safeguards include encryption, access controls, least privilege, audit trails, tested backups, and incident response.</p>
      </Art>
      <Art n="5." title="Workspace isolation">
        <p>Projects, knowledge, credentials, memberships, and related data must be strictly isolated by workspaceId and inaccessible from other workspaces.</p>
      </Art>
      <Art n="6." title="Sharing and third-party services">
        <p>Personal information must not be sold. Sharing should be limited to consented uses, contracted service providers, or valid legal requirements.</p>
        <p>When users connect their own AI, Git, or knowledge services, those services are controlled by their respective operators and terms.</p>
      </Art>
      <Art n="7." title="Your choices and rights">
        <p>Depending on applicable law, users may request access, correction, deletion, export, consent withdrawal, or account closure. Operators must publish a contact method and response process.</p>
      </Art>
      <Art n="8." title="Children">
        <p>This project is intended for professional and organizational use and is not directed to children. A hosted operator must apply the age and parental-consent rules of its jurisdiction.</p>
      </Art>
      <Art n="9." title="Policy changes">
        <p>Material changes should be announced clearly. Operators should keep dated versions and explain when a revised policy takes effect.</p>
      </Art>
      <Art n="10." title="Contact">
        <p>Questions, complaints, or requests should be sent through the contact method published by the deployment operator or project maintainer.</p>
      </Art>
    </section>
  );
}

function Terms() {
  return (
    <section className="card p-6">
      <p className="mb-4 text-[13px] leading-7 text-white/65">
        This agreement is a public template for running Project OS for Codex. Replace it with your own operator, jurisdiction, payment, support, and data-processing terms before production use.
      </p>
      <Art n="1." title="Definitions">
        <p>A workspace is an isolated unit of members and data. A member is a user admitted to a workspace. Bring-your-own services are AI, Git, or knowledge systems configured by the user.</p>
      </Art>
      <Art n="2." title="Acceptance and changes">
        <p>Using a hosted deployment means accepting its published terms. Material revisions should be announced before they take effect.</p>
      </Art>
      <Art n="3." title="Accounts and security">
        <p>Users must provide accurate account information and protect passwords and credentials. Registration may require an invitation and administrator approval.</p>
        <p>Workspace owners may invite, approve, or remove members. Roles and permissions are independent in each workspace.</p>
      </Art>
      <Art n="4." title="Service scope">
        <p>The project provides project kickoff, progress tracking, Git-backed audit events, structured handoffs, AI assistance, and a workspace knowledge base. The default open-source edition has no billing, CRM, or platform-operations modules.</p>
      </Art>
      <Art n="5." title="Acceptable use">
        <p>Users must comply with applicable law, intellectual-property rights, and security rules. Malicious access, unauthorized scraping, credential abuse, and resource abuse are prohibited.</p>
      </Art>
      <Art n="6." title="Content and intellectual property">
        <p>Users retain the rights they hold in uploaded content. A hosted operator receives only the limited permission needed to operate and secure the service.</p>
        <p>Project code and documentation are licensed under their published open-source licenses. Third-party marks remain the property of their owners.</p>
      </Art>
      <Art n="7." title="AI-assisted features">
        <p>AI output may be inaccurate, incomplete, or unsuitable. Users must review it before relying on it, especially for professional or high-risk decisions.</p>
        <p>Availability and compliance of connected AI, Git, and knowledge services remain the responsibility of their operators and deployers.</p>
      </Art>
      <Art n="8." title="License and costs">
        <p>The default open-source edition is provided under Apache-2.0. Users are responsible for their own hosting and third-party service costs.</p>
      </Art>
      <Art n="9." title="Data security and backups">
        <p>No system can guarantee uninterrupted service or zero data loss. Deployers should maintain tested backups and users should retain independent copies of critical data.</p>
      </Art>
      <Art n="10." title="Suspension and termination">
        <p>A hosted operator may restrict or terminate accounts that violate applicable law, published terms, system security, or the rights of others. Account closure and data handling must follow the published privacy policy.</p>
      </Art>
      <Art n="11." title="Warranty and liability">
        <p>The software is provided under the warranties and liability limits in its open-source license. Hosted operators must publish terms appropriate to their jurisdiction and service.</p>
      </Art>
      <Art n="12." title="Governing terms">
        <p>A deployment operator must identify the governing law, dispute process, notice methods, and severability rules that apply to its service.</p>
      </Art>
    </section>
  );
}

function Disclaimer() {
  return (
    <section className="card p-6">
      <Art n="1." title="AI-generated content">
        <p>AI output may contain errors, omissions, or unsuitable recommendations. It is not legal, financial, tax, medical, or other professional advice. Review and verify every output before use.</p>
      </Art>
      <Art n="2." title="Third-party and bring-your-own services">
        <p>Availability, security, and compliance of connected AI, Git, and knowledge services are governed by their providers and the deployer's configuration.</p>
      </Art>
      <Art n="3." title="Operational risk">
        <p>Service may be disrupted by network failures, attacks, provider outages, disasters, or other events beyond reasonable control.</p>
      </Art>
      <Art n="4." title="User responsibility">
        <p>Users are responsible for protecting accounts and credentials, ensuring uploaded content is lawful, reviewing AI output, and maintaining appropriate backups.</p>
      </Art>
      <Art n="5." title="Liability limits">
        <p>The open-source software is provided under the warranty and liability limits of the Apache-2.0 license. Hosted services require their own reviewed terms.</p>
      </Art>
    </section>
  );
}

export default function LegalPage() {
  return (
    <div className="relative min-h-full overflow-y-auto bg-[#020203] text-white">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <div className="mb-5 flex items-center gap-3">
          <ShieldCheck size={20} className="text-cyan-100" />
          <h1 className="text-xl font-semibold">Project OS for Codex - Legal Templates</h1>
          <span className="ml-auto text-xs text-white/30">Version {LEGAL_VERSION}</span>
        </div>

        <Tabs
          items={[
            { key: 'privacy', label: 'Privacy Policy', icon: <Lock size={15} />, node: <Privacy /> },
            { key: 'terms', label: 'Terms of Service', icon: <FileText size={15} />, node: <Terms /> },
            { key: 'disclaimer', label: 'Disclaimer', icon: <AlertTriangle size={15} />, node: <Disclaimer /> },
          ]}
        />

        <div className="mt-6">
          <Link to="/" className="btn-soft">
            <ArrowLeft size={14} /> Back
          </Link>
        </div>
      </div>
    </div>
  );
}
