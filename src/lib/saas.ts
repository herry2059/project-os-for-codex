/**
 * Workspace API layer kept separate from api.ts to reduce conflicts with parallel work.
 * Backend contract (Codex): every request uses the current user and workspace context,
 * with strict workspaceId data isolation. Unavailable endpoints return empty values or null.
 */

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, '/');

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { credentials: 'same-origin' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
async function send<T>(path: string, method: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface Workspace {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'suspended';
  current?: boolean;
}

export interface WorkspaceMember {
  userId: string;
  displayName: string;
  email?: string;
  role: 'owner' | 'admin' | 'member';
  remark?: string; // Workspace-only note set by the member or an administrator.
  self?: boolean;  // Whether this is the signed-in user.
}

export interface WorkspaceConnections {
  kb: { baseUrl: string; legacyBaseUrl?: string | null };
}

/** All workspaces the current user has joined. */
export async function myWorkspaces(): Promise<Workspace[]> {
  return (await get<Workspace[]>('/workspaces')) ?? [];
}
/** Current workspace. */
export async function currentWorkspace(): Promise<Workspace | null> {
  return get<Workspace>('/workspaces/current');
}
/** Public endpoint configuration supplied by the backend for the current workspace. */
export async function workspaceConnections(): Promise<WorkspaceConnections | null> {
  return get<WorkspaceConnections>('/workspaces/current/connections');
}
/** Switch the current workspace. */
export async function switchWorkspace(id: string): Promise<boolean> {
  const r = await send<{ ok: boolean }>('/workspaces/switch', 'POST', { id });
  return Boolean(r?.ok);
}
/** Create a workspace. */
export async function createWorkspace(name: string): Promise<Workspace | null> {
  return send<Workspace>('/workspaces', 'POST', { name });
}
/** Members of the current workspace. */
export async function workspaceMembers(): Promise<WorkspaceMember[]> {
  return (await get<WorkspaceMember[]>('/workspaces/current/members')) ?? [];
}
/** Remove a member; owner or admin only. */
export async function removeMember(userId: string): Promise<boolean> {
  const r = await send<{ ok: boolean }>(`/workspaces/current/members/${userId}`, 'DELETE');
  return Boolean(r?.ok);
}
/** Set a member note. Members can edit their own; owners and admins can edit others. */
export async function setMemberRemark(userId: string, remark: string): Promise<boolean> {
  const r = await send<{ ok: boolean }>(`/workspaces/current/members/${userId}/remark`, 'POST', { remark });
  return Boolean(r?.ok);
}

export interface JoinRequest {
  id: string;
  userId: string;
  displayName: string;
  email?: string;
  createdAt: string;
}
/** Pending workspace join requests; owner or admin only. */
export async function joinRequests(): Promise<JoinRequest[]> {
  return (await get<JoinRequest[]>('/workspaces/current/requests')) ?? [];
}
/** Approve or reject a join request. */
export async function reviewJoinRequest(requestId: string, approve: boolean): Promise<boolean> {
  const r = await send<{ ok: boolean }>(`/workspaces/current/requests/${requestId}/review`, 'POST', { approve });
  return Boolean(r?.ok);
}
/** Invite code and link for the current workspace. */
export async function workspaceInvite(): Promise<{ code: string; url: string } | null> {
  return get<{ code: string; url: string }>('/workspaces/current/invite');
}
/** Rotate the invite code. */
export async function rotateWorkspaceInvite(): Promise<{ code: string; url: string } | null> {
  return send<{ code: string; url: string }>('/workspaces/current/invite/rotate', 'POST');
}

/** Member profile used for AI work allocation, informed by SFIA, O*NET, and Belbin. */
export type TeamRole = 'action' | 'people' | 'thought';
export interface ProfileSkill {
  name: string;
  level: number;
  kind: 'technical' | 'essential';
  evidence?: string;
}
export interface MemberProfile {
  role?: string;          // Job or role.
  seniority?: number;     // Responsibility level 1-5, from beginner to standards-setting expert.
  skills?: ProfileSkill[]; // Skills with proficiency and category.
  domains?: string[];     // Industry or domain experience.
  teamRole?: TeamRole;    // Belbin-inspired tendency: action, people, or thought.
  responsibilities?: string; // Scope of responsibility.
  boundaries?: string;    // Explicitly excluded responsibilities.
  authority?: string;     // Decision-making authority.
  capacity?: string;      // Available capacity, such as hours per week.
  portfolio?: string[];   // Portfolio or evidence links.
  bio?: string;           // One-line introduction.
  completeness?: number;  // Completeness from 0-100.
  autoNote?: string;      // System-generated note based on task history.
  importDraft?: MemberProfile | null; // AI-generated draft awaiting confirmation.
}
/** Current user's profile in the active workspace. */
export async function myProfile(): Promise<MemberProfile | null> {
  return get<MemberProfile>('/profile/me');
}
/** Save the current user's profile. */
export async function saveProfile(p: MemberProfile): Promise<boolean> {
  const r = await send<{ ok: boolean }>('/profile/me', 'PUT', p);
  return Boolean(r?.ok);
}
/** Upload an AI-generated profile draft without overwriting the confirmed profile. */
export async function importProfileDraft(profile: MemberProfile, sourceName = 'AI-generated profile'): Promise<{ draft: MemberProfile; requiresConfirmation: boolean } | null> {
  return send<{ draft: MemberProfile; requiresConfirmation: boolean }>('/profile/import', 'POST', { profile, sourceName });
}
/** Apply the confirmed AI-generated profile draft. */
export async function applyProfileImport(): Promise<boolean> {
  const r = await send<{ ok: boolean }>('/profile/import/apply', 'POST');
  return Boolean(r?.ok);
}
