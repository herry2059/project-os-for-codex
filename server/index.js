import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { initRepo, writeFile, commit, readLog } from './git.js';
import { aiReady, callAI, callAIWithUsage, parseAIJson, embedText } from './ai.js';
import { knowledgePdfBuffer } from './pdf.js';
import {
  DATA_DIR,
  REPOS_DIR,
  listProjects,
  getProject,
  saveProject,
  newProjectSecret,
  hashProjectSecret,
  verifyProjectSecret,
  listKeys,
  findKey,
  setProjectKey,
  listKnowledge,
  saveKnowledge,
  addKnowledge,
  updateKnowledge,
  listKnowledgeVectors,
  saveKnowledgeVectors,
  listKbKeys,
  publicKbKey,
  createKbKey,
  verifyKbToken,
  revokeKbKey,
  removeKbKey,
  listUsers,
  getUser,
  getUserByUsername,
  getUserByEmail,
  addUser,
  updateUser,
  removeUser,
  verifyPassword,
  publicUser,
  makeId,
  DEFAULT_WORKSPACE_ID,
  ensureWorkspaceData,
  listWorkspaces,
  getWorkspace,
  getWorkspaceByInvite,
  createWorkspace,
  updateWorkspace,
  rotateWorkspaceInvite,
  addMembership,
  membershipsForUser,
  membershipsForWorkspace,
  membershipOf,
  updateMembership,
  removeMembership,
  joinRequestsForWorkspace,
  getWorkspaceJoinRequest,
  createWorkspaceJoinRequest,
  reviewWorkspaceJoinRequest,
  listAgentTokens,
  createAgentToken,
  verifyAgentToken,
  touchAgentToken,
  revokeAgentToken,
  addAgentAudit,
  listAgentAudit,
  getAgentIdempotency,
  saveAgentIdempotency,
} from './store.js';
import { projectMd, AGENTS_MD, progressMd, handoffPackageMd, retroSummaryMd } from './templates.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 8790;
const APP_NAME = process.env.PROJECT_OS_APP_NAME || 'Project OS for Codex';
const MCP_PACKAGE = 'github:herry2059/project-os-for-codex#v0.3.0';
const GIT_PUBLIC_BASE = process.env.GIT_PUBLIC_BASE || '';
const KB_DIR = process.env.PROJECT_OS_KB_DIR || '';
const PUBLIC_BASE = (process.env.PROJECT_OS_PUBLIC_BASE || 'http://localhost:8790').replace(/\/$/, '');
const AUTH_USER = process.env.PROJECT_OS_AUTH_USER || '';
const AUTH_PASSWORD = process.env.PROJECT_OS_AUTH_PASSWORD || '';
const AUTH_ENABLED = Boolean(AUTH_USER && AUTH_PASSWORD);
const DEV_NO_AUTH = process.env.PROJECT_OS_DEV_NO_AUTH === 'true';
const ALLOW_DEV_NO_AUTH = !AUTH_ENABLED && process.env.NODE_ENV !== 'production' && DEV_NO_AUTH;
const SESSION_COOKIE = 'project_os_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_PATH = process.env.PROJECT_OS_COOKIE_PATH || '/';
const sessions = new Map();
const emailCodes = new Map();
const lastActivityTouch = new Map();
const agentWriteWindows = new Map();
const USER_SAFE_SERVICE_ERROR = 'The service is temporarily unavailable.';
const MEMBER_PROFILES_FILE = path.join(DATA_DIR, 'member-profiles.json');
const AI_TOKEN_ESTIMATES = {
  ai_assist: 401,
  knowledge_organize: 1227,
  retro_ai_draft: 1854,
};

if (process.env.NODE_ENV === 'production' && !AUTH_ENABLED) {
  throw new Error('Production requires PROJECT_OS_AUTH_USER and PROJECT_OS_AUTH_PASSWORD.');
}

function serviceError(res, e, context = 'service') {
  console.error(`[${context}]`, e?.stack || e?.message || e);
  return res.status(503).json({ code: 'SERVICE_BUSY', error: USER_SAFE_SERVICE_ERROR });
}

function safeServiceMessage() {
  return USER_SAFE_SERVICE_ERROR;
}

