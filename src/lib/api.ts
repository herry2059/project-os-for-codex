import type {
  Project,
  ProjectEvent,
  CreateProjectInput,
  KickoffCard,
} from './types';

/**
 * Data access uses the real backend only.
 * Failed requests return an empty state or explicit error instead of simulated success.
 */

// API prefix follows the Vite base: root -> '/api', sub-path -> '<base>/api'.
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, '/');
const apiUrl = (path: string) => `${API_BASE}${path}`;

// ---------------- Real backend request wrapper ----------------

async function tryFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(apiUrl(path), {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...init,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface AuthUser {
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  isSuperAdmin?: boolean;
}
export interface AuthState {
  authenticated: boolean;
  user: AuthUser | null;
  workspace?: {
    id: string;
    name: string;
    status?: string;
    wsPub?: string;
    role?: string;
  } | null;
  authEnabled: boolean;
}

export async function getAuthState(): Promise<AuthState> {
  const real = await tryFetch<AuthState>('/auth/me');
  return real ?? { authenticated: false, user: null, authEnabled: true };
}

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  active: boolean;
  createdAt: string;
}
export async function listUsersApi(): Promise<UserAccount[]> {
  return (await tryFetch<UserAccount[]>('/users')) ?? [];
}
export async function addUserApi(body: {
  username: string;
  password: string;
  displayName?: string;
  role?: 'admin' | 'member';
}): Promise<UserAccount | null> {
  return tryFetch<UserAccount>('/users', { method: 'POST', body: JSON.stringify(body) });
}
export async function updateUserApi(
  id: string,
  body: Partial<{ displayName: string; role: 'admin' | 'member'; active: boolean; password: string }>,
): Promise<UserAccount | null> {
  return tryFetch<UserAccount>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}
export async function deleteUserApi(id: string): Promise<void> {
  await tryFetch(`/users/${id}`, { method: 'DELETE' });
}

export interface KbApiKey {
  id: string;
  name: string;
  ownerName?: string;
  status: 'active' | 'revoked';
  tokenPrefix: string;
  createdAt: string;
  updatedAt?: string;
}
export async function listKbKeysApi(): Promise<KbApiKey[]> {
  return (await tryFetch<KbApiKey[]>('/kb-keys')) ?? [];
}
export async function createKbKeyApi(body: { name: string; ownerName?: string }): Promise<{ key: KbApiKey; token: string } | null> {
  return tryFetch('/kb-keys', { method: 'POST', body: JSON.stringify(body) });
}
export async function revokeKbKeyApi(id: string): Promise<KbApiKey | null> {
  return tryFetch(`/kb-keys/${id}`, { method: 'DELETE' });
}
export async function removeKbKeyApi(id: string): Promise<{ ok: boolean } | null> {
  return tryFetch(`/kb-keys/${id}/destroy`, { method: 'DELETE' });
}

export async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: body?.error || 'Sign-in failed' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not connect to the backend' };
  }
}

export async function logout(): Promise<void> {
  await tryFetch('/auth/logout', { method: 'POST' });
}

export async function listProjects(): Promise<Project[]> {
  return (await tryFetch<Project[]>('/projects')) ?? [];
}

export async function getProject(id: string): Promise<Project | null> {
  return tryFetch<Project>(`/projects/${id}`);
}

export async function getProjectLog(id: string): Promise<ProjectEvent[]> {
  return (await tryFetch<ProjectEvent[]>(`/projects/${id}/log`)) ?? [];
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const real = await tryFetch<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (real) return real;
  throw new Error('The backend is unavailable, so the project was not created');
}

/** Delete a project together with its Git repository. */
export async function deleteProject(id: string): Promise<boolean> {
  const res = await tryFetch<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' });
  return Boolean(res?.ok);
}

export interface ProjectConnection {
  projectId: string;
  projectName: string;
  contextUrl: string;
  eventsUrl: string;
  cloneUrl: string | null;
  projectKeyPrefix: string | null;
  hasProjectKey: boolean;
  createdAt: string | null;
}

