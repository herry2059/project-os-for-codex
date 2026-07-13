import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root directory for persisted data. Override with PROJECT_OS_DATA_DIR and mount it on durable storage. */
export const DATA_DIR =
  process.env.PROJECT_OS_DATA_DIR || path.join(__dirname, 'data');
/** Directory that stores project Git repositories. */
export const REPOS_DIR = path.join(DATA_DIR, 'repos');

const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const KB_KEYS_FILE = path.join(DATA_DIR, 'kb_keys.json');
const KNOWLEDGE_VECTORS_FILE = path.join(DATA_DIR, 'knowledge_vectors.json');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'knowledge.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const WORKSPACES_FILE = path.join(DATA_DIR, 'workspaces.json');
const MEMBERSHIPS_FILE = path.join(DATA_DIR, 'memberships.json');
const WORKSPACE_JOIN_REQUESTS_FILE = path.join(DATA_DIR, 'workspace_join_requests.json');
const AGENT_TOKENS_FILE = path.join(DATA_DIR, 'agent_tokens.json');
const AGENT_AUDIT_FILE = path.join(DATA_DIR, 'agent_audit.json');
const AGENT_IDEMPOTENCY_FILE = path.join(DATA_DIR, 'agent_idempotency.json');
export const DEFAULT_WORKSPACE_ID = 'ws_default';

function ensure() {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  if (!fs.existsSync(PROJECTS_FILE)) fs.writeFileSync(PROJECTS_FILE, '[]');
  if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, '[]');
  if (!fs.existsSync(KB_KEYS_FILE)) fs.writeFileSync(KB_KEYS_FILE, '[]');
  if (!fs.existsSync(KNOWLEDGE_VECTORS_FILE)) fs.writeFileSync(KNOWLEDGE_VECTORS_FILE, '{}');
  if (!fs.existsSync(KNOWLEDGE_FILE)) fs.writeFileSync(KNOWLEDGE_FILE, '[]');
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
  if (!fs.existsSync(WORKSPACES_FILE)) fs.writeFileSync(WORKSPACES_FILE, '[]');
  if (!fs.existsSync(MEMBERSHIPS_FILE)) fs.writeFileSync(MEMBERSHIPS_FILE, '[]');
  if (!fs.existsSync(WORKSPACE_JOIN_REQUESTS_FILE)) fs.writeFileSync(WORKSPACE_JOIN_REQUESTS_FILE, '[]');
  if (!fs.existsSync(AGENT_TOKENS_FILE)) fs.writeFileSync(AGENT_TOKENS_FILE, '[]');
  if (!fs.existsSync(AGENT_AUDIT_FILE)) fs.writeFileSync(AGENT_AUDIT_FILE, '[]');
  if (!fs.existsSync(AGENT_IDEMPOTENCY_FILE)) fs.writeFileSync(AGENT_IDEMPOTENCY_FILE, '[]');
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newProjectSecret() {
  return `pkey_${crypto.randomBytes(24).toString('base64url')}`;
}

export function hashProjectSecret(secret) {
  return crypto.createHash('sha256').update(String(secret || '')).digest('hex');
}