function readDataFile(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeDataFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function allowedWebOrigins() {
  const base = [];
  try {
    base.push(new URL(PUBLIC_BASE).origin);
  } catch {
    // ignore
  }
  return new Set(
    [
      ...base,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5180',
      ...(process.env.PROJECT_OS_ALLOWED_ORIGINS || '').split(','),
    ]
      .map((s) => String(s || '').trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
}

function sameSiteWriteGuard(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = String(req.get('origin') || '').trim().replace(/\/$/, '');
  const referer = String(req.get('referer') || '').trim();
  const allowed = allowedWebOrigins();
  if (origin && !allowed.has(origin)) return res.status(403).json({ error: 'The request origin is not allowed.' });
  if (!origin && referer) {
    try {
      const refOrigin = new URL(referer).origin.replace(/\/$/, '');
      if (!allowed.has(refOrigin)) return res.status(403).json({ error: 'The request origin is not allowed.' });
    } catch {
      return res.status(403).json({ error: 'The request origin is not allowed.' });
    }
  }
  return next();
}

// On startup, seed an administrator from the environment only when the user store is empty.
try {
  let bootstrapOwnerUserId = '';
  if (AUTH_ENABLED && listUsers().length === 0) {
    const seeded = addUser({ username: AUTH_USER, password: AUTH_PASSWORD, displayName: AUTH_USER, role: 'admin' });
    bootstrapOwnerUserId = seeded?.id || '';
    console.log('[auth] Seeded an administrator from environment credentials.');
  }
  ensureWorkspaceData({ bootstrapOwnerUserId });
} catch (e) {
  console.error('[auth] Initialization failed.', e);
}

const now = () => new Date().toISOString();
const repoDirOf = (id) => path.join(REPOS_DIR, id);
const repoUrlOf = (id) => (GIT_PUBLIC_BASE ? `${GIT_PUBLIC_BASE}/${id}.git` : `repos/${id}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isAdminRole = (role) => role === 'admin';

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        if (idx < 0) return [part, ''];
        return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      }),
  );
}

function authCookie(token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    `Path=${COOKIE_PATH}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  if (maxAgeSeconds !== undefined) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join('; ');
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function currentSession(req) {
  if (!AUTH_ENABLED) {
    if (!ALLOW_DEV_NO_AUTH) return null;
    return { user: 'dev', userId: 'dev', role: 'member', displayName: 'dev', expiresAt: Date.now() + SESSION_TTL_MS };
  }
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const rec = sessions.get(token);
  if (!rec || rec.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  if (rec.userId && !['env-admin', 'dev'].includes(rec.userId)) {
    const user = getUser(rec.userId);
    if (!user || !user.active) {
      sessions.delete(token);
      return null;
    }
    rec.user = user.username;
    rec.displayName = user.displayName;
    rec.role = isAdminRole(user.role) ? 'admin' : 'member';
    rec.email = user.email || '';
    const lastTouch = lastActivityTouch.get(user.id) || 0;
    if (Date.now() - lastTouch > 60 * 1000) {
      lastActivityTouch.set(user.id, Date.now());
      updateUser(user.id, { lastActiveAt: now() });
    }
  }
  return rec;
}

function workspaceSummary(workspace, membership = null, currentId = null) {
  if (!workspace) return null;
  return {
    id: workspace.id,
    name: workspace.name,
    role: membership?.role || 'member',
    status: workspace.status || 'pending',
    wsPub: workspace.wsPub || (workspace.id === DEFAULT_WORKSPACE_ID ? 'project-os' : ''),
    current: workspace.id === currentId,
  };
}

function userMemberships(session) {
  if (!session) return [];
  if ((ALLOW_DEV_NO_AUTH && session.userId === 'dev') || (AUTH_ENABLED && session.userId === 'env-admin')) {
    const ws = getWorkspace(DEFAULT_WORKSPACE_ID) || ensureWorkspaceData();
    return [{ workspace: ws, membership: { role: 'owner', userId: session.userId } }];
  }
  return membershipsForUser(session.userId)
    .map((membership) => ({ membership, workspace: getWorkspace(membership.workspaceId) }))
    .filter((x) => x.workspace && x.membership.active !== false);
}

function activeUserMemberships(session) {
  return userMemberships(session).filter((x) => x.workspace.status === 'active');
}

function currentWorkspacePair(req) {
  const s = currentSession(req);
  if (!s) return null;
  const all = userMemberships(s);
  if (!all.length) return null;
  const wanted = s.currentWorkspaceId;
  const active = all.find((x) => x.workspace.id === wanted && x.workspace.status === 'active');
  if (active) return active;
  return activeUserMemberships(s)[0] || all[0];
}

function currentWorkspaceId(req) {
  return currentWorkspacePair(req)?.workspace?.id || null;
}

function itemWorkspaceId(item) {
  return item?.workspaceId || DEFAULT_WORKSPACE_ID;
}

function assertActiveWorkspace(req, res) {
  const pair = currentWorkspacePair(req);
  if (!pair?.workspace) {
    res.status(403).json({ error: 'You are not a member of a workspace.' });
    return null;
  }
  if (pair.workspace.status !== 'active') {
    res.status(403).json({ error: 'The workspace is pending approval or suspended.' });
    return null;
  }
  return pair;
}

function belongsToCurrentWorkspace(req, item) {
  return itemWorkspaceId(item) === currentWorkspaceId(req);
}

function filterByCurrentWorkspace(req, items) {
  const wid = currentWorkspaceId(req);
  return items.filter((item) => itemWorkspaceId(item) === wid);
}

function belongsToWorkspace(item, workspaceId) {
  return itemWorkspaceId(item) === workspaceId;
}

function isDeletedProject(rec) {
  return Boolean(rec?.deletedAt || rec?.status === 'deleted');
}

function canManageProject(req, rec) {
  const pair = currentWorkspacePair(req);
  const session = currentSession(req);
  if (!pair || !session || !belongsToWorkspace(rec, pair.workspace.id)) return false;
  if (['owner', 'admin'].includes(pair.membership?.role)) return true;
  return Boolean(rec.ownerUserId && rec.ownerUserId === session.userId);
}

function assertProjectManager(req, res, rec) {
  if (canManageProject(req, rec)) return true;
  res.status(403).json({ error: 'Only the project owner or a workspace administrator can perform this action.' });
  return false;
}

function workspaceByPublicId(wsPub) {
  const raw = String(wsPub || '').trim();
  if (!raw) return null;
  return listWorkspaces().find((w) => (w.wsPub || (w.id === DEFAULT_WORKSPACE_ID ? 'project-os' : '')) === raw) || null;
}

function normalizeWorkspaceName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function validateWorkspaceName(name, exceptId = '') {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return { ok: false, error: 'Workspace name is required.' };
  if (clean.length < 2) return { ok: false, error: 'Workspace name must contain at least 2 characters.' };
  if (clean.length > 40) return { ok: false, error: 'Workspace name cannot exceed 40 characters.' };
  const normalized = normalizeWorkspaceName(clean);
  const hit = listWorkspaces().find((w) => w.id !== exceptId && normalizeWorkspaceName(w.name) === normalized);
  if (hit) return { ok: false, error: 'That workspace name is already in use.' };
  return { ok: true, name: clean };
}

function workspaceKbBaseUrl(workspace) {
  const pub = workspace?.wsPub || (workspace?.id === DEFAULT_WORKSPACE_ID ? 'project-os' : '');
  return `${PUBLIC_BASE}/api/w/${encodeURIComponent(pub)}/kb/v1`;
}

function requireWorkspaceRole(roles) {
  const wanted = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    const pair = assertActiveWorkspace(req, res);
    if (!pair) return;
    if (!wanted.includes(pair.membership?.role)) return res.status(403).json({ error: 'Workspace administrator access is required.' });
    return next();
  };
}

function requireAuth(req, res, next) {
  const s = currentSession(req);
  if (s) return next();
  return res.status(401).json({ error: 'Authentication is required.' });
}

function requireRole(role) {
  return (req, res, next) => {
    const s = currentSession(req);
    if (!s) return res.status(401).json({ error: 'Authentication is required.' });
    if (role === 'admin') {
      const pair = assertActiveWorkspace(req, res);
      if (!pair) return;
      if (!['owner', 'admin'].includes(pair.membership?.role)) {
        return res.status(403).json({ error: 'Workspace administrator access is required.' });
      }
    }
    return next();
  };
}

function effectiveUserRole(req, session) {
  if (!session) return 'member';
  const pair = currentWorkspacePair(req);
  if (['owner', 'admin'].includes(pair?.membership?.role)) return 'admin';
  return 'member';
}

function startSession(res, data) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { ...data, expiresAt: Date.now() + SESSION_TTL_MS });
  res.setHeader('Set-Cookie', authCookie(token, Math.floor(SESSION_TTL_MS / 1000)));
  const pair = userMemberships(data).find(({ workspace }) => workspace.id === data.currentWorkspaceId) || null;
  const workspace = pair?.workspace || null;
  const membership = pair?.membership || null;
  const frontRole = ['owner', 'admin'].includes(membership?.role) ? 'admin' : 'member';
  return res.json({
    ok: true,
    user: {
      username: data.user,
      displayName: data.displayName,
      role: frontRole,
      isSuperAdmin: false,
    },
    workspace: workspace ? workspaceSummary(workspace, membership, data.currentWorkspaceId) : null,
  });
}

function computeHealth(rec) {
  if (rec.status === 'done') return 'green';
  const days = (Date.now() - new Date(rec.updatedAt).getTime()) / 86400000;
  if (days > 3) return 'red';
  if (days > 1) return 'yellow';
  return 'green';
}

/** Convert an internal record into the public Project shape. */
function toApiProject(rec) {
  return {
    id: rec.id,
    name: rec.name,
    kickoff: rec.kickoff,
    status: rec.status,
    health: computeHealth(rec),
    progress: rec.progress,
    repoUrl: repoUrlOf(rec.id),
    keyName: rec.keyName ?? null,
    projectKeyPrefix: rec.projectKeyPrefix ?? null,
    projectContextUrl: `${PUBLIC_BASE}/api/projects/${rec.id}/context`,
    nextStep: rec.nextStep ?? null,
    ownerName: rec.ownerName ?? null,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function rotateProjectSecret(rec) {
  const projectKey = newProjectSecret();
  rec.projectKeyHash = hashProjectSecret(projectKey);
  rec.projectKeyPrefix = `${projectKey.slice(0, 10)}...`;
  rec.projectKeyCreatedAt = now();
  rec.updatedAt = now();
  saveProject(rec);
  return projectKey;
}

function projectConnection(rec) {
  return {
    projectId: rec.id,
    projectName: rec.name,
    contextUrl: `${PUBLIC_BASE}/api/projects/${rec.id}/context`,
    eventsUrl: `${PUBLIC_BASE}/api/projects/${rec.id}/events`,
    cloneUrl: repoUrlOf(rec.id),
    projectKeyPrefix: rec.projectKeyPrefix ?? null,
    hasProjectKey: Boolean(rec.projectKeyHash),
    createdAt: rec.projectKeyCreatedAt ?? null,
  };
}

function projectBootText(rec, projectKey) {
  const conn = projectConnection(rec);
  return [
    `Project: ${rec.name}`,
    '',
    'Legacy REST project key for trusted scripts you control. New integrations should use a short-lived AI credential with MCP.',
    `Context URL: ${conn.contextUrl}`,
    `Events URL: ${conn.eventsUrl}`,
    `Git: ${conn.cloneUrl}`,
    `Project-Key: ${projectKey}`,
    '',
    'Request header example (writes also require Idempotency-Key):',
    `X-Project-Key: ${projectKey}`,
    '',
    'Never paste this key into an AI conversation, issue, screenshot, log, or source repository.',
  ].join('\n');
}

function readProblems(dir) {
  try {
    return fs.readdirSync(path.join(dir, 'ISSUES')).filter((f) => f !== '.gitkeep');
  } catch {
    return [];
  }
}

function buildBootPrompt(rec) {
  const clone = repoUrlOf(rec.id);
  return [
    `You are taking over "${rec.name}" through Project OS for Codex. Continue from existing evidence instead of starting over.`,
    `1) Clone the repository: ${clone}`,
    '2) Read HANDOFF.md first, then PROJECT.md for goals and acceptance, AGENTS.md for guardrails, PROGRESS.md, and ISSUES/.',
    `3) Begin with the recorded next step: ${rec.nextStep || 'Read the handoff package to determine it.'}`,
    '4) After completing and checking each step, call project_os_append_progress with a concrete verification note.',
    '5) Never request or expose website passwords, AI credentials, provider keys, or other secrets.',
    '6) Stop for explicit human approval before deletion, permission, secret, release, payment, deployment, or rollback actions.',
  ].join('\n');
}

function buildHandoffPackage(rec, note, toOwnerName) {
  const dir = repoDirOf(rec.id);
  return handoffPackageMd({
    rec,
    recentLog: readLog(dir),
    problems: readProblems(dir),
    note,
    toOwnerName,
  });
}

function projectContextPayload(rec) {
  const dir = repoDirOf(rec.id);
  const read = (f) => {
    try {
      return fs.readFileSync(path.join(dir, f), 'utf8');
    } catch {
      return '';
    }
  };
  return {
    bootPrompt: buildBootPrompt(rec),
    cloneUrl: repoUrlOf(rec.id),
    project: toApiProject(rec),
    files: {
      'HANDOFF.md': read('HANDOFF.md'),
      'PROJECT.md': read('PROJECT.md'),
      'AGENTS.md': read('AGENTS.md'),
      'PROGRESS.md': read('PROGRESS.md'),
    },
    recentLog: readLog(dir)
      .slice(0, 10)
      .map((e) => ({ ...e, projectId: rec.id })),
  };
}

function appendProjectEvent(rec, body = {}, options = {}) {
  const { message, progressFrom, progressTo, nextStep, plainMessage, why, benefit, verification, stageIndex } = body;
  if (!message) {
    const err = new Error('message is required.');
    err.statusCode = 400;
    throw err;
  }
  const dir = repoDirOf(rec.id);
  const to = progressTo === undefined || progressTo === null ? null : Number(progressTo);
  const from = progressFrom === undefined || progressFrom === null ? rec.progress : Number(progressFrom);
  if (to !== null) writeFile(dir, 'PROGRESS.md', progressMd(to));
  commit(dir, {
    subject: message,
    actor: options.actor || body.actor || 'Member',
    keyName: options.keyLabel || body.keyName || null,
    progressFrom: from,
    progressTo: to,
    requestId: options.requestId || null,
    plainMessage: plainMessage || null,
    why: why || null,
    benefit: benefit || null,
    verification: verification || null,
    stageIndex: stageIndex ?? null,
    nextStep: nextStep || null,
  });
  if (to !== null) rec.progress = to;
  if (nextStep !== undefined) rec.nextStep = nextStep;
  if (rec.progress >= 100 && rec.status !== 'done') {
    rec.nextStep = rec.nextStep
      ? `${rec.nextStep} Project owner approval is still required to close the project.`
      : 'Progress reached 100%. Waiting for the project owner to review evidence and approve closure.';
  }
  rec.updatedAt = now();
  saveProject(rec);
  return rec;
}

function agentBearerToken(req) {
  const auth = String(req.get('authorization') || '').trim();
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function stablePayloadHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeAgentEvent(rec, body = {}) {
  if (rec.status === 'done') return { ok: false, error: 'The project is closed and cannot accept more progress events.' };
  const message = String(body.message || '').trim().replace(/\s+/g, ' ');
  if (!message) return { ok: false, error: 'message is required.' };
  if (message.length > 240) return { ok: false, error: 'message cannot exceed 240 characters.' };

  let progressTo = null;
  if (body.progressTo !== undefined && body.progressTo !== null && body.progressTo !== '') {
    progressTo = Number(body.progressTo);
    if (!Number.isInteger(progressTo) || progressTo < 0 || progressTo > 100) {
      return { ok: false, error: 'progressTo must be an integer from 0 to 100.' };
    }
    if (progressTo < Number(rec.progress || 0)) {
      return { ok: false, error: 'An AI cannot move project progress backward.' };
    }
  }

  const nextStep = body.nextStep === undefined ? undefined : String(body.nextStep || '').trim();
  if (nextStep !== undefined && nextStep.length > 500) {
    return { ok: false, error: 'nextStep cannot exceed 500 characters.' };
  }

  const plainMessage = body.plainMessage === undefined ? undefined : String(body.plainMessage || '').trim().replace(/\s+/g, ' ');
  if (plainMessage !== undefined && (!plainMessage || plainMessage.length > 500)) {
    return { ok: false, error: 'plainMessage must contain 1 to 500 characters.' };
  }
  const why = body.why === undefined ? undefined : String(body.why || '').trim().replace(/\s+/g, ' ');
  if (why !== undefined && (!why || why.length > 500)) {
    return { ok: false, error: 'why must contain 1 to 500 characters.' };
  }
  const benefit = body.benefit === undefined ? undefined : String(body.benefit || '').trim().replace(/\s+/g, ' ');
  if (benefit !== undefined && (!benefit || benefit.length > 500)) {
    return { ok: false, error: 'benefit must contain 1 to 500 characters.' };
  }
  const verification = String(body.verification || '').trim().replace(/\s+/g, ' ');
  if (!verification || verification.length > 500) {
    return { ok: false, error: 'verification must contain 1 to 500 characters.' };
  }
  let stageIndex = null;
  if (body.stageIndex !== undefined && body.stageIndex !== null && body.stageIndex !== '') {
    stageIndex = Number(body.stageIndex);
    if (!Number.isInteger(stageIndex) || stageIndex < 1 || stageIndex > 99) {
      return { ok: false, error: 'stageIndex must be an integer from 1 to 99.' };
    }
  }

  return {
    ok: true,
    value: {
      message,
      progressFrom: Number(rec.progress || 0),
      progressTo,
      ...(nextStep !== undefined ? { nextStep } : {}),
      ...(plainMessage !== undefined ? { plainMessage } : {}),
      ...(why !== undefined ? { why } : {}),
      ...(benefit !== undefined ? { benefit } : {}),
      verification,
      ...(stageIndex !== null ? { stageIndex } : {}),
    },
  };
}

function agentAuditFromRequest(req, token, action, outcome, extra = {}) {
  return addAgentAudit({
    workspaceId: token.workspaceId,
    projectId: extra.projectId || token.projectId,
    tokenId: token.id,
    tokenLabel: token.label,
    action,
    requestId: extra.requestId,
    outcome,
    payloadHash: extra.payloadHash,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
}

function resolveAgentProject(req, res, scope, action) {
  const token = verifyAgentToken(agentBearerToken(req));
  if (!token) return res.status(401).json({ error: 'The AI credential is invalid or expired.' });
  const rec = getProject(req.params.id || token.projectId);
  if (
    !rec ||
    isDeletedProject(rec) ||
    rec.id !== token.projectId ||
    itemWorkspaceId(rec) !== token.workspaceId
  ) {
    agentAuditFromRequest(req, token, action, 'denied', { projectId: req.params.id || token.projectId });
    return res.status(404).json({ error: 'Project not found.' });
  }
  if (!Array.isArray(token.scopes) || !token.scopes.includes(scope)) {
    agentAuditFromRequest(req, token, action, 'denied');
    return res.status(403).json({ error: 'The AI credential does not include the required scope.' });
  }
  touchAgentToken(token.id);
  req.agentToken = token;
  req.agentProject = rec;
  return null;
}

function checkAgentWriteRate(tokenId) {
  const nowMs = Date.now();
  const windowMs = 60 * 1000;
  const current = (agentWriteWindows.get(tokenId) || []).filter((at) => nowMs - at < windowMs);
  if (current.length >= 30) return false;
  current.push(nowMs);
  agentWriteWindows.set(tokenId, current);
  return true;
}

function knowledgeTitle(k) {
  return k.aiTitle || k.title || 'Untitled knowledge';
}

function publicKnowledgeItems(workspaceId = DEFAULT_WORKSPACE_ID) {
  return listKnowledge()
    .filter((k) => belongsToWorkspace(k, workspaceId) && k.visibility === 'public' && k.status !== 'draft')
    .map(toKbPublicItem);
}

function toKbPublicItem(k) {
  return {
    id: k.id,
    type: k.type || '',
    title: k.aiTitle || k.title || '',
    summary: k.aiSummary || k.body || '',
    detail: k.aiDetail || k.body || '',
    tags: k.tags || [],
    businessLine: k.businessLine || '',
    source: k.source || '',
    visibility: k.visibility || 'internal',
    status: k.status || 'published',
    ownerName: k.ownerName || '',
    createdAt: k.createdAt,
    updatedAt: k.updatedAt || k.organizedAt || k.createdAt,
  };
}

function bearerToken(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-kb-key'] || '').trim();
}

function requireKbKey(req, res, next) {
  const key = verifyKbToken(bearerToken(req));
  if (!key) return res.status(401).json({ error: 'A valid knowledge-base API key is required.' });
  key.workspaceId = key.workspaceId || DEFAULT_WORKSPACE_ID;
  req.kbKey = key;
  return next();
}

function requireNamespacedKbKey(req, res, next) {
  const workspace = workspaceByPublicId(req.params.wsPub);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found.' });
  const key = verifyKbToken(bearerToken(req));
  if (!key) return res.status(401).json({ error: 'A valid knowledge-base API key is required.' });
  key.workspaceId = key.workspaceId || DEFAULT_WORKSPACE_ID;
  if (key.workspaceId !== workspace.id) return res.status(403).json({ error: 'This key does not belong to the requested workspace.' });
  req.kbKey = key;
  req.kbWorkspace = workspace;
  return next();
}

function normalizeKnowledgePatch(body = {}, { draftDefault = false } = {}) {
  const out = {};
  if (body.type !== undefined) out.type = String(body.type || 'Experience').trim() || 'Experience';
  if (body.title !== undefined) out.title = String(body.title || '').trim();
  if (body.body !== undefined) out.body = String(body.body || '');
  if (body.aiTitle !== undefined) out.aiTitle = String(body.aiTitle || '').trim() || undefined;
  if (body.aiSummary !== undefined) out.aiSummary = String(body.aiSummary || '').trim() || undefined;
  if (body.aiDetail !== undefined) out.aiDetail = String(body.aiDetail || '').trim() || undefined;
  if (body.businessLine !== undefined) out.businessLine = String(body.businessLine || 'Uncategorized').trim() || 'Uncategorized';
  if (body.source !== undefined) out.source = String(body.source || 'Open API').trim() || 'Open API';
  if (body.ownerName !== undefined) out.ownerName = String(body.ownerName || '').trim();
  if (body.ref !== undefined) out.ref = String(body.ref || '').trim() || undefined;
  if (body.tags !== undefined) {
    out.tags = Array.isArray(body.tags)
      ? body.tags.map((t) => String(t).trim()).filter(Boolean)
      : String(body.tags || '')
          .split(/[,\s，、]+/)
          .map((t) => t.trim())
          .filter(Boolean);
  }
  if (body.visibility !== undefined) out.visibility = body.visibility === 'public' ? 'public' : 'internal';
  if (body.status !== undefined) out.status = ['draft', 'review', 'published'].includes(body.status) ? body.status : 'draft';
  else if (draftDefault) out.status = 'draft';
  return out;
}

function filterKnowledge(items, query = {}) {
  let out = items;
  if (query.ids && Array.isArray(query.ids) && query.ids.length) {
    const wanted = new Set(query.ids.map(String));
    out = out.filter((k) => wanted.has(k.id));
  }
  if (query.type) out = out.filter((k) => k.type === query.type);
  if (query.businessLine) out = out.filter((k) => k.businessLine === query.businessLine);
  if (query.visibility) out = out.filter((k) => (k.visibility || 'internal') === query.visibility);
  if (query.status) out = out.filter((k) => (k.status || 'published') === query.status);
  if (query.q) {
    const s = String(query.q).toLowerCase();
    out = out.filter((k) =>
      [
        k.title,
        k.body,
        k.aiTitle,
        k.aiSummary,
        k.aiDetail,
        k.businessLine,
        k.source,
        ...(k.tags || []),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }
  return out;
}

function scoreKnowledgeText(k, text) {
  const raw = String(text || '').trim().toLowerCase();
  if (!raw) return 0;
  const words = raw
    .split(/[\s,，。；;、]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const hay = [
    k.aiTitle,
    k.title,
    k.aiSummary,
    k.aiDetail,
    k.body,
    k.businessLine,
    k.source,
    ...(k.tags || []),
  ]
    .join('\n')
    .toLowerCase();
  let score = hay.includes(raw) ? 8 : 0;
  for (const w of words) if (hay.includes(w)) score += Math.min(w.length, 6);
  return score;
}

function listKbItemsForWorkspace(workspaceId, query = {}) {
  const base = listKnowledge().filter((k) => belongsToWorkspace(k, workspaceId)).map(toKbPublicItem);
  let items = filterKnowledge(base, query);
  if (query.tag) items = items.filter((k) => (k.tags || []).includes(String(query.tag)));
  return items;
}

function addKbItemForWorkspace(workspaceId, key, body = {}) {
  const patch = normalizeKnowledgePatch(body, { draftDefault: true });
  if (!patch.title) {
    const err = new Error('title is required.');
    err.statusCode = 400;
    throw err;
  }
  const rec = addKnowledge({
    type: patch.type || 'Experience',
    title: patch.title,
    body: patch.body || '',
    tags: patch.tags || [],
    businessLine: patch.businessLine || 'Uncategorized',
    source: patch.source || `Open API: ${key.name || key.id}`,
    visibility: patch.visibility || 'internal',
    status: 'draft',
    ownerName: patch.ownerName || '',
    workspaceId,
    ref: patch.ref,
    aiTitle: patch.aiTitle,
    aiSummary: patch.aiSummary,
    aiDetail: patch.aiDetail,
  });
  scheduleKnowledgeAutoOrganize('kb-api-write', workspaceId);
  return rec;
}

function updateKbItemForWorkspace(workspaceId, id, body = {}) {
  const patch = normalizeKnowledgePatch(body);
  if (patch.title === '') {
    const err = new Error('title cannot be empty.');
    err.statusCode = 400;
    throw err;
  }
  const current = listKnowledge().find((k) => k.id === id);
  if (!current || !belongsToWorkspace(current, workspaceId)) return null;
  return updateKnowledge(id, { ...patch, workspaceId: itemWorkspaceId(current) });
}

async function searchKbForWorkspace(workspaceId, body = {}) {
  const { q, limit = 10, publicOnly = false, type, businessLine } = body;
  if (!String(q || '').trim()) {
    const err = new Error('q is required.');
    err.statusCode = 400;
    throw err;
  }
  const scoped = filterKnowledge(listKnowledge().filter((k) => belongsToWorkspace(k, workspaceId)), {
    type,
    businessLine,
    visibility: publicOnly ? 'public' : undefined,
    status: publicOnly ? 'published' : undefined,
  });
  const n = Math.min(Math.max(Number(limit) || 10, 1), 50);
  try {
    const items = await vectorSearch(scoped, q, n);
    return { items, mode: 'vector' };
  } catch {
    // Fall back to keyword search when embeddings are not configured.
  }
  const items = scoped
    .map((k) => ({ item: k, score: scoreKnowledgeText(k, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => ({ ...toKbPublicItem(x.item), score: x.score }));
  return { items, mode: 'hybrid-keyword' };
}

function vectorText(k) {
  return [
    k.aiTitle || k.title,
    k.aiSummary,
    k.aiDetail,
    k.body,
    k.businessLine,
    k.source,
    ...(k.tags || []),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 8000);
}

function cosine(a = [], b = []) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}

async function vectorSearch(items, q, limit) {
  const queryVector = await embedText(q);
  const vectors = listKnowledgeVectors();
  let changed = false;
  const scored = [];
  for (const item of items.slice(0, 300)) {
    const text = vectorText(item);
    const signature = crypto.createHash('sha1').update(text).digest('hex');
    let rec = vectors[item.id];
    if (!rec || rec.signature !== signature || !Array.isArray(rec.embedding)) {
      rec = { signature, embedding: await embedText(text), updatedAt: now() };
      vectors[item.id] = rec;
      changed = true;
      await sleep(120);
    }
    scored.push({ item, score: cosine(queryVector, rec.embedding) });
  }
  if (changed) saveKnowledgeVectors(vectors);
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ ...toKbPublicItem(x.item), score: Number(x.score.toFixed(4)) }));
}

function needsKnowledgeOrganization(k) {
  return !(k.aiTitle && k.aiSummary && k.aiDetail) && k.organizeStatus !== 'error';
}

function faqItems() {
  return [
    {
      question: 'What does Project OS for Codex do?',
      answer: 'It helps teams make AI project progress visible, resumable, and handoff-ready.',
    },
    {
      question: 'What is the core idea?',
      answer: 'Every project has a kickoff card, Git-backed progress events, and a handoff package.',
    },
    {
      question: 'Is it ready for production hosting?',
      answer: 'Use the public release checklist before hosting it with real users or private data.',
    },
    {
      question: 'How should I evaluate it?',
      answer: 'Create a local project, issue a short-lived AI credential, connect the MCP server, read context, append one event, and inspect the matching project-record Git commit.',
    },
  ];
}

function resolveKnowledgeSource(ref) {
  if (!KB_DIR || !ref) return null;
  const root = path.resolve(KB_DIR);
  const full = path.resolve(root, ref);
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  return full;
}

function readKnowledgeSource(k) {
  const file = resolveKnowledgeSource(k.ref);
  if (!file) return '';
  try {
    return fs.readFileSync(file, 'utf8').slice(0, 8000);
  } catch {
    return '';
  }
}

async function organizeKnowledgeItem(k) {
  const rawSource = String(k.type || '').toLowerCase() === 'conversation' ? readKnowledgeSource(k) : '';
  const source = rawSource.trim()
    ? rawSource
    : [
        `Title: ${k.title || ''}`,
        `Type: ${k.type || ''}`,
        `Business line: ${k.businessLine || ''}`,
        `Source: ${k.source || ''}`,
        `Tags: ${(k.tags || []).join(', ')}`,
        '',
        k.body || '',
        k.aiDetail || '',
      ].join('\n');
  if (!source.trim()) {
    const err = new Error('No knowledge content was found. Check the body, ref, or PROJECT_OS_KB_DIR.');
    err.statusCode = 400;
    throw err;
  }
  const content = await callAI(
    [
      {
        role: 'system',
        content:
          'You are an enterprise knowledge-base editor. Turn the source material into a concise, reusable entry that future AI agents should read first. Return JSON only, with no commentary.',
      },
      {
        role: 'user',
        content: [
          'Return JSON for the material below:',
          '{"title":"Concise title, at most 60 characters","summary":"One or two sentences, at most 240 characters","detail":"Organized Markdown covering context, key decisions, reusable lessons, risks, and next steps"}',
          '',
          `Type: ${k.type || 'Experience'}`,
          `Business line: ${k.businessLine || 'Uncategorized'}`,
          `Original title: ${k.title || ''}`,
          `Tags: ${(k.tags || []).join(', ')}`,
          '',
          source,
        ].join('\n'),
      },
    ],
    { json: true },
  );
  const parsed = parseAIJson(content);
  const title = String(parsed.title || '').trim().slice(0, 60);
  const summary = String(parsed.summary || '').trim().slice(0, 240);
  const detail = String(parsed.detail || '').trim();
  if (!title || !summary || !detail) {
    const err = new Error('The AI result is missing title, summary, or detail.');
    err.statusCode = 502;
    throw err;
  }
  return {
    ...k,
    aiTitle: title,
    aiSummary: summary,
    aiDetail: detail,
    organizeStatus: 'done',
    organizeError: '',
    organizedAt: now(),
  };
}

const knowledgeAutoQueue = {
  running: false,
  scheduled: false,
  lastRunAt: 0,
  workspaceId: '',
};

async function organizeKnowledgeBacklog({ limit = 20, force = false, workspaceId = '' } = {}) {
  const items = listKnowledge();
  const targets = items
    .map((k, idx) => ({ k, idx }))
    .filter(({ k }) => (!workspaceId || belongsToWorkspace(k, workspaceId)) && (force || needsKnowledgeOrganization(k)))
    .slice(0, Math.max(1, Math.min(Number(limit) || 20, 200)));
  const results = [];
  let ok = 0;
  for (const target of targets) {
    try {
      const current = listKnowledge();
      const latestIdx = current.findIndex((x) => x.id === target.k.id);
      const latest = latestIdx >= 0 ? current[latestIdx] : target.k;
      if (!force && !needsKnowledgeOrganization(latest)) continue;
      const organized = await organizeKnowledgeItem(latest);
      if (latestIdx >= 0) current[latestIdx] = organized;
      else current[target.idx] = organized;
      saveKnowledge(current);
      ok++;
      results.push({ id: latest.id, ok: true, title: knowledgeTitle(organized) });
    } catch (e) {
      console.error('[knowledge] organize item failed:', target.k.id, e?.stack || e?.message || e);
      const current = listKnowledge();
      const latestIdx = current.findIndex((x) => x.id === target.k.id);
      if (latestIdx >= 0) {
        current[latestIdx] = {
          ...current[latestIdx],
          organizeStatus: 'error',
          organizeError: safeServiceMessage(),
          organizeTriedAt: now(),
        };
        saveKnowledge(current);
      }
      results.push({ id: target.k.id, ok: false, error: safeServiceMessage() });
    }
    await sleep(180);
  }
  return { total: targets.length, ok, results };
}

function scheduleKnowledgeAutoOrganize(reason = 'auto', workspaceId = '') {
  if (!aiReady()) return;
  if (knowledgeAutoQueue.scheduled || knowledgeAutoQueue.running) return;
  knowledgeAutoQueue.scheduled = true;
  knowledgeAutoQueue.workspaceId = workspaceId || '';
  setTimeout(async () => {
    knowledgeAutoQueue.scheduled = false;
    if (knowledgeAutoQueue.running) return;
    knowledgeAutoQueue.running = true;
    const queueWorkspaceId = knowledgeAutoQueue.workspaceId;
    try {
      do {
        const result = await organizeKnowledgeBacklog({ limit: 12, workspaceId: queueWorkspaceId });
        knowledgeAutoQueue.lastRunAt = Date.now();
        if (!result.total) break;
        await sleep(1200);
      } while (listKnowledge().some((k) => (!queueWorkspaceId || belongsToWorkspace(k, queueWorkspaceId)) && needsKnowledgeOrganization(k)));
    } catch (e) {
      console.error('[knowledge] auto organize failed:', reason, e.message);
    } finally {
      knowledgeAutoQueue.running = false;
    }
  }, 1200);
}

function cleanExpiredAuthArtifacts() {
  const t = Date.now();
  for (const [k, v] of emailCodes) if (v.expiresAt < t) emailCodes.delete(k);
}

async function sendMail({ to, subject, text }) {
  const host = process.env.PROJECT_OS_SMTP_HOST || process.env.SMTP_HOST || '';
  const user = process.env.PROJECT_OS_SMTP_USER || process.env.SMTP_USER || '';
  const pass = process.env.PROJECT_OS_SMTP_PASS || process.env.SMTP_PASS || '';
  if (!host || !user || !pass) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[dev-email] ${to} ${subject}\n${text}`);
      return { ok: true, dev: true };
    }
    return { ok: false, error: 'SMTP is not configured.' };
  }
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host,
      port: Number(process.env.PROJECT_OS_SMTP_PORT || process.env.SMTP_PORT || 465),
      secure: String(process.env.PROJECT_OS_SMTP_SECURE || process.env.SMTP_SECURE || 'true') !== 'false',
      auth: { user, pass },
    });
    await transporter.sendMail({ from: process.env.PROJECT_OS_SMTP_FROM || user, to, subject, text });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'Email delivery failed.' };
  }
}

const api = express.Router();
api.use(sameSiteWriteGuard);

api.post('/auth/send-code', async (req, res) => {
  cleanExpiredAuthArtifacts();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const recent = emailCodes.get(email);
  if (recent?.sentAt && Date.now() - recent.sentAt < 55 * 1000) {
    return res.status(429).json({ error: 'A verification code was sent recently. Try again later.' });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  emailCodes.set(email, { code, sentAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 });
  const sent = await sendMail({
    to: email,
    subject: `${APP_NAME} verification code`,
    text: `Your verification code is ${code}.\n\nIt expires in 10 minutes. Ignore this message if you did not request it.`,
  });
  if (!sent.ok) return res.status(503).json({ code: 'SERVICE_BUSY', error: USER_SAFE_SERVICE_ERROR });
  const out = { ok: true };
  if (sent.dev) out.devHint = 'The verification code was printed in the server log for local development.';
  res.json(out);
});

api.post('/auth/register', (req, res) => {
  cleanExpiredAuthArtifacts();
  const {
    email,
    password,
    displayName,
    mode,
    workspaceName,
    inviteCode,
    emailCode,
    agreedLegalVersion,
  } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (String(password || '').length < 6) return res.status(400).json({ error: 'Password must contain at least 6 characters.' });
  if (!String(displayName || '').trim()) return res.status(400).json({ error: 'Display name is required.' });
  if (!agreedLegalVersion) return res.status(400).json({ error: 'Accept the terms before registering.' });
  const code = emailCodes.get(cleanEmail);
  if (!code || code.expiresAt < Date.now() || code.code !== String(emailCode || '').trim()) {
    return res.status(400).json({ error: 'The email verification code is invalid or expired.' });
  }
  if (getUserByEmail(cleanEmail) || getUserByUsername(cleanEmail)) return res.status(409).json({ error: 'This email address is already registered.' });

  let workspace = null;
  if (mode === 'join') {
    workspace = getWorkspaceByInvite(inviteCode);
    if (!workspace) return res.status(400).json({ error: 'Invite code not found.' });
    if (workspace.status !== 'active') return res.status(400).json({ error: 'This workspace is not accepting members.' });
  } else {
    const nameCheck = validateWorkspaceName(workspaceName);
    if (!nameCheck.ok) return res.status(409).json({ error: nameCheck.error });
  }

  const user = addUser({
    username: cleanEmail,
    email: cleanEmail,
    password,
    displayName: String(displayName).trim(),
    role: 'member',
  });
  if (!user) return res.status(409).json({ error: 'An account with this identity already exists.' });
  emailCodes.delete(cleanEmail);

  if (mode === 'join') {
    const request = createWorkspaceJoinRequest({ workspaceId: workspace.id, userId: user.id });
    if (!request) return res.status(503).json({ error: USER_SAFE_SERVICE_ERROR });
    return res.status(202).json({
      ok: true,
      status: 'pending',
      workspaceName: workspace.name,
      message: 'Your account was created. A workspace owner must approve the join request before you can sign in.',
    });
  }

  workspace = createWorkspace({
    name: validateWorkspaceName(workspaceName).name,
    ownerUserId: user.id,
    status: 'active',
  });
  if (!workspace) return res.status(503).json({ error: USER_SAFE_SERVICE_ERROR });

  return startSession(res, {
    user: user.username,
    userId: user.id,
    role: user.role,
    displayName: user.displayName,
    currentWorkspaceId: workspace.id,
  });
});

api.get('/auth/me', (req, res) => {
  const s = currentSession(req);
  const pair = s ? currentWorkspacePair(req) : null;
  const frontRole = s ? effectiveUserRole(req, s) : 'member';
  res.json({
    authenticated: Boolean(s),
    user: s
      ? {
          username: s.user,
          displayName: s.displayName || s.user,
          role: frontRole,
          isSuperAdmin: false,
        }
      : null,
    workspace: pair ? workspaceSummary(pair.workspace, pair.membership, pair.workspace.id) : null,
    authEnabled: AUTH_ENABLED,
  });
});

api.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  // 1) Registered users.
  const u = getUserByUsername(String(username || '').trim());
  if (u && u.active && verifyPassword(password, u.passwordHash)) {
    const active = activeUserMemberships({ userId: u.id })[0] || userMemberships({ userId: u.id })[0];
    if (!active) return res.status(403).json({ error: 'The workspace join request is still waiting for owner approval.' });
    return startSession(res, {
      user: u.username,
      userId: u.id,
      role: u.role,
      displayName: u.displayName,
      currentWorkspaceId: active?.workspace?.id || null,
    });
  }
  // 2) Emergency administrator from environment credentials.
  if (AUTH_ENABLED && safeEqual(username || '', AUTH_USER) && safeEqual(password || '', AUTH_PASSWORD)) {
    return startSession(res, { user: AUTH_USER, userId: 'env-admin', role: 'admin', displayName: AUTH_USER, currentWorkspaceId: DEFAULT_WORKSPACE_ID });
  }
  // 3) Explicit local-development access without authentication.
  if (ALLOW_DEV_NO_AUTH) {
    return startSession(res, { user: 'dev', userId: 'dev', role: 'member', displayName: 'dev', currentWorkspaceId: DEFAULT_WORKSPACE_ID });
  }
  return res.status(401).json({ error: 'Username or password is incorrect.' });
});

api.get('/workspaces/name-available', (req, res) => {
  const check = validateWorkspaceName(req.query?.name);
  res.status(check.ok ? 200 : 409).json({
    ok: check.ok,
    available: check.ok,
    name: check.name || String(req.query?.name || '').trim(),
    error: check.ok ? '' : check.error,
  });
});

api.post('/auth/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', authCookie('', 0));
  res.json({ ok: true });
});

api.get('/health', (_req, res) => res.json({ ok: true, protected: AUTH_ENABLED, app: APP_NAME }));

api.get('/kb/v1/public', (_req, res) => {
  res.json({
    organization: {
      name: 'Project OS for Codex',
      shortName: 'Project OS for Codex',
      contact: '',
      url: PUBLIC_BASE,
    },
    items: publicKnowledgeItems(DEFAULT_WORKSPACE_ID),
    faq: faqItems(),
  });
});

api.get('/kb/v1/items', (req, res, next) => {
  const onlyPublic = req.query.public === '1' || req.query.public === 'true';
  if (onlyPublic) return next();
  return requireKbKey(req, res, next);
}, (req, res) => {
  const onlyPublic = req.query.public === '1' || req.query.public === 'true';
  const workspaceId = onlyPublic ? DEFAULT_WORKSPACE_ID : req.kbKey.workspaceId;
  const items = onlyPublic ? filterKnowledge(publicKnowledgeItems(workspaceId), req.query) : listKbItemsForWorkspace(workspaceId, req.query);
  res.json({ items });
});

api.post('/kb/v1/items', requireKbKey, (req, res) => {
  try {
    const rec = addKbItemForWorkspace(req.kbKey.workspaceId, req.kbKey, req.body || {});
    res.status(201).json({ item: toKbPublicItem(rec) });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message || 'Write failed.' });
  }
});

api.put('/kb/v1/items/:id', requireKbKey, (req, res) => {
  let rec;
  try {
    rec = updateKbItemForWorkspace(req.kbKey.workspaceId, req.params.id, req.body || {});
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message || 'Update failed.' });
  }
  if (!rec) return res.status(404).json({ error: 'Knowledge entry not found.' });
  res.json({ item: toKbPublicItem(rec) });
});

api.post('/kb/v1/search', requireKbKey, async (req, res) => {
  try {
    res.json(await searchKbForWorkspace(req.kbKey.workspaceId, req.body || {}));
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message || 'Search failed.' });
  }
});

api.get('/w/:wsPub/kb/v1/items', requireNamespacedKbKey, (req, res) => {
  res.json({ items: listKbItemsForWorkspace(req.kbWorkspace.id, req.query) });
});

api.post('/w/:wsPub/kb/v1/items', requireNamespacedKbKey, (req, res) => {
  try {
    const rec = addKbItemForWorkspace(req.kbWorkspace.id, req.kbKey, req.body || {});
    res.status(201).json({ item: toKbPublicItem(rec) });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message || 'Write failed.' });
  }
});

api.put('/w/:wsPub/kb/v1/items/:id', requireNamespacedKbKey, (req, res) => {
  let rec;
  try {
    rec = updateKbItemForWorkspace(req.kbWorkspace.id, req.params.id, req.body || {});
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message || 'Update failed.' });
  }
  if (!rec) return res.status(404).json({ error: 'Knowledge entry not found.' });
  res.json({ item: toKbPublicItem(rec) });
});

api.post('/w/:wsPub/kb/v1/search', requireNamespacedKbKey, async (req, res) => {
  try {
    res.json(await searchKbForWorkspace(req.kbWorkspace.id, req.body || {}));
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message || 'Search failed.' });
  }
});

api.get('/kb/v1/llms.txt', (_req, res) => {
  res.type('text/plain; charset=utf-8').send(
    [
      '# Project OS for Codex',
      '',
      'Open-source control center for AI-assisted software projects.',
      'Core loop: kickoff card, Git-backed progress, visible next step, handoff package, retrospective knowledge.',
      '',
      'Local knowledge API: /api/kb/v1/public',
      'Local sitemap: /api/kb/v1/sitemap.xml',
      '',
    ].join('\n'),
  );
});

api.get('/kb/v1/sitemap.xml', (_req, res) => {
  const urls = [
    `${PUBLIC_BASE}/`,
    `${PUBLIC_BASE}/knowledge`,
    `${PUBLIC_BASE}/api/kb/v1/public`,
    `${PUBLIC_BASE}/api/kb/v1/llms.txt`,
  ];
  for (const item of publicKnowledgeItems(DEFAULT_WORKSPACE_ID)) urls.push(`${PUBLIC_BASE}/api/kb/v1/items?public=1&q=${encodeURIComponent(item.title)}`);
  res.type('application/xml; charset=utf-8').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map(
          (loc) =>
            `  <url><loc>${loc.replace(/&/g, '&amp;')}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>`,
        )
        .join('\n') +
      `\n</urlset>\n`,
  );
});

api.get('/kb/v1/geo.jsonld', (_req, res) => {
  res.json({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'Project OS for Codex',
        url: PUBLIC_BASE,
        codeRepository: 'https://github.com/herry2059/project-os-for-codex',
        applicationCategory: 'DeveloperApplication',
        license: 'https://www.apache.org/licenses/LICENSE-2.0',
        knowsAbout: [
          'Codex',
          'Model Context Protocol',
          'AI coding agents',
          'AI-assisted development',
          'project management',
          'handoff',
          'Git-backed progress',
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqItems().map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      },
    ],
  });
});

// Public project entry for external AI agents. Provider credentials stay server-side.
api.get('/projects/:id/context', (req, res, next) => {
  const key = req.get('x-project-key');
  if (!key) return next();
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!verifyProjectSecret(rec, String(key))) return res.status(403).json({ error: 'Invalid project key.' });
  res.json(projectContextPayload(rec));
});

api.post('/projects/:id/events', (req, res, next) => {
  const key = req.get('x-project-key');
  if (!key) return next();
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!verifyProjectSecret(rec, String(key))) return res.status(403).json({ error: 'Invalid project key.' });
  const requestId = String(req.get('idempotency-key') || '').trim();
  if (requestId.length < 8 || requestId.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) {
    return res.status(400).json({ error: 'The legacy endpoint also requires a valid Idempotency-Key.' });
  }
  const normalized = normalizeAgentEvent(rec, req.body || {});
  if (!normalized.ok) return res.status(400).json({ error: normalized.error });
  const payloadHash = stablePayloadHash({
    message: normalized.value.message,
    progressTo: normalized.value.progressTo,
    nextStep: normalized.value.nextStep,
    plainMessage: normalized.value.plainMessage,
    why: normalized.value.why,
    benefit: normalized.value.benefit,
    verification: normalized.value.verification,
    stageIndex: normalized.value.stageIndex,
  });
  const tokenId = `legacy:${rec.id}:${String(rec.projectKeyHash).slice(0, 16)}`;
  const workspaceId = itemWorkspaceId(rec);
  const existing = getAgentIdempotency({ workspaceId, tokenId, action: 'legacy.project.events.append', key: requestId });
  if (existing) {
    if (existing.requestHash !== payloadHash) return res.status(409).json({ error: 'An Idempotency-Key cannot be reused with different content.' });
    res.setHeader('Idempotency-Replayed', 'true');
    return res.status(existing.status).json(existing.response);
  }
  try {
    appendProjectEvent(rec, normalized.value, {
      actor: 'Legacy project key',
      keyLabel: rec.projectKeyPrefix || 'project-key',
      requestId,
    });
    const response = { ok: true, project: toApiProject(rec), requestId };
    saveAgentIdempotency({
      workspaceId,
      tokenId,
      action: 'legacy.project.events.append',
      key: requestId,
      requestHash: payloadHash,
      response,
      status: 201,
    });
    addAgentAudit({
      workspaceId,
      projectId: rec.id,
      tokenId,
      tokenLabel: 'Legacy project key',
      action: 'legacy.project.events.append',
      requestId,
      outcome: 'ok',
      payloadHash,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(201).json(response);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message || 'Write failed.' });
  }
});

// AI-native project access. A short-lived credential is bound to exactly one
// workspace and one project; browser usernames and passwords are never used.
api.get('/agent/v1/capabilities', (req, res) => {
  if (resolveAgentProject(req, res, 'project.context.read', 'capabilities.read')) return;
  const token = req.agentToken;
  const rec = req.agentProject;
  agentAuditFromRequest(req, token, 'capabilities.read', 'ok');
  res.json({
    service: 'Project OS for Codex',
    project: { id: rec.id, name: rec.name },
    credential: {
      label: token.label,
      scopes: token.scopes,
      expiresAt: token.expiresAt,
    },
    tools: [
      {
        name: 'project_os_get_context',
        mode: 'read',
        description: 'Read the kickoff card, acceptance criteria, AGENTS rules, progress, recent log, and next step.',
      },
      {
        name: 'project_os_append_progress',
        mode: 'write',
        description: 'Append one idempotent progress event, a verification note, and one matching project-record Git commit.',
      },
    ],
    forbidden: ['project.delete', 'project.restore', 'member.manage', 'key.manage', 'deploy', 'publish'],
  });
});

api.get('/agent/v1/projects/:id/context', (req, res) => {
  if (resolveAgentProject(req, res, 'project.context.read', 'project.context.read')) return;
  const token = req.agentToken;
  const rec = req.agentProject;
  agentAuditFromRequest(req, token, 'project.context.read', 'ok');
  res.json(projectContextPayload(rec));
});

api.post('/agent/v1/projects/:id/events', (req, res) => {
  if (resolveAgentProject(req, res, 'project.events.append', 'project.events.append')) return;
  const token = req.agentToken;
  const rec = req.agentProject;
  const requestId = String(req.get('idempotency-key') || '').trim();
  if (requestId.length < 8 || requestId.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) {
    agentAuditFromRequest(req, token, 'project.events.append', 'denied');
    return res.status(400).json({ error: 'A valid Idempotency-Key is required.' });
  }

  const normalized = normalizeAgentEvent(rec, req.body || {});
  if (!normalized.ok) {
    agentAuditFromRequest(req, token, 'project.events.append', 'denied', { requestId });
    return res.status(400).json({ error: normalized.error });
  }
  const payloadHash = stablePayloadHash({
    message: normalized.value.message,
    progressTo: normalized.value.progressTo,
    nextStep: normalized.value.nextStep,
    plainMessage: normalized.value.plainMessage,
    why: normalized.value.why,
    benefit: normalized.value.benefit,
    verification: normalized.value.verification,
    stageIndex: normalized.value.stageIndex,
  });
  const existing = getAgentIdempotency({
    workspaceId: token.workspaceId,
    tokenId: token.id,
    action: 'project.events.append',
    key: requestId,
  });
  if (existing) {
    if (existing.requestHash !== payloadHash) {
      agentAuditFromRequest(req, token, 'project.events.append', 'conflict', { requestId, payloadHash });
      return res.status(409).json({ error: 'An Idempotency-Key cannot be reused with different content.' });
    }
    agentAuditFromRequest(req, token, 'project.events.append', 'replayed', { requestId, payloadHash });
    res.setHeader('Idempotency-Replayed', 'true');
    return res.status(existing.status).json(existing.response);
  }
  if (!checkAgentWriteRate(token.id)) {
    agentAuditFromRequest(req, token, 'project.events.append', 'rate_limited', { requestId, payloadHash });
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  try {
    appendProjectEvent(rec, normalized.value, {
      actor: token.label,
      keyLabel: token.tokenPrefix,
      requestId,
    });
    const response = { ok: true, project: toApiProject(rec), requestId };
    saveAgentIdempotency({
      workspaceId: token.workspaceId,
      tokenId: token.id,
      action: 'project.events.append',
      key: requestId,
      requestHash: payloadHash,
      response,
      status: 201,
    });
    agentAuditFromRequest(req, token, 'project.events.append', 'ok', { requestId, payloadHash });
    return res.status(201).json(response);
  } catch (error) {
    agentAuditFromRequest(req, token, 'project.events.append', 'failed', { requestId, payloadHash });
    return res.status(error.statusCode || 500).json({ error: error.message || 'Write failed.' });
  }
});

api.use(requireAuth);

api.get('/profile/me', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const s = currentSession(req);
  const key = profileKey(s?.userId || s?.user, pair.workspace.id);
  const profile = listMemberProfiles().find((p) => p.key === key) || {};
  res.json({
    role: profile.role || '',
    seniority: profile.seniority || undefined,
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    domains: Array.isArray(profile.domains) ? profile.domains : [],
    teamRole: profile.teamRole || '',
    responsibilities: profile.responsibilities || '',
    boundaries: profile.boundaries || '',
    authority: profile.authority || '',
    capacity: profile.capacity || '',
    portfolio: Array.isArray(profile.portfolio) ? profile.portfolio : [],
    bio: profile.bio || '',
    completeness: profile.completeness || 0,
    autoNote: profile.autoNote || '',
    importDraft: profile.importDraft || null,
    updatedAt: profile.updatedAt || '',
  });
});

api.put('/profile/me', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const s = currentSession(req);
  const key = profileKey(s?.userId || s?.user, pair.workspace.id);
  const rows = listMemberProfiles();
  const idx = rows.findIndex((p) => p.key === key);
  const clean = sanitizeProfile(req.body || {});
  const rec = {
    ...(idx >= 0 ? rows[idx] : {}),
    ...clean,
    key,
    userId: s?.userId || s?.user || '',
    workspaceId: pair.workspace.id,
    completeness: profileCompleteness(clean),
    updatedAt: now(),
  };
  if (idx >= 0) rows[idx] = rec;
  else rows.unshift({ ...rec, createdAt: now() });
  saveMemberProfiles(rows);
  res.json({ ok: true, profile: rec });
});

api.post('/profile/import', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const s = currentSession(req);
  const payload = req.body?.profile || req.body || {};
  const clean = sanitizeProfile(payload);
  if (!clean.role && !clean.skills.length && !clean.domains.length && !clean.bio) {
    return res.status(400).json({ error: 'The imported profile is empty.' });
  }
  const key = profileKey(s?.userId || s?.user, pair.workspace.id);
  const rows = listMemberProfiles();
  const idx = rows.findIndex((p) => p.key === key);
  const draft = {
    ...clean,
    completeness: profileCompleteness(clean),
    status: 'pending',
    sourceName: String(req.body?.sourceName || req.body?.source || 'AI-generated profile').trim().slice(0, 80),
    note: String(req.body?.note || '').trim().slice(0, 500),
    importedAt: now(),
  };
  const rec = {
    ...(idx >= 0 ? rows[idx] : {}),
    key,
    userId: s?.userId || s?.user || '',
    workspaceId: pair.workspace.id,
    importDraft: draft,
    updatedAt: now(),
  };
  if (idx >= 0) rows[idx] = rec;
  else rows.unshift({ ...rec, createdAt: now() });
  saveMemberProfiles(rows);
  res.status(201).json({ ok: true, requiresConfirmation: true, draft });
});

api.post('/profile/import/apply', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const s = currentSession(req);
  const key = profileKey(s?.userId || s?.user, pair.workspace.id);
  const rows = listMemberProfiles();
  const idx = rows.findIndex((p) => p.key === key);
  const current = idx >= 0 ? rows[idx] : null;
  if (!current?.importDraft) return res.status(404).json({ error: 'No profile draft is waiting for confirmation.' });
  const clean = sanitizeProfile(current.importDraft);
  const rec = {
    ...current,
    ...clean,
    importDraft: null,
    completeness: profileCompleteness(clean),
    updatedAt: now(),
  };
  rows[idx] = rec;
  saveMemberProfiles(rows);
  res.json({ ok: true, profile: rec });
});

api.get('/workspaces', (req, res) => {
  const s = currentSession(req);
  const currentId = currentWorkspaceId(req);
  res.json(userMemberships(s).map(({ workspace, membership }) => workspaceSummary(workspace, membership, currentId)));
});

api.get('/workspaces/current', (req, res) => {
  const pair = currentWorkspacePair(req);
  if (!pair) return res.status(404).json({ error: 'No workspace is available.' });
  res.json(workspaceSummary(pair.workspace, pair.membership, pair.workspace.id));
});

api.get('/workspaces/current/connections', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  res.json({
    workspace: workspaceSummary(pair.workspace, pair.membership, pair.workspace.id),
    kb: {
      baseUrl: workspaceKbBaseUrl(pair.workspace),
      legacyBaseUrl: pair.workspace.id === DEFAULT_WORKSPACE_ID ? `${PUBLIC_BASE}/api/kb/v1` : null,
    },
  });
});

api.post('/workspaces/switch', (req, res) => {
  const s = currentSession(req);
  const id = String(req.body?.id || '').trim();
  const pair = userMemberships(s).find((x) => x.workspace.id === id);
  if (!pair) return res.status(404).json({ error: 'You are not a member of this workspace.' });
  if (pair.workspace.status !== 'active') return res.status(403).json({ error: 'The workspace is pending approval or suspended.' });
  s.currentWorkspaceId = id;
  res.json({ ok: true, workspace: workspaceSummary(pair.workspace, pair.membership, id) });
});

api.post('/workspaces', (req, res) => {
  const s = currentSession(req);
  const nameCheck = validateWorkspaceName(req.body?.name);
  if (!nameCheck.ok) return res.status(409).json({ error: nameCheck.error });
  if (!s.userId || ['dev', 'env-admin'].includes(s.userId)) return res.status(400).json({ error: 'Use a registered account to create a workspace.' });
  const ws = createWorkspace({ name: nameCheck.name, ownerUserId: s.userId, status: 'active' });
  const m = membershipOf(s.userId, ws.id);
  res.status(201).json(workspaceSummary(ws, m, currentWorkspaceId(req)));
});

function legacyRoleForMembership(membership) {
  return ['owner', 'admin'].includes(membership?.role) ? 'admin' : 'member';
}

function workspaceMemberView(user, membership, session = null) {
  const global = publicUser(user) || { id: membership.userId, username: membership.userId };
  return {
    ...global,
    id: membership.userId,
    userId: membership.userId,
    displayName: user?.displayName || user?.username || membership.userId,
    email: user?.email || '',
    role: legacyRoleForMembership(membership),
    membershipRole: membership.role,
    active: membership.active !== false,
    remark: membership.remark || '',
    self: Boolean(session?.userId && session.userId === membership.userId),
  };
}

function activeWorkspaceOwnerCount(workspaceId) {
  return membershipsForWorkspace(workspaceId).filter((m) => m.role === 'owner' && m.active !== false).length;
}

function canMutateMembership(pair, target) {
  if (pair.membership?.role === 'owner') return true;
  return pair.membership?.role === 'admin' && target.role !== 'owner';
}

function assertMembershipMutation(req, res, pair, target) {
  if (!canMutateMembership(pair, target)) {
    res.status(403).json({ error: 'You cannot modify this membership.' });
    return false;
  }
  if (target.role === 'owner' && target.active !== false && activeWorkspaceOwnerCount(pair.workspace.id) <= 1) {
    res.status(400).json({ error: 'The workspace must retain at least one active owner.' });
    return false;
  }
  return true;
}

api.get('/workspaces/current/members', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const session = currentSession(req);
  const rows = membershipsForWorkspace(pair.workspace.id).map((m) => {
    const view = workspaceMemberView(getUser(m.userId), m, session);
    return { ...view, role: m.role };
  });
  res.json(rows);
});

api.delete('/workspaces/current/members/:userId', requireWorkspaceRole(['owner', 'admin']), (req, res) => {
  const pair = currentWorkspacePair(req);
  const target = membershipOf(req.params.userId, pair.workspace.id);
  if (!target) return res.status(404).json({ error: 'Member not found.' });
  if (!assertMembershipMutation(req, res, pair, target)) return;
  removeMembership(pair.workspace.id, target.userId);
  res.json({ ok: true });
});

api.post('/workspaces/current/members/:userId/remark', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const session = currentSession(req);
  const target = membershipOf(req.params.userId, pair.workspace.id);
  if (!target) return res.status(404).json({ error: 'Member not found.' });
  const self = session?.userId === target.userId;
  if (!self && !canMutateMembership(pair, target)) return res.status(403).json({ error: 'You cannot modify this member note.' });
  const membership = updateMembership(pair.workspace.id, target.userId, { remark: req.body?.remark || '' });
  res.json({ ok: true, member: workspaceMemberView(getUser(target.userId), membership, session) });
});

api.get('/workspaces/current/invite', requireWorkspaceRole(['owner', 'admin']), (req, res) => {
  const pair = currentWorkspacePair(req);
  const code = pair.workspace.inviteCode;
  res.json({ code, url: `${PUBLIC_BASE}/register?invite=${encodeURIComponent(code)}` });
});

api.post('/workspaces/current/invite/rotate', requireWorkspaceRole(['owner', 'admin']), (req, res) => {
  const pair = currentWorkspacePair(req);
  const ws = rotateWorkspaceInvite(pair.workspace.id);
  res.json({ code: ws.inviteCode, url: `${PUBLIC_BASE}/register?invite=${encodeURIComponent(ws.inviteCode)}` });
});

api.get('/workspaces/current/requests', requireWorkspaceRole(['owner', 'admin']), (req, res) => {
  const pair = currentWorkspacePair(req);
  const rows = joinRequestsForWorkspace(pair.workspace.id, 'pending')
    .map((request) => {
      const user = getUser(request.userId);
      if (!user?.active) return null;
      return {
        id: request.id,
        userId: request.userId,
        displayName: user.displayName || user.username,
        email: user.email || '',
        status: request.status,
        createdAt: request.createdAt,
      };
    })
    .filter(Boolean);
  res.json(rows);
});

api.post('/workspaces/current/requests/:requestId/review', requireWorkspaceRole(['owner', 'admin']), (req, res) => {
  const pair = currentWorkspacePair(req);
  const session = currentSession(req);
  const request = getWorkspaceJoinRequest(req.params.requestId);
  if (!request || request.workspaceId !== pair.workspace.id || request.status !== 'pending') {
    return res.status(404).json({ error: 'Join request not found or already reviewed.' });
  }
  const user = getUser(request.userId);
  if (!user?.active) return res.status(404).json({ error: 'The requesting account does not exist or is inactive.' });

  const approve = req.body?.approve === true;
  if (approve) {
    const membership = addMembership({ workspaceId: pair.workspace.id, userId: request.userId, role: 'member' });
    if (!membership) return res.status(503).json({ error: USER_SAFE_SERVICE_ERROR });
  }
  const reviewed = reviewWorkspaceJoinRequest(request.id, {
    approve,
    reviewedByUserId: session?.userId || '',
  });
  if (!reviewed) return res.status(409).json({ error: 'This request has already been reviewed. Refresh and try again.' });
  res.json({ ok: true, status: reviewed.status });
});

function listMemberProfiles() {
  const rows = readDataFile(MEMBER_PROFILES_FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function saveMemberProfiles(rows) {
  writeDataFile(MEMBER_PROFILES_FILE, rows);
}

function profileKey(userId, workspaceId) {
  return `${workspaceId || DEFAULT_WORKSPACE_ID}:${userId || ''}`;
}

function profileCompleteness(p = {}) {
  const fields = ['role', 'responsibilities', 'boundaries', 'authority', 'capacity', 'bio'];
  let score = fields.reduce((sum, key) => sum + (String(p[key] || '').trim() ? 10 : 0), 0);
  if (Number(p.seniority) > 0) score += 10;
  if (Array.isArray(p.skills) && p.skills.length > 0) score += 15;
  if (Array.isArray(p.domains) && p.domains.length > 0) score += 10;
  if (String(p.teamRole || '').trim()) score += 5;
  return Math.min(100, score);
}

function sanitizeProfileSkills(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item) => {
      if (typeof item === 'string') {
        const name = item.trim();
        return name ? { name: name.slice(0, 80), level: 3, kind: 'technical' } : null;
      }
      const name = String(item?.name || item?.skill || '').trim();
      if (!name) return null;
      const level = Math.max(1, Math.min(5, Math.round(Number(item?.level || item?.proficiency || 3))));
      const kind = item?.kind === 'essential' ? 'essential' : 'technical';
      const evidence = String(item?.evidence || '').trim().slice(0, 300);
      return { name: name.slice(0, 80), level, kind, ...(evidence ? { evidence } : {}) };
    })
    .filter(Boolean)
    .slice(0, 40);
}

function sanitizeStringList(value, max = 30, len = 80) {
  return (Array.isArray(value) ? value : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .map((x) => x.slice(0, len))
    .slice(0, max);
}

function sanitizeProfile(input = {}) {
  const seniority = Number(input.seniority);
  const teamRole = ['action', 'people', 'thought'].includes(input.teamRole) ? input.teamRole : '';
  return {
    role: String(input.role || '').trim().slice(0, 80),
    seniority: Number.isFinite(seniority) ? Math.max(1, Math.min(5, Math.round(seniority))) : undefined,
    skills: sanitizeProfileSkills(input.skills),
    domains: sanitizeStringList(input.domains, 30, 80),
    teamRole,
    responsibilities: String(input.responsibilities || '').trim().slice(0, 2000),
    boundaries: String(input.boundaries || '').trim().slice(0, 2000),
    authority: String(input.authority || '').trim().slice(0, 2000),
    capacity: String(input.capacity || '').trim().slice(0, 300),
    portfolio: sanitizeStringList(input.portfolio, 20, 300),
    bio: String(input.bio || '').trim().slice(0, 500),
  };
}

function aiUsageTokens(usage, fallback = 0) {
  const total = Number(usage?.total_tokens ?? usage?.totalTokens ?? 0);
  if (Number.isFinite(total) && total > 0) return Math.ceil(total);
  const input = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
  const output = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
  if (Number.isFinite(input + output) && input + output > 0) return Math.ceil(input + output);
  return Math.ceil(Number(fallback) || 0);
}

function billAiUsage(req, feature, usage, fallbackTokens, extra = {}) {
  aiUsageTokens(usage, fallbackTokens);
  return null;
}

function sinceIso(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function userWorkspacesSummary(userId) {
  return membershipsForUser(userId)
    .map((m) => ({ membership: m, workspace: getWorkspace(m.workspaceId) }))
    .filter((x) => x.workspace);
}

// Member management and knowledge-base API keys are enforced for workspace administrators here.
api.use(['/users', '/kb-keys'], requireRole('admin'));

// List projects.
api.get('/projects', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  res.json(filterByCurrentWorkspace(req, listProjects()).filter((rec) => !isDeletedProject(rec)).map(toApiProject));
});

// Read one project.
api.get('/projects/:id', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec) || isDeletedProject(rec)) return res.status(404).json({ error: 'Project not found.' });
  res.json(toApiProject(rec));
});

// Project audit history from the Git log.
api.get('/projects/:id/log', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec) || isDeletedProject(rec)) return res.status(404).json({ error: 'Project not found.' });
  const log = readLog(repoDirOf(rec.id)).map((e) => ({ ...e, projectId: rec.id }));
  res.json(log);
});

// Creating a project initializes its repository, project record, and first commit.
api.post('/projects', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const session = currentSession(req);
  const { name, kickoff, ownerName } = req.body || {};
  if (!name || !kickoff?.forWhom || !kickoff?.goal) {
    return res.status(400).json({ error: 'Project name, intended user, and goal are required.' });
  }

  const id = makeId(name);
  const dir = repoDirOf(id);
  if (fs.existsSync(dir)) return res.status(409).json({ error: 'A repository with this ID already exists. Choose another name.' });

  const acceptance = Array.isArray(kickoff.acceptance)
    ? kickoff.acceptance.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const kc = { forWhom: kickoff.forWhom, goal: kickoff.goal, acceptance, notDoing: kickoff.notDoing || '' };

  initRepo(dir);
  writeFile(dir, 'PROJECT.md', projectMd(name, kc, ownerName));
  writeFile(dir, 'AGENTS.md', AGENTS_MD);
  writeFile(dir, 'PROGRESS.md', progressMd(0));
  writeFile(dir, 'ISSUES/.gitkeep', '');
  writeFile(dir, 'HANDOFF.md', '# Handoff\n\nThis file will be updated from project goals, progress, rules, known issues, and the next action during a handoff.\n');
  commit(dir, {
    subject: 'Initialize project record and acceptance context',
    actor: session?.displayName || session?.user || 'Project owner',
    progressFrom: 0,
    progressTo: 0,
  });

  const rec = {
    id,
    name,
    kickoff: kc,
    status: 'active',
    progress: 0,
    repoPath: dir,
    keyName: null,
    ownerName: ownerName || null,
    ownerUserId: session?.userId || null,
    nextStep: 'Complete and verify the first acceptance slice',
    workspaceId: pair.workspace.id,
    createdAt: now(),
    updatedAt: now(),
  };
  saveProject(rec);
  res.status(201).json(toApiProject(rec));
});

// Edit the name, kickoff card, owner, or next step. Kickoff changes rewrite PROJECT.md and add an audit commit.
api.put('/projects/:id', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec) || isDeletedProject(rec)) return res.status(404).json({ error: 'Project not found.' });
  if (!assertProjectManager(req, res, rec)) return;
  const { name, kickoff, ownerName, nextStep } = req.body || {};
  let kickoffChanged = false;
  if (name && name.trim()) rec.name = name.trim();
  if (kickoff) {
    const acceptance = Array.isArray(kickoff.acceptance)
      ? kickoff.acceptance.map((s) => String(s).trim()).filter(Boolean)
      : rec.kickoff.acceptance;
    rec.kickoff = {
      forWhom: kickoff.forWhom ?? rec.kickoff.forWhom,
      goal: kickoff.goal ?? rec.kickoff.goal,
      acceptance,
      notDoing: kickoff.notDoing ?? rec.kickoff.notDoing,
    };
    kickoffChanged = true;
  }
  if (ownerName !== undefined) rec.ownerName = ownerName || null;
  if (nextStep !== undefined) rec.nextStep = nextStep || null;
  rec.updatedAt = now();
  saveProject(rec);
  if (kickoffChanged) {
    const dir = repoDirOf(rec.id);
    writeFile(dir, 'PROJECT.md', projectMd(rec.name, rec.kickoff, rec.ownerName));
    commit(dir, { subject: 'Update kickoff card', actor: rec.ownerName || 'System' });
  }
  res.json(toApiProject(rec));
});

// Deleting a project moves it to recoverable state while preserving its repository and audit evidence.
api.delete('/projects/:id', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec) || isDeletedProject(rec)) return res.status(404).json({ error: 'Project not found.' });
  if (!assertProjectManager(req, res, rec)) return;
  try {
    setProjectKey(rec.id, '', pair.workspace.id); // Unbind only the key in this workspace.
  } catch {
    /* The project key is still invalidated immediately if legacy persistence is unavailable. */
  }
  for (const token of listAgentTokens(pair.workspace.id, rec.id)) {
    if (token.status === 'active') {
      revokeAgentToken(pair.workspace.id, token.id);
      addAgentAudit({
        workspaceId: pair.workspace.id,
        projectId: rec.id,
        tokenId: token.id,
        tokenLabel: token.label,
        action: 'agent.credential.revoke',
        outcome: 'project_deleted',
      });
    }
  }
  const session = currentSession(req);
  commit(repoDirOf(rec.id), { subject: 'Move to trash and revoke external access', actor: session?.displayName || 'System' });
  rec.statusBeforeDelete = rec.status;
  rec.status = 'deleted';
  rec.deletedAt = now();
  rec.deletedBy = session?.userId || session?.user || '';
  rec.keyName = null;
  rec.projectKeyHash = null;
  rec.projectKeyPrefix = null;
  rec.nextStep = 'This project is in the trash and can be restored by its owner or a workspace administrator.';
  rec.updatedAt = now();
  saveProject(rec);
  res.json({ ok: true, recoverable: true, projectId: rec.id });
});

api.post('/projects/:id/restore', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec || !belongsToCurrentWorkspace(req, rec) || !isDeletedProject(rec)) {
    return res.status(404).json({ error: 'Project not found in the trash.' });
  }
  if (!assertProjectManager(req, res, rec)) return;
  const session = currentSession(req);
  rec.status = rec.statusBeforeDelete === 'done' ? 'done' : 'active';
  delete rec.statusBeforeDelete;
  delete rec.deletedAt;
  delete rec.deletedBy;
  rec.nextStep = 'The project was restored. Create a new short-lived AI credential before reconnecting an agent.';
  rec.updatedAt = now();
  saveProject(rec);
  commit(repoDirOf(rec.id), { subject: 'Restore project from trash', actor: session?.displayName || 'System' });
  res.json({ ok: true, project: toApiProject(rec) });
});

// Project API secret: scoped to one project repository and its progress events.
api.get('/projects/:id/project-connection', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec) || isDeletedProject(rec)) return res.status(404).json({ error: 'Project not found.' });
  res.json(projectConnection(rec));
});

api.get('/projects/:id/agent-tokens', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec || !belongsToWorkspace(rec, pair.workspace.id) || isDeletedProject(rec)) {
    return res.status(404).json({ error: 'Project not found.' });
  }
  if (!assertProjectManager(req, res, rec)) return;
  res.json(listAgentTokens(pair.workspace.id, rec.id));
});

api.post('/projects/:id/agent-tokens', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec || !belongsToWorkspace(rec, pair.workspace.id) || isDeletedProject(rec)) {
    return res.status(404).json({ error: 'Project not found.' });
  }
  if (!assertProjectManager(req, res, rec)) return;
  const session = currentSession(req);
  const created = createAgentToken({
    workspaceId: pair.workspace.id,
    projectId: rec.id,
    label: req.body?.label,
    expiresInHours: req.body?.expiresInHours,
    createdBy: session?.userId || session?.user || '',
  });
  addAgentAudit({
    workspaceId: pair.workspace.id,
    projectId: rec.id,
    tokenId: created.credential.id,
    tokenLabel: created.credential.label,
    action: 'agent.credential.create',
    outcome: 'ok',
  });
  res.status(201).json({
    ...created,
    baseUrl: PUBLIC_BASE,
    projectId: rec.id,
    mcpPackage: MCP_PACKAGE,
  });
});

api.delete('/projects/:id/agent-tokens/:tokenId', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec || !belongsToWorkspace(rec, pair.workspace.id) || isDeletedProject(rec)) {
    return res.status(404).json({ error: 'Project not found.' });
  }
  if (!assertProjectManager(req, res, rec)) return;
  const token = listAgentTokens(pair.workspace.id, rec.id).find((item) => item.id === req.params.tokenId);
  if (!token) return res.status(404).json({ error: 'AI credential not found.' });
  const revoked = revokeAgentToken(pair.workspace.id, token.id);
  addAgentAudit({
    workspaceId: pair.workspace.id,
    projectId: rec.id,
    tokenId: token.id,
    tokenLabel: token.label,
    action: 'agent.credential.revoke',
    outcome: 'ok',
  });
  res.json({ ok: true, credential: revoked });
});

api.get('/projects/:id/agent-audit', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec || !belongsToWorkspace(rec, pair.workspace.id) || isDeletedProject(rec)) {
    return res.status(404).json({ error: 'Project not found.' });
  }
  if (!assertProjectManager(req, res, rec)) return;
  res.json(listAgentAudit(pair.workspace.id, rec.id, req.query.limit));
});

// Rotate the legacy project key. Plaintext is returned only in this response.
api.post('/projects/:id/project-key/rotate', requireRole('admin'), (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec) || isDeletedProject(rec)) return res.status(404).json({ error: 'Project not found.' });
  const projectKey = rotateProjectSecret(rec);
  res.json({
    ok: true,
    project: toApiProject(rec),
    connection: projectConnection(rec),
    projectKey,
    bootText: projectBootText(rec, projectKey),
  });
});

// Append one human-authenticated project event. AI clients use project-scoped credentials instead.
api.post('/projects/:id/events', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec)) return res.status(404).json({ error: 'Project not found.' });

  const { message, progressFrom, progressTo, nextStep } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message is required.' });
  const session = currentSession(req);
  const who = session?.displayName || session?.user || 'Member';
  appendProjectEvent(rec, { message, progressFrom, progressTo, nextStep }, { actor: who });
  res.status(201).json({ ok: true, project: toApiProject(rec) });
});

// Preview a handoff package and agent boot prompt without persisting changes.
api.get('/projects/:id/handoff-package', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec)) return res.status(404).json({ error: 'Project not found.' });
  res.json({
    package: buildHandoffPackage(rec, req.query.note, req.query.to),
    bootPrompt: buildBootPrompt(rec),
    cloneUrl: repoUrlOf(rec.id),
  });
});

// Perform a lossless handoff: rebind the key, change owner, write HANDOFF.md, and append an audit commit.
api.post('/projects/:id/handoff', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec)) return res.status(404).json({ error: 'Project not found.' });
  if (!assertProjectManager(req, res, rec)) return;
  const { toKeyName, toOwnerName, note } = req.body || {};
  if (!toKeyName && !toOwnerName) {
    return res.status(400).json({ error: 'Specify a new owner or a key.' });
  }

  let boundKey = null;
  if (toKeyName) {
    boundKey = findKey(toKeyName, pair.workspace.id);
    if (!boundKey) return res.status(400).json({ error: 'The key does not exist or is disabled.' });
    setProjectKey(rec.id, boundKey.name, pair.workspace.id);
    rec.keyName = boundKey.name;
  }
  const fromOwner = rec.ownerName;
  const newOwner = toOwnerName || boundKey?.ownerName || rec.ownerName;
  rec.ownerName = newOwner;

  const dir = repoDirOf(rec.id);
  const pkg = buildHandoffPackage(rec, note, newOwner);
  writeFile(dir, 'HANDOFF.md', pkg);
  commit(dir, {
    subject: `Handoff: ${fromOwner || 'none'} -> ${newOwner || 'none'}${toKeyName ? ` (key -> ${toKeyName})` : ''}`,
    actor: 'System',
  });
  rec.updatedAt = now();
  saveProject(rec);

  res.json({
    ok: true,
    project: toApiProject(rec),
    package: pkg,
    bootPrompt: buildBootPrompt(rec),
    cloneUrl: repoUrlOf(rec.id),
  });
});

// Read the complete handoff context through the legacy project key endpoint.
api.get('/projects/:id/context', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec)) return res.status(404).json({ error: 'Project not found.' });
  const key = req.get('x-project-key');
  if (key && !verifyProjectSecret(rec, String(key))) return res.status(403).json({ error: 'Invalid project key.' });
  res.json(projectContextPayload(rec));
});

function agentKeysForWorkspace(req) {
  const wid = currentWorkspaceId(req);
  return listKeys().filter((k) => belongsToWorkspace(k, wid));
}

// Agent key metadata for handoff flows. Full provider secrets are never returned.
api.get('/keys', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  res.json(
    agentKeysForWorkspace(req).map((k) => ({
      name: k.name,
      ownerName: k.ownerName,
      projectId: k.projectId ?? null,
      status: k.status,
      keyPrefix: k.keyPrefix ?? null,
      slug: k.slug ?? null,
      endpoint: k.endpoint ?? null,
      lastUsedAt: k.lastUsedAt ?? null,
    })),
  );
});

// ---------------- Knowledge base ----------------

const CAUTION_TYPES = ['Pitfall', 'Lesson', 'Rule'];

function scoreKnowledge(entry, text) {
  const hay = text.toLowerCase();
  let score = 0;
  for (const tag of entry.tags || []) {
    if (tag && hay.includes(String(tag).toLowerCase())) score += 2;
  }
  if (entry.businessLine && hay.includes(String(entry.businessLine).toLowerCase())) score += 2;
  if (entry.title) {
    for (const w of String(entry.title).split(/[\s,，、/]+/)) {
      if (w.length >= 2 && hay.includes(w.toLowerCase())) score += 1;
    }
  }
  return score;
}

// List and search knowledge.
api.get('/knowledge', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const { q, type, businessLine } = req.query;
  let items = filterByCurrentWorkspace(req, listKnowledge());
  if (type) items = items.filter((k) => k.type === type);
  if (businessLine) items = items.filter((k) => k.businessLine === businessLine);
  if (q) {
    const s = String(q).toLowerCase();
    items = items.filter(
      (k) =>
        (k.aiTitle && k.aiTitle.toLowerCase().includes(s)) ||
        (k.aiSummary && k.aiSummary.toLowerCase().includes(s)) ||
        (k.aiDetail && k.aiDetail.toLowerCase().includes(s)) ||
        (k.title && k.title.toLowerCase().includes(s)) ||
        (k.body && k.body.toLowerCase().includes(s)) ||
        (k.tags || []).some((t) => String(t).toLowerCase().includes(s)),
    );
  }
  res.json(items.slice(0, 200));
});

api.post('/knowledge/:id/organize', async (req, res) => {
  try {
    const pair = assertActiveWorkspace(req, res);
    if (!pair) return;
    const items = listKnowledge();
    const idx = items.findIndex((k) => k.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Knowledge entry not found.' });
    if (!belongsToCurrentWorkspace(req, items[idx])) return res.status(404).json({ error: 'Knowledge entry not found.' });
    const organized = await organizeKnowledgeItem(items[idx]);
    items[idx] = organized;
    saveKnowledge(items);
    billAiUsage(req, 'knowledge_organize', null, AI_TOKEN_ESTIMATES.knowledge_organize, {
      targetType: 'knowledge',
      targetId: organized.id,
      targetName: knowledgeTitle(organized),
      meta: { mode: 'manual-single' },
    });
    res.json(organized);
  } catch (e) {
    serviceError(res, e, 'knowledge:organize');
  }
});

api.post('/knowledge/organize-batch', async (req, res) => {
  try {
    const pair = assertActiveWorkspace(req, res);
    if (!pair) return;
    const limit = Math.min(Math.max(Number(req.body?.limit ?? 20), 1), 100);
    const force = req.body?.force === true;
    const result = await organizeKnowledgeBacklog({ limit, force, workspaceId: pair.workspace.id });
    res.json(result);
  } catch (e) {
    serviceError(res, e, 'knowledge:organize-batch');
  }
});

api.get('/knowledge/organize-status', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const items = filterByCurrentWorkspace(req, listKnowledge());
  const pending = items.filter(needsKnowledgeOrganization).length;
  const failed = items.filter((k) => k.organizeStatus === 'error').length;
  res.json({
    total: items.length,
    organized: items.length - pending,
    pending,
    failed,
    running: knowledgeAutoQueue.running,
    scheduled: knowledgeAutoQueue.scheduled,
    lastRunAt: knowledgeAutoQueue.lastRunAt ? new Date(knowledgeAutoQueue.lastRunAt).toISOString() : null,
  });
});

// Return the most relevant pitfalls, lessons, and rules for new-project context.
api.get('/knowledge/match', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const text = String(req.query.text || '');
  if (!text.trim()) return res.json([]);
  const hits = filterByCurrentWorkspace(req, listKnowledge())
    .filter((k) => CAUTION_TYPES.includes(k.type))
    .map((k) => ({ k, score: scoreKnowledge(k, text) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.k);
  res.json(hits);
});

// Add one knowledge entry manually.
api.post('/knowledge', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const { type, title, body, tags, businessLine, visibility, status, aiTitle, aiSummary, aiDetail } = req.body || {};
  if (!type || !title) return res.status(400).json({ error: 'type and title are required.' });
  const rec = addKnowledge({
    type,
    title,
    body: body || '',
    tags: Array.isArray(tags) ? tags : [],
    businessLine: businessLine || 'Uncategorized',
    source: 'Manual',
    workspaceId: pair.workspace.id,
    visibility: visibility === 'public' ? 'public' : 'internal',
    status: status === 'draft' ? 'draft' : 'published',
    aiTitle: aiTitle || undefined,
    aiSummary: aiSummary || undefined,
    aiDetail: aiDetail || undefined,
  });
  scheduleKnowledgeAutoOrganize('manual-write', pair.workspace.id);
  res.status(201).json(rec);
});

api.post('/knowledge/export', async (req, res) => {
  try {
    const pair = assertActiveWorkspace(req, res);
    if (!pair) return;
    const { q, type, businessLine, ids, visibility, status, title } = req.body || {};
    const items = filterKnowledge(filterByCurrentWorkspace(req, listKnowledge()), { q, type, businessLine, ids, visibility, status }).slice(0, 300);
    if (!items.length) return res.status(400).json({ error: 'There are no knowledge entries to export.' });
    const pdf = await knowledgePdfBuffer({
      title: title || 'Team Knowledge Export',
      items,
      generatedAt: new Date(),
    });
    const filename = encodeURIComponent(`team-knowledge-${new Date().toISOString().slice(0, 10)}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(pdf);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message || 'Export failed.' });
  }
});

api.post('/ai/assist', async (req, res) => {
  try {
    const { field, draft } = req.body || {};
    const ai = await callAIWithUsage(
      [
        {
          role: 'system',
          content:
            'You are a project kickoff assistant. Rewrite the user input into clear, executable, testable English. Return JSON only.',
        },
        {
          role: 'user',
          content: [
            'Complete or improve the requested field using the current draft.',
            'Return JSON: {"text":"single field value","items":["acceptance criterion 1","acceptance criterion 2"]}',
            `Field: ${field || 'goal'}`,
            `Draft: ${JSON.stringify(draft || {})}`,
          ].join('\n'),
        },
      ],
      { json: true, temperature: 0.3 },
    );
    const parsed = parseAIJson(ai.content);
    billAiUsage(req, 'ai_assist', ai.usage, AI_TOKEN_ESTIMATES.ai_assist, {
      targetType: 'project-draft',
      targetName: String(field || 'Kickoff card'),
      meta: { field: String(field || '') },
    });
    res.json({
      text: parsed.text ? String(parsed.text) : '',
      items: Array.isArray(parsed.items) ? parsed.items.map((x) => String(x)).filter(Boolean).slice(0, 8) : [],
    });
  } catch (e) {
    serviceError(res, e, 'ai:assist');
  }
});

function listFrom(value) {
  return (Array.isArray(value) ? value : [value]).map((x) => String(x || '').trim()).filter(Boolean);
}

function normalizeRetroAnswers(body = {}) {
  return {
    uncertainties: listFrom(body.uncertainties),
    omissions: listFrom(body.omissions),
    failureRisks: listFrom(body.failureRisks),
    leadingFeatures: listFrom(body.leadingFeatures),
    betterWays: listFrom(body.betterWays),
    wins: listFrom(body.wins),
    pitfalls: listFrom(body.pitfalls),
    improvements: listFrom(body.improvements),
  };
}

function retroKnowledgeEntries(rec, answers) {
  const bl = rec.kickoff.forWhom || rec.name;
  const baseTags = [rec.name, rec.kickoff.forWhom, 'project-retrospective'].filter(Boolean);
  const rows = [
    ['Lesson', 'Uncertainties', answers.uncertainties],
    ['Lesson', 'Largest omissions', answers.omissions],
    ['Lesson', 'Three-month durability risks', answers.failureRisks],
    ['Method', 'Leading feature ideas', answers.leadingFeatures],
    ['Method', 'More efficient approaches', answers.betterWays],
    ['Experience', 'What worked', answers.wins],
    ['Pitfall', 'Failure lessons', answers.pitfalls],
    ['Method', 'Improvements', answers.improvements],
  ];
  return rows.flatMap(([type, group, items]) =>
    items.map((title) => ({
      type,
      title,
      body: `From the closure retrospective for "${rec.name}" - ${group}`,
      tags: [...baseTags, group],
      businessLine: bl,
      source: 'Retrospective',
      projectId: rec.id,
      visibility: 'internal',
      status: 'published',
      ownerName: rec.ownerName || '',
    })),
  );
}

api.get('/projects/:id/retro-summary', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec)) return res.status(404).json({ error: 'Project not found.' });
  const file = path.join(repoDirOf(rec.id), 'RETROSPECTIVE.md');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'No closure retrospective has been recorded.' });
  res.json({ summary: fs.readFileSync(file, 'utf8') });
});