export interface AgentCredential {
  id: string;
  workspaceId: string;
  projectId: string;
  label: string;
  scopes: string[];
  status: 'active' | 'revoked';
  tokenPrefix: string;
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt?: string;
}

export interface AgentAuditEvent {
  id: string;
  projectId: string | null;
  tokenId: string | null;
  tokenLabel: string;
  action: string;
  requestId: string | null;
  outcome: string;
  at: string;
}

export interface AgentCredentialCreateResult {
  token: string;
  credential: AgentCredential;
  baseUrl: string;
  projectId: string;
  mcpPackage: string;
}

export async function getProjectConnection(id: string): Promise<ProjectConnection | null> {
  return tryFetch<ProjectConnection>(`/projects/${id}/project-connection`);
}

export async function listAgentCredentials(id: string): Promise<AgentCredential[]> {
  return (await tryFetch<AgentCredential[]>(`/projects/${id}/agent-tokens`)) ?? [];
}

export async function createAgentCredential(
  id: string,
  body: { label: string; expiresInHours: 24 | 168 },
): Promise<AgentCredentialCreateResult | null> {
  return tryFetch<AgentCredentialCreateResult>(`/projects/${id}/agent-tokens`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function revokeAgentCredential(id: string, tokenId: string): Promise<boolean> {
  const result = await tryFetch<{ ok: boolean }>(`/projects/${id}/agent-tokens/${tokenId}`, { method: 'DELETE' });
  return Boolean(result?.ok);
}

export async function listAgentAudit(id: string): Promise<AgentAuditEvent[]> {
  return (await tryFetch<AgentAuditEvent[]>(`/projects/${id}/agent-audit`)) ?? [];
}

export async function rotateProjectKey(id: string): Promise<{
  ok: boolean;
  project: Project;
  connection: ProjectConnection;
  projectKey: string;
  bootText: string;
} | null> {
  return tryFetch(`/projects/${id}/project-key/rotate`, { method: 'POST' });
}

/** My next step across all projects. */
export async function getMyNextSteps(): Promise<
  Array<{ project: Project; nextStep: string }>
> {
  const projects = await listProjects();
  return projects
    .filter((p) => p.status === 'active' && p.nextStep)
    .map((p) => ({ project: p, nextStep: p.nextStep as string }));
}

export function emptyKickoff(): KickoffCard {
  return { forWhom: '', goal: '', acceptance: [''], notDoing: '' };
}

/** Record a human progress event and create a corresponding Git commit. */
export async function postEvent(
  id: string,
  body: {
    message: string;
    actor?: string;
    progressFrom?: number | null;
    progressTo?: number | null;
    nextStep?: string;
  },
): Promise<{ ok: boolean; project: Project } | null> {
  return tryFetch(`/projects/${id}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------- Handoff workflow ----------------

export interface KeyInfo {
  name: string;
  ownerName: string;
  projectId: string | null;
  status: string;
  usageLimit?: number | null;
  keyPrefix?: string;
  slug?: string;
  endpoint?: string;
  lastUsedAt?: string;
}
export interface HandoffPreview {
  package: string;
  bootPrompt: string;
  cloneUrl: string;
}
export interface HandoffResult extends HandoffPreview {
  ok: boolean;
  project: Project;
}

export async function listKeys(): Promise<KeyInfo[]> {
  return (await tryFetch<KeyInfo[]>('/keys')) ?? [];
}

/** Preview the handoff package. Returns null when the backend is unavailable. */
export async function getHandoffPackage(id: string): Promise<HandoffPreview | null> {
  return tryFetch<HandoffPreview>(`/projects/${id}/handoff-package`);
}

/** Execute a handoff: change owner, create HANDOFF.md, and append an audit event. */
export async function handoffProject(
  id: string,
  body: { toKeyName?: string; toOwnerName?: string; note?: string },
): Promise<HandoffResult | null> {
  return tryFetch<HandoffResult>(`/projects/${id}/handoff`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------- Knowledge base ----------------

export interface KnowledgeItem {
  id: string;
  type: string; // risk | lesson | experience | principle | method | session
  title: string;
  body: string;
  tags: string[];
  businessLine: string;
  source: string;
  projectId?: string;
  ref?: string;
  aiTitle?: string;
  aiSummary?: string;
  aiDetail?: string;
  organizedAt?: string;
  organizeStatus?: 'done' | 'error' | string;
  organizeError?: string;
  organizeTriedAt?: string;
  visibility?: 'public' | 'internal';
  status?: 'draft' | 'review' | 'published';
  ownerName?: string;
  updatedAt?: string;
  createdAt: string;
}

export async function listKnowledge(params?: {
  q?: string;
  type?: string;
  businessLine?: string;
}): Promise<KnowledgeItem[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.type) qs.set('type', params.type);
  if (params?.businessLine) qs.set('businessLine', params.businessLine);
  return (await tryFetch<KnowledgeItem[]>(`/knowledge?${qs.toString()}`)) ?? [];
}

export interface KnowledgeOrganizeStatus {
  total: number;
  organized: number;
  pending: number;
  failed: number;
  running: boolean;
  scheduled: boolean;
  lastRunAt?: string | null;
}

export async function getKnowledgeOrganizeStatus(): Promise<KnowledgeOrganizeStatus | null> {
  return tryFetch('/knowledge/organize-status');
}

export async function exportKnowledgePdf(body: {
  q?: string;
  type?: string;
  businessLine?: string;
  ids?: string[];
  visibility?: 'public' | 'internal';
  status?: 'draft' | 'review' | 'published';
  title?: string;
}): Promise<{ ok: true; blob: Blob; filename: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(apiUrl('/knowledge/export'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { ok: false, error: data?.error || 'Export failed' };
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const match = cd.match(/filename\*=UTF-8''([^;]+)/);
    const filename = match ? decodeURIComponent(match[1]) : 'workspace-knowledge.pdf';
    return { ok: true, blob, filename };
  } catch {
    return { ok: false, error: 'Could not connect to the backend' };
  }
}

export async function assistProjectDraft(
  field: string,
  draft: unknown,
): Promise<{ text: string; items: string[] } | null> {
  return tryFetch('/ai/assist', {
    method: 'POST',
    body: JSON.stringify({ field, draft }),
  });
}

/** Surface related risks when a project begins. */
export async function matchKnowledge(text: string): Promise<KnowledgeItem[]> {
  if (!text.trim()) return [];
  return (
    (await tryFetch<KnowledgeItem[]>(
      `/knowledge/match?text=${encodeURIComponent(text)}`,
    )) ?? []
  );
}

export interface RetroAnswers {
  uncertainties: string[];
  omissions: string[];
  failureRisks: string[];
  leadingFeatures: string[];
  betterWays: string[];
  wins: string[];
  pitfalls: string[];
  improvements: string[];
}

export async function draftRetro(id: string): Promise<{ draft: RetroAnswers } | null> {
  return tryFetch(`/projects/${id}/retro/ai-draft`, { method: 'POST' });
}

export async function getRetroSummary(id: string): Promise<{ summary: string } | null> {
  return tryFetch(`/projects/${id}/retro-summary`);
}

/** Project retrospective that adds lessons learned to the knowledge base. */
export async function retroProject(
  id: string,
  body: RetroAnswers,
): Promise<{ ok: boolean; project: Project; created: KnowledgeItem[] } | null> {
  return tryFetch(`/projects/${id}/retro`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Edit the project name, kickoff card, owner, or next step. */
export async function updateProject(
  id: string,
  body: { name?: string; kickoff?: KickoffCard; ownerName?: string | null; nextStep?: string | null },
): Promise<Project | null> {
  return tryFetch<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}