export function verifyProjectSecret(project, secret) {
  if (!project?.projectKeyHash || !secret) return false;
  const expected = Buffer.from(String(project.projectKeyHash));
  const actual = Buffer.from(hashProjectSecret(secret));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function inviteCode() {
  return `HY${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function publicWorkspaceId() {
  return `w_${crypto.randomBytes(9).toString('base64url')}`;
}

function stamp() {
  return new Date().toISOString();
}

// ---------------- Projects ----------------

export function listProjects() {
  ensure();
  return readJson(PROJECTS_FILE, []);
}
export function getProject(id) {
  return listProjects().find((p) => p.id === id) || null;
}
export function saveProject(project) {
  ensure();
  const all = listProjects();
  const idx = all.findIndex((p) => p.id === project.id);
  if (idx >= 0) all[idx] = project;
  else all.unshift(project);
  writeJson(PROJECTS_FILE, all);
  return project;
}

export function saveProjects(projects) {
  ensure();
  writeJson(PROJECTS_FILE, projects);
  return projects;
}
export function removeProject(id) {
  ensure();
  writeJson(
    PROJECTS_FILE,
    listProjects().filter((p) => p.id !== id),
  );
  return true;
}

// ---------------- Agent keys ----------------
// Open-source builds use a local metadata file only. Production key providers
// should be implemented as private adapters outside this repository.

export function listKeys() {
  ensure();
  return readJson(KEYS_FILE, []);
}
function keyWorkspaceId(key) {
  return key?.workspaceId || DEFAULT_WORKSPACE_ID;
}

export function findKey(name, workspaceId = DEFAULT_WORKSPACE_ID) {
  return (
    listKeys().find(
      (k) => k.name === name && k.status === 'active' && keyWorkspaceId(k) === workspaceId,
    ) || null
  );
}
export function saveKeys(keys) {
  ensure();
  writeJson(KEYS_FILE, keys);
}

/**
 * Switch a project's key binding to newKeyName.
 * The previous binding is removed before the new key is attached, which keeps handoffs atomic.
 */
export function setProjectKey(projectId, newKeyName, workspaceId = DEFAULT_WORKSPACE_ID) {
  const keys = listKeys();
  const selected = newKeyName
    ? keys.find(
        (k) =>
          k.name === newKeyName &&
          k.status === 'active' &&
          keyWorkspaceId(k) === workspaceId,
      )
    : null;
  if (newKeyName && !selected) return null;
  for (const k of keys) {
    if (keyWorkspaceId(k) !== workspaceId) continue;
    if (k.projectId === projectId) k.projectId = null;
    if (selected && k === selected) k.projectId = projectId;
  }
  saveKeys(keys);
  return selected;
}

// ---------------- Utilities ----------------

// ---------------- Knowledge base ----------------
// Entry: { id, type, title, body, tags,
//        businessLine, source, projectId?, ref?, createdAt }

export function listKnowledge() {
  ensure();
  return readJson(KNOWLEDGE_FILE, []);
}
export function saveKnowledge(items) {
  ensure();
  writeJson(KNOWLEDGE_FILE, items);
}

export function removeKnowledge(id) {
  const all = listKnowledge();
  const next = all.filter((k) => k.id !== id);
  saveKnowledge(next);
  return next.length !== all.length;
}

// ---------------- Workspaces and memberships ----------------

export function listWorkspaces() {
  ensure();
  return readJson(WORKSPACES_FILE, []);
}

export function saveWorkspaces(items) {
  ensure();
  writeJson(WORKSPACES_FILE, items);
  return items;
}

export function getWorkspace(id) {
  return listWorkspaces().find((w) => w.id === id) || null;
}

export function getWorkspaceByInvite(code) {
  const raw = String(code || '').trim();
  if (!raw) return null;
  return listWorkspaces().find((w) => w.inviteCode === raw) || null;
}

const LEGACY_ADMIN_ROLE = 'bo' + 'ss';
const isAdminRole = (role) => role === 'admin' || role === LEGACY_ADMIN_ROLE;
const normalizeUserRole = (role) => (isAdminRole(role) ? 'admin' : 'member');

export function createWorkspace({ name, ownerUserId, status = 'pending' } = {}) {
  const spaces = listWorkspaces();
  const rec = {
    id: uid('ws'),
    name: String(name || '').trim(),
    ownerUserId: ownerUserId || null,
    status,
    inviteCode: inviteCode(),
    wsPub: publicWorkspaceId(),
    createdAt: stamp(),
    updatedAt: stamp(),
  };
  spaces.unshift(rec);
  saveWorkspaces(spaces);
  if (ownerUserId) addMembership({ workspaceId: rec.id, userId: ownerUserId, role: 'owner' });
  return rec;
}

export function updateWorkspace(id, patch = {}) {
  const spaces = listWorkspaces();
  const idx = spaces.findIndex((w) => w.id === id);
  if (idx < 0) return null;
  spaces[idx] = { ...spaces[idx], ...patch, updatedAt: stamp() };
  saveWorkspaces(spaces);
  return spaces[idx];
}

export function rotateWorkspaceInvite(id) {
  return updateWorkspace(id, { inviteCode: inviteCode() });
}

export function listMemberships() {
  ensure();
  return readJson(MEMBERSHIPS_FILE, []);
}

export function saveMemberships(items) {
  ensure();
  writeJson(MEMBERSHIPS_FILE, items);
  return items;
}

export function addMembership({ workspaceId, userId, role = 'member', active = true, remark = '' }) {
  const memberships = listMemberships();
  const existing = memberships.find((m) => m.workspaceId === workspaceId && m.userId === userId);
  if (existing) return existing;
  const rec = {
    id: uid('m'),
    workspaceId,
    userId,
    role: ['owner', 'admin', 'member'].includes(role) ? role : 'member',
    active: active !== false,
    remark: String(remark || '').trim(),
    createdAt: stamp(),
    updatedAt: stamp(),
  };
  memberships.push(rec);
  saveMemberships(memberships);
  return rec;
}

export function membershipsForUser(userId) {
  return listMemberships().filter((m) => m.userId === userId);
}

export function membershipsForWorkspace(workspaceId) {
  return listMemberships().filter((m) => m.workspaceId === workspaceId);
}

export function membershipOf(userId, workspaceId) {
  return listMemberships().find((m) => m.userId === userId && m.workspaceId === workspaceId) || null;
}

export function updateMembership(workspaceId, userId, patch = {}) {
  const memberships = listMemberships();
  const idx = memberships.findIndex((m) => m.workspaceId === workspaceId && m.userId === userId);
  if (idx < 0) return null;
  const current = memberships[idx];
  const next = { ...current };
  if (patch.role !== undefined) {
    next.role = ['owner', 'admin', 'member'].includes(patch.role) ? patch.role : 'member';
  }
  if (patch.active !== undefined) next.active = Boolean(patch.active);
  if (patch.remark !== undefined) next.remark = String(patch.remark || '').trim().slice(0, 200);
  next.updatedAt = stamp();
  memberships[idx] = next;
  saveMemberships(memberships);
  return next;
}

export function removeMembership(workspaceId, userId) {
  const memberships = listMemberships();
  const next = memberships.filter((m) => !(m.workspaceId === workspaceId && m.userId === userId));
  if (next.length === memberships.length) return false;
  saveMemberships(next);
  return true;
}

export function listWorkspaceJoinRequests() {
  ensure();
  return readJson(WORKSPACE_JOIN_REQUESTS_FILE, []);
}

export function joinRequestsForWorkspace(workspaceId, status = 'pending') {
  return listWorkspaceJoinRequests().filter(
    (request) => request.workspaceId === workspaceId && (!status || request.status === status),
  );
}

export function getWorkspaceJoinRequest(id) {
  return listWorkspaceJoinRequests().find((request) => request.id === id) || null;
}

export function createWorkspaceJoinRequest({ workspaceId, userId } = {}) {
  if (!workspaceId || !userId) return null;
  const requests = listWorkspaceJoinRequests();
  const pending = requests.find(
    (request) => request.workspaceId === workspaceId && request.userId === userId && request.status === 'pending',
  );
  if (pending) return pending;
  const rec = {
    id: uid('join'),
    workspaceId,
    userId,
    status: 'pending',
    createdAt: stamp(),
    updatedAt: stamp(),
  };
  requests.unshift(rec);
  writeJson(WORKSPACE_JOIN_REQUESTS_FILE, requests);
  return rec;
}

export function reviewWorkspaceJoinRequest(id, { approve = false, reviewedByUserId = '' } = {}) {
  const requests = listWorkspaceJoinRequests();
  const idx = requests.findIndex((request) => request.id === id);
  if (idx < 0 || requests[idx].status !== 'pending') return null;
  requests[idx] = {
    ...requests[idx],
    status: approve ? 'approved' : 'rejected',
    reviewedByUserId: String(reviewedByUserId || '').trim() || null,
    reviewedAt: stamp(),
    updatedAt: stamp(),
  };
  writeJson(WORKSPACE_JOIN_REQUESTS_FILE, requests);
  return requests[idx];
}

function markWorkspace(items, defaultWorkspaceId) {
  let changed = false;
  const next = items.map((item) => {
    if (item.workspaceId) return item;
    changed = true;
    return { ...item, workspaceId: defaultWorkspaceId, updatedAt: item.updatedAt || stamp() };
  });
  return { changed, next };
}

/**
 * Multi-tenant foundation migration: idempotently create a neutral default workspace
 * and assign legacy single-workspace records to it without deleting or overwriting business fields.
 */
export function ensureWorkspaceData() {
  ensure();
  let spaces = listWorkspaces();
  let def = spaces.find((w) => w.id === DEFAULT_WORKSPACE_ID);
  if (!def) {
    def = {
      id: DEFAULT_WORKSPACE_ID,
      name: 'Example Workspace',
      ownerUserId: null,
      status: 'active',
      inviteCode: inviteCode(),
      wsPub: 'project-os',
      createdAt: stamp(),
      updatedAt: stamp(),
    };
    spaces.unshift(def);
    saveWorkspaces(spaces);
  }

  const users = listUsers();
  const admins = users.filter((u) => isAdminRole(u.role) && u.active);
  const owner = admins[0] || users[0] || null;
  if (owner && !def.ownerUserId) {
    def = updateWorkspace(def.id, { ownerUserId: owner.id }) || def;
  }
  const refreshed = listWorkspaces();
  let workspaceChanged = false;
  for (const ws of refreshed) {
    if (!ws.wsPub) {
      ws.wsPub = ws.id === DEFAULT_WORKSPACE_ID ? 'project-os' : publicWorkspaceId();
      ws.updatedAt = stamp();
      workspaceChanged = true;
    }
  }
  if (workspaceChanged) saveWorkspaces(refreshed);
  // Legacy migration grants the neutral default workspace only to its explicit owner.
  // Every other user must join a workspace through an owner-approved request.
  if (owner) {
    addMembership({
      workspaceId: def.id,
      userId: owner.id,
      role: 'owner',
    });
  }

  const projectsMarked = markWorkspace(listProjects(), def.id);
  if (projectsMarked.changed) saveProjects(projectsMarked.next);

  const knowledgeMarked = markWorkspace(listKnowledge(), def.id);
  if (knowledgeMarked.changed) saveKnowledge(knowledgeMarked.next);

  return def;
}
export function addKnowledge(item) {
  const all = listKnowledge();
  const rec = { id: uid('k'), createdAt: new Date().toISOString(), ...item };
  all.unshift(rec);
  saveKnowledge(all);
  return rec;
}
export function updateKnowledge(id, patch) {
  const all = listKnowledge();
  const idx = all.findIndex((k) => k.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  saveKnowledge(all);
  return all[idx];
}
/** Batch insert for imports, deduplicated by ref. */
export function upsertKnowledgeByRef(items) {
  const all = listKnowledge();
  const seen = new Set(all.map((k) => k.ref).filter(Boolean));
  let added = 0;
  for (const it of items) {
    if (it.ref && seen.has(it.ref)) continue;
    all.push({ id: uid('k'), createdAt: new Date().toISOString(), ...it });
    if (it.ref) seen.add(it.ref);
    added++;
  }
  saveKnowledge(all);
  return added;
}

export function listKnowledgeVectors() {
  ensure();
  return readJson(KNOWLEDGE_VECTORS_FILE, {});
}

export function saveKnowledgeVectors(vectors) {
  ensure();
  writeJson(KNOWLEDGE_VECTORS_FILE, vectors);
}

// ---------------- Knowledge-base API keys ----------------

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function listKbKeys() {
  ensure();
  return readJson(KB_KEYS_FILE, []);
}

export function publicKbKey(k) {
  if (!k) return null;
  const { tokenHash, ...rest } = k;
  return rest;
}

export function createKbKey({ name, ownerName, workspaceId = DEFAULT_WORKSPACE_ID }) {
  const keys = listKbKeys();
  const token = `kb_live_${crypto.randomBytes(24).toString('base64url')}`;
  const stamp = new Date().toISOString();
  const rec = {
    id: uid('kbk'),
    name: String(name || 'Knowledge Base API Key').trim(),
    ownerName: ownerName || '',
    status: 'active',
    workspaceId: workspaceId || DEFAULT_WORKSPACE_ID,
    tokenPrefix: token.slice(0, 14),
    tokenHash: hashToken(token),
    createdAt: stamp,
    updatedAt: stamp,
  };
  keys.unshift(rec);
  writeJson(KB_KEYS_FILE, keys);
  return { key: publicKbKey(rec), token };
}

export function verifyKbToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const envKeys = String(process.env.PROJECT_OS_KB_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (envKeys.includes(raw)) return { id: 'env', name: 'env-kb-key', status: 'active', workspaceId: DEFAULT_WORKSPACE_ID };
  const hash = hashToken(raw);
  return listKbKeys().find((k) => k.status === 'active' && k.tokenHash === hash) || null;
}

export function revokeKbKey(id) {
  const keys = listKbKeys();
  const idx = keys.findIndex((k) => k.id === id);
  if (idx < 0) return null;
  keys[idx] = { ...keys[idx], status: 'revoked', updatedAt: new Date().toISOString() };
  writeJson(KB_KEYS_FILE, keys);
  return publicKbKey(keys[idx]);
}

export function removeKbKey(id) {
  const keys = listKbKeys();
  const next = keys.filter((k) => k.id !== id);
  if (next.length === keys.length) return false;
  writeJson(KB_KEYS_FILE, next);
  return true;
}

// ---------------- AI-only access credentials ----------------

const AGENT_TOKEN_SCOPES = ['project.context.read', 'project.events.append'];

function publicAgentToken(token) {
  if (!token) return null;
  const { tokenHash, ...safe } = token;
  return safe;
}

export function listAgentTokens(workspaceId, projectId = '') {
  ensure();
  return readJson(AGENT_TOKENS_FILE, [])
    .filter((token) => token.workspaceId === workspaceId && (!projectId || token.projectId === projectId))
    .map(publicAgentToken);
}

export function createAgentToken({ workspaceId, projectId, label, expiresInHours = 24, createdBy = '' }) {
  ensure();
  const hours = [24, 168].includes(Number(expiresInHours)) ? Number(expiresInHours) : 24;
  const raw = `pos_${crypto.randomBytes(32).toString('base64url')}`;
  const createdAt = stamp();
  const rec = {
    id: uid('ait'),
    workspaceId,
    projectId,
    label: String(label || 'Project AI').trim().slice(0, 80) || 'Project AI',
    scopes: [...AGENT_TOKEN_SCOPES],
    status: 'active',
    tokenPrefix: `${raw.slice(0, 12)}...`,
    tokenHash: hashToken(raw),
    createdBy: String(createdBy || '').slice(0, 120),
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
    lastUsedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
  const all = readJson(AGENT_TOKENS_FILE, []);
  all.unshift(rec);
  writeJson(AGENT_TOKENS_FILE, all);
  return { token: raw, credential: publicAgentToken(rec) };
}

export function verifyAgentToken(rawToken) {
  ensure();
  const raw = String(rawToken || '').trim();
  if (!raw.startsWith('pos_')) return null;
  const actual = Buffer.from(hashToken(raw));
  const found = readJson(AGENT_TOKENS_FILE, []).find((token) => {
    if (token.status !== 'active' || !token.tokenHash) return false;
    const expected = Buffer.from(String(token.tokenHash));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  });
  if (!found || new Date(found.expiresAt).getTime() <= Date.now()) return null;
  return publicAgentToken(found);
}

export function touchAgentToken(id) {
  ensure();
  const all = readJson(AGENT_TOKENS_FILE, []);
  const idx = all.findIndex((token) => token.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], lastUsedAt: stamp(), updatedAt: stamp() };
  writeJson(AGENT_TOKENS_FILE, all);
  return publicAgentToken(all[idx]);
}

export function revokeAgentToken(workspaceId, id) {
  ensure();
  const all = readJson(AGENT_TOKENS_FILE, []);
  const idx = all.findIndex((token) => token.id === id && token.workspaceId === workspaceId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], status: 'revoked', revokedAt: stamp(), updatedAt: stamp() };
  writeJson(AGENT_TOKENS_FILE, all);
  return publicAgentToken(all[idx]);
}

export function addAgentAudit(event = {}) {
  ensure();
  const all = readJson(AGENT_AUDIT_FILE, []);
  const includeNetworkMetadata = process.env.PROJECT_OS_AUDIT_NETWORK_METADATA === 'true';
  const rec = {
    id: uid('aia'),
    workspaceId: event.workspaceId,
    projectId: event.projectId || null,
    tokenId: event.tokenId || null,
    tokenLabel: String(event.tokenLabel || '').slice(0, 80),
    action: String(event.action || '').slice(0, 120),
    requestId: String(event.requestId || '').slice(0, 160) || null,
    outcome: String(event.outcome || 'ok').slice(0, 32),
    payloadHash: event.payloadHash || null,
    ip: includeNetworkMetadata ? String(event.ip || '').slice(0, 80) || null : null,
    userAgent: includeNetworkMetadata ? String(event.userAgent || '').slice(0, 240) || null : null,
    at: stamp(),
  };
  all.unshift(rec);
  writeJson(AGENT_AUDIT_FILE, all.slice(0, 5000));
  return rec;
}

export function listAgentAudit(workspaceId, projectId = '', limit = 100) {
  ensure();
  return readJson(AGENT_AUDIT_FILE, [])
    .filter((event) => event.workspaceId === workspaceId && (!projectId || event.projectId === projectId))
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)));
}

export function getAgentIdempotency({ workspaceId, tokenId, action, key }) {
  ensure();
  const nowMs = Date.now();
  return (
    readJson(AGENT_IDEMPOTENCY_FILE, []).find(
      (item) =>
        item.workspaceId === workspaceId &&
        item.tokenId === tokenId &&
        item.action === action &&
        item.key === key &&
        new Date(item.expiresAt).getTime() > nowMs,
    ) || null
  );
}

export function saveAgentIdempotency({ workspaceId, tokenId, action, key, requestHash, response, status = 200 }) {
  ensure();
  const nowMs = Date.now();
  const all = readJson(AGENT_IDEMPOTENCY_FILE, []).filter((item) => new Date(item.expiresAt).getTime() > nowMs);
  const rec = {
    id: uid('aii'),
    workspaceId,
    tokenId,
    action,
    key,
    requestHash,
    response,
    status,
    createdAt: stamp(),
    expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
  };
  all.unshift(rec);
  writeJson(AGENT_IDEMPOTENCY_FILE, all.slice(0, 5000));
  return rec;
}

// ---------------- Users and roles ----------------

/** Hash passwords with scrypt as salt:hash; plaintext is never stored. */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(pw, stored) {
  if (!stored || !String(stored).includes(':')) return false;
  const [salt, hash] = String(stored).split(':');
  const test = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const a = Buffer.from(test, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function listUsers() {
  ensure();
  return readJson(USERS_FILE, []);
}
export function saveUsers(u) {
  ensure();
  writeJson(USERS_FILE, u);
}
export function getUser(id) {
  return listUsers().find((u) => u.id === id) || null;
}
export function getUserByUsername(username) {
  return listUsers().find((u) => u.username === username) || null;
}
export function getUserByEmail(email) {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw) return null;
  return listUsers().find((u) => String(u.email || '').toLowerCase() === raw) || null;
}
export function addUser({ username, email, password, displayName, role }) {
  username = String(username || '').trim();
  email = String(email || '').trim().toLowerCase();
  if (!username || !password) return null;
  const users = listUsers();
  if (users.some((u) => u.username === username || (email && String(u.email || '').toLowerCase() === email))) return null; // Duplicate identity.
  const rec = {
    id: uid('u'),
    username,
    email: email || undefined,
    displayName: displayName || username,
    role: normalizeUserRole(role),
    active: true,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(rec);
  saveUsers(users);
  return rec;
}
export function updateUser(id, patch) {
  const users = listUsers();
  const i = users.findIndex((u) => u.id === id);
  if (i < 0) return null;
  const u = users[i];
  if (patch.displayName !== undefined) u.displayName = patch.displayName;
  if (patch.email !== undefined) u.email = String(patch.email || '').trim().toLowerCase() || undefined;
  if (patch.role !== undefined) u.role = normalizeUserRole(patch.role);
  if (patch.active !== undefined) u.active = Boolean(patch.active);
  if (patch.lastActiveAt !== undefined) u.lastActiveAt = patch.lastActiveAt;
  if (patch.risk !== undefined) u.risk = String(patch.risk || '').trim();
  if (patch.password) u.passwordHash = hashPassword(patch.password);
  users[i] = u;
  saveUsers(users);
  return u;
}
export function removeUser(id) {
  saveUsers(listUsers().filter((u) => u.id !== id));
  return true;
}
/** Remove passwordHash before returning user data. */
export function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

/** Build a stable ID from a name: slug plus a short timestamp. */
export function makeId(name) {
  const slug = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const code = Date.now().toString(36).slice(-4);
  return slug ? `${slug}-${code}` : `p-${code}`;
}