api.post('/projects/:id/retro/ai-draft', async (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec)) return res.status(404).json({ error: 'Project not found.' });
  const recentLog = readLog(repoDirOf(rec.id)).slice(0, 40);
  try {
    const ai = await callAIWithUsage(
      [
        {
          role: 'system',
          content:
            'You are a project retrospective coach. Draft a rigorous closure retrospective from the project record and Git evidence. Return JSON only, with no commentary.',
        },
        {
          role: 'user',
          content: [
            'Return JSON in which every field is an array of strings:',
            '{"uncertainties":[],"omissions":[],"failureRisks":[],"leadingFeatures":[],"betterWays":[],"wins":[],"pitfalls":[],"improvements":[]}',
            '',
            `Project: ${rec.name}`,
            `Intended user: ${rec.kickoff.forWhom || ''}`,
            `Goal: ${rec.kickoff.goal || ''}`,
            `Acceptance criteria: ${(rec.kickoff.acceptance || []).join('; ')}`,
            `Out of scope: ${rec.kickoff.notDoing || ''}`,
            `Current progress: ${rec.progress}%`,
            '',
            'Recent audit events:',
            recentLog.map((e) => `- ${e.at} - ${e.actor} - ${e.message}`).join('\n') || '(none)',
            '',
            'Provide 1 to 4 specific, reusable items per field that are suitable for the knowledge base. Avoid generic statements.',
          ].join('\n'),
        },
      ],
      { json: true, temperature: 0.25 },
    );
    const parsed = normalizeRetroAnswers(parseAIJson(ai.content));
    billAiUsage(req, 'retro_ai_draft', ai.usage, AI_TOKEN_ESTIMATES.retro_ai_draft, {
      targetType: 'project',
      targetId: rec.id,
      targetName: rec.name,
    });
    res.json({ draft: parsed });
  } catch (e) {
    serviceError(res, e, 'retro:ai-draft');
  }
});

// Closure writes RETROSPECTIVE.md, adds reusable knowledge, marks the project done, and appends an audit commit.
api.post('/projects/:id/retro', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const rec = getProject(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Project not found.' });
  if (!belongsToCurrentWorkspace(req, rec)) return res.status(404).json({ error: 'Project not found.' });
  if (!assertProjectManager(req, res, rec)) return;
  const session = currentSession(req);
  const answers = normalizeRetroAnswers(req.body || {});
  const created = retroKnowledgeEntries(rec, answers).map((entry) => addKnowledge({ ...entry, workspaceId: pair.workspace.id }));
  scheduleKnowledgeAutoOrganize('retro-write', pair.workspace.id);

  // Persist the retrospective in the repository and append its audit event.
  const dir = repoDirOf(rec.id);
  writeFile(dir, 'RETROSPECTIVE.md', retroSummaryMd({ rec, answers }));
  writeFile(dir, 'PROGRESS.md', progressMd(100));
  commit(dir, {
    subject: 'Close project after retrospective and knowledge capture',
    actor: session?.displayName || session?.user || 'Project owner',
  });

  rec.status = 'done';
  rec.progress = 100;
  rec.nextStep = 'Project closed. Review RETROSPECTIVE.md.';
  rec.updatedAt = now();
  saveProject(rec);
  res.status(201).json({ ok: true, project: toApiProject(rec), created });
});

// Knowledge-base API keys are restricted to workspace administrators.
api.get('/kb-keys', (_req, res) => {
  const wid = currentWorkspaceId(_req);
  res.json(listKbKeys().filter((k) => belongsToWorkspace(k, wid)).map(publicKbKey));
});
api.post('/kb-keys', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const { name, ownerName } = req.body || {};
  const created = createKbKey({ name, ownerName, workspaceId: pair.workspace.id });
  res.status(201).json(created);
});
api.delete('/kb-keys/:id', (req, res) => {
  const current = listKbKeys().find((k) => k.id === req.params.id);
  if (!current || !belongsToCurrentWorkspace(req, current)) return res.status(404).json({ error: 'Key not found.' });
  const key = revokeKbKey(req.params.id);
  if (!key) return res.status(404).json({ error: 'Key not found.' });
  res.json(key);
});
api.delete('/kb-keys/:id/destroy', (req, res) => {
  const current = listKbKeys().find((k) => k.id === req.params.id);
  if (!current || !belongsToCurrentWorkspace(req, current)) return res.status(404).json({ error: 'Key not found.' });
  const ok = removeKbKey(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Key not found.' });
  res.json({ ok: true });
});

// Workspace administrators may change only memberships in their workspace, never global accounts.
api.get('/users', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const session = currentSession(req);
  res.json(
    membershipsForWorkspace(pair.workspace.id).map((membership) =>
      workspaceMemberView(getUser(membership.userId), membership, session),
    ),
  );
});
api.post('/users', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  const u = addUser({ ...req.body, role: 'member' });
  if (!u) return res.status(409).json({ error: 'Username already exists.' });
  const membership = addMembership({
    workspaceId: pair.workspace.id,
    userId: u.id,
    role: isAdminRole(req.body?.role) ? 'admin' : 'member',
  });
  res.status(201).json(workspaceMemberView(u, membership, currentSession(req)));
});
api.put('/users/:id', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const target = getUser(req.params.id);
  const membership = target ? membershipOf(target.id, pair.workspace.id) : null;
  if (!target || !membership) return res.status(404).json({ error: 'User not found.' });
  if (!canMutateMembership(pair, membership)) return res.status(403).json({ error: 'You cannot modify this membership.' });
  const globalFields = ['username', 'displayName', 'email', 'password'];
  if (globalFields.some((field) => req.body?.[field] !== undefined)) {
    return res.status(403).json({ error: 'Workspace administrators cannot change global account, email, or password fields.' });
  }
  let nextRole = membership.role;
  if (req.body?.role !== undefined) {
    if (pair.membership?.role !== 'owner') return res.status(403).json({ error: 'Only a workspace owner can change member roles.' });
    if (!(membership.role === 'owner' && isAdminRole(req.body.role))) {
      nextRole = isAdminRole(req.body.role) ? 'admin' : 'member';
    }
  }
  const nextActive = req.body?.active === undefined ? membership.active !== false : Boolean(req.body.active);
  if (
    membership.role === 'owner' &&
    membership.active !== false &&
    (nextRole !== 'owner' || !nextActive) &&
    activeWorkspaceOwnerCount(pair.workspace.id) <= 1
  ) {
    return res.status(400).json({ error: 'The workspace must retain at least one active owner.' });
  }
  const updated = updateMembership(pair.workspace.id, target.id, { role: nextRole, active: nextActive });
  res.json(workspaceMemberView(target, updated, currentSession(req)));
});
api.delete('/users/:id', (req, res) => {
  const pair = assertActiveWorkspace(req, res);
  if (!pair) return;
  const target = getUser(req.params.id);
  const membership = target ? membershipOf(target.id, pair.workspace.id) : null;
  if (!target || !membership) return res.status(404).json({ error: 'User not found.' });
  if (!assertMembershipMutation(req, res, pair, membership)) return;
  removeMembership(pair.workspace.id, target.id);
  res.json({ ok: true });
});

app.use('/api', api);

// Optionally serve the frontend build for a single-host deployment.
const distDir = path.resolve(process.cwd(), '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`[git-kernel] listening on :${PORT}  data=${DATA_DIR}`);
  scheduleKnowledgeAutoOrganize('startup');
});
