import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const testDir = path.dirname(fileURLToPath(import.meta.url));

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await wait(100);
  }
  throw new Error('server did not become ready');
}

async function runNode(args, { cwd = testDir, env = {} } = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const code = await new Promise((resolve) => child.once('exit', resolve));
  return { code, output };
}

test('production fails closed when password authentication is missing', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-os-auth-test-'));
  const child = spawn(process.execPath, ['index.js'], {
    cwd: testDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PROJECT_OS_DATA_DIR: dataDir,
      PROJECT_OS_AUTH_USER: '',
      PROJECT_OS_AUTH_PASSWORD: '',
      PROJECT_OS_DEV_NO_AUTH: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const code = await new Promise((resolve) => child.once('exit', resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
  assert.notEqual(code, 0);
  assert.match(output, /Production requires PROJECT_OS_AUTH_USER/);
});

test('fresh protected startup assigns the explicitly seeded identity as default owner', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-os-seeded-owner-test-'));
  const port = 22000 + Math.floor(Math.random() * 1500);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: testDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      PROJECT_OS_DATA_DIR: dataDir,
      PROJECT_OS_AUTH_USER: 'seeded-owner@example.test',
      PROJECT_OS_AUTH_PASSWORD: 'seeded-owner-password',
      PROJECT_OS_PUBLIC_BASE: baseUrl,
      PROJECT_OS_DEV_NO_AUTH: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  child.stdout.on('data', (chunk) => { serverOutput += chunk; });
  child.stderr.on('data', (chunk) => { serverOutput += chunk; });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child).catch((error) => {
    throw new Error(`${error.message}\n${serverOutput}`);
  });

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'seeded-owner@example.test', password: 'seeded-owner-password' }),
  });
  assert.equal(login.status, 200);
  const body = await login.json();
  assert.equal(body.workspace.id, 'ws_default');
  assert.equal(body.workspace.role, 'owner');
  assert.equal(body.user.role, 'admin');
});

test('protected startup after local dev assigns the explicitly seeded identity without guessing', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-os-dev-to-auth-test-'));
  let authChild = null;
  const devPort = 23500 + Math.floor(Math.random() * 500);
  const devUrl = `http://127.0.0.1:${devPort}`;
  const devChild = spawn(process.execPath, ['index.js'], {
    cwd: testDir,
    env: {
      ...process.env,
      PORT: String(devPort),
      NODE_ENV: 'development',
      PROJECT_OS_DATA_DIR: dataDir,
      PROJECT_OS_AUTH_USER: '',
      PROJECT_OS_AUTH_PASSWORD: '',
      PROJECT_OS_PUBLIC_BASE: devUrl,
      PROJECT_OS_DEV_NO_AUTH: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let devOutput = '';
  devChild.stdout.on('data', (chunk) => { devOutput += chunk; });
  devChild.stderr.on('data', (chunk) => { devOutput += chunk; });
  t.after(() => {
    if (devChild.exitCode === null) devChild.kill('SIGTERM');
    if (authChild?.exitCode === null) authChild.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await waitForServer(devUrl, devChild).catch((error) => {
    throw new Error(`${error.message}\n${devOutput}`);
  });
  devChild.kill('SIGTERM');
  await new Promise((resolve) => devChild.once('exit', resolve));

  const authPort = 24000 + Math.floor(Math.random() * 500);
  const authUrl = `http://127.0.0.1:${authPort}`;
  authChild = spawn(process.execPath, ['index.js'], {
    cwd: testDir,
    env: {
      ...process.env,
      PORT: String(authPort),
      NODE_ENV: 'test',
      PROJECT_OS_DATA_DIR: dataDir,
      PROJECT_OS_AUTH_USER: 'upgraded-owner@example.test',
      PROJECT_OS_AUTH_PASSWORD: 'upgraded-owner-password',
      PROJECT_OS_PUBLIC_BASE: authUrl,
      PROJECT_OS_DEV_NO_AUTH: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let authOutput = '';
  authChild.stdout.on('data', (chunk) => { authOutput += chunk; });
  authChild.stderr.on('data', (chunk) => { authOutput += chunk; });
  await waitForServer(authUrl, authChild).catch((error) => {
    throw new Error(`${error.message}\n${authOutput}`);
  });

  const login = await fetch(`${authUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'upgraded-owner@example.test', password: 'upgraded-owner-password' }),
  });
  assert.equal(login.status, 200);
  const body = await login.json();
  assert.equal(body.workspace.id, 'ws_default');
  assert.equal(body.workspace.role, 'owner');
});

test('workspace invite creates a scoped join request and requires owner approval', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-os-join-test-'));
  process.env.PROJECT_OS_DATA_DIR = dataDir;
  const store = await import(`./store.js?join=${Date.now()}`);
  const owner = store.addUser({
    username: 'owner@example.test',
    email: 'owner@example.test',
    password: 'owner-password',
    displayName: 'Workspace Owner',
    role: 'member',
  });
  const otherOwner = store.addUser({
    username: 'other-owner@example.test',
    email: 'other-owner@example.test',
    password: 'other-owner-password',
    displayName: 'Other Owner',
    role: 'member',
  });
  const candidate = store.addUser({
    username: 'candidate@example.test',
    email: 'candidate@example.test',
    password: 'candidate-password',
    displayName: 'Candidate',
    role: 'member',
  });
  const otherCandidate = store.addUser({
    username: 'other-candidate@example.test',
    email: 'other-candidate@example.test',
    password: 'other-candidate-password',
    displayName: 'Other Candidate',
    role: 'member',
  });
  const workspace = store.createWorkspace({ name: 'Workspace One', ownerUserId: owner.id, status: 'active' });
  const otherWorkspace = store.createWorkspace({ name: 'Workspace Two', ownerUserId: otherOwner.id, status: 'active' });
  const request = store.createWorkspaceJoinRequest({ workspaceId: workspace.id, userId: candidate.id });
  const otherRequest = store.createWorkspaceJoinRequest({ workspaceId: otherWorkspace.id, userId: otherCandidate.id });
  assert.equal(store.membershipOf(candidate.id, workspace.id), null);

  const port = 24000 + Math.floor(Math.random() * 2000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: testDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      PROJECT_OS_DATA_DIR: dataDir,
      PROJECT_OS_AUTH_USER: 'emergency-admin',
      PROJECT_OS_AUTH_PASSWORD: 'unused-emergency-password',
      PROJECT_OS_PUBLIC_BASE: baseUrl,
      PROJECT_OS_DEV_NO_AUTH: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  child.stdout.on('data', (chunk) => { serverOutput += chunk; });
  child.stderr.on('data', (chunk) => { serverOutput += chunk; });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child).catch((error) => {
    throw new Error(`${error.message}\n${serverOutput}`);
  });
  assert.equal(store.membershipOf(candidate.id, store.DEFAULT_WORKSPACE_ID), null);
  assert.equal(store.membershipOf(otherCandidate.id, store.DEFAULT_WORKSPACE_ID), null);

  const loginBeforeApproval = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: candidate.username, password: 'candidate-password' }),
  });
  assert.equal(loginBeforeApproval.status, 403);
  assert.equal(loginBeforeApproval.headers.get('set-cookie'), null);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: owner.username, password: 'owner-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.ok(cookie);

  const pending = await fetch(`${baseUrl}/api/workspaces/current/requests`, { headers: { Cookie: cookie } });
  assert.equal(pending.status, 200);
  assert.deepEqual((await pending.json()).map((row) => row.id), [request.id]);

  const crossTenant = await fetch(`${baseUrl}/api/workspaces/current/requests/${otherRequest.id}/review`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ approve: true }),
  });
  assert.equal(crossTenant.status, 404);
  assert.equal(store.membershipOf(otherCandidate.id, otherWorkspace.id), null);

  const approved = await fetch(`${baseUrl}/api/workspaces/current/requests/${request.id}/review`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ approve: true }),
  });
  assert.equal(approved.status, 200);
  assert.equal(store.membershipOf(candidate.id, workspace.id)?.active, true);
  assert.equal(store.getWorkspaceJoinRequest(request.id)?.status, 'approved');

  const loginAfterApproval = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: candidate.username, password: 'candidate-password' }),
  });
  assert.equal(loginAfterApproval.status, 200);
  assert.ok(loginAfterApproval.headers.get('set-cookie'));
});

test('workspace bootstrap never infers an owner from a global role or user order', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-os-owner-migration-test-'));
  process.env.PROJECT_OS_DATA_DIR = dataDir;
  const store = await import(`./store.js?owner-migration=${Date.now()}`);
  try {
    const outsider = store.addUser({
      username: 'first-global-admin@example.test',
      email: 'first-global-admin@example.test',
      password: 'first-global-admin-password',
      displayName: 'First Global Admin',
      role: 'admin',
    });
    const revokedOwner = store.addUser({
      username: 'revoked-owner@example.test',
      email: 'revoked-owner@example.test',
      password: 'revoked-owner-password',
      displayName: 'Revoked Owner',
      role: 'member',
    });
    const activeOwner = store.addUser({
      username: 'active-owner@example.test',
      email: 'active-owner@example.test',
      password: 'active-owner-password',
      displayName: 'Active Owner',
      role: 'member',
    });
    store.saveWorkspaces([
      {
        id: store.DEFAULT_WORKSPACE_ID,
        name: 'Existing Default Workspace',
        ownerUserId: revokedOwner.id,
        status: 'active',
        inviteCode: 'POSBOUNDARY',
        wsPub: 'project-os',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    store.addMembership({ workspaceId: store.DEFAULT_WORKSPACE_ID, userId: revokedOwner.id, role: 'owner' });
    store.addMembership({ workspaceId: store.DEFAULT_WORKSPACE_ID, userId: activeOwner.id, role: 'owner' });
    store.removeMembership(store.DEFAULT_WORKSPACE_ID, revokedOwner.id);
    assert.equal(store.getWorkspace(store.DEFAULT_WORKSPACE_ID).ownerUserId, activeOwner.id);

    // Simulate a stale v0.2 workspace pointer left behind after the membership was revoked.
    store.updateWorkspace(store.DEFAULT_WORKSPACE_ID, { ownerUserId: revokedOwner.id });

    store.ensureWorkspaceData({ bootstrapOwnerUserId: outsider.id });

    assert.equal(store.getWorkspace(store.DEFAULT_WORKSPACE_ID).ownerUserId, activeOwner.id);
    assert.equal(store.membershipOf(activeOwner.id, store.DEFAULT_WORKSPACE_ID)?.role, 'owner');
    assert.equal(store.membershipOf(revokedOwner.id, store.DEFAULT_WORKSPACE_ID), null);
    assert.equal(store.membershipOf(outsider.id, store.DEFAULT_WORKSPACE_ID), null);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  const freshDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-os-fresh-owner-test-'));
  process.env.PROJECT_OS_DATA_DIR = freshDataDir;
  const freshStore = await import(`./store.js?fresh-owner=${Date.now()}`);
  try {
    const seeded = freshStore.addUser({
      username: 'fresh-owner@example.test',
      email: 'fresh-owner@example.test',
      password: 'fresh-owner-password',
      displayName: 'Fresh Owner',
      role: 'admin',
    });
    freshStore.ensureWorkspaceData({ bootstrapOwnerUserId: seeded.id });
    assert.equal(freshStore.getWorkspace(freshStore.DEFAULT_WORKSPACE_ID).ownerUserId, seeded.id);
    assert.equal(freshStore.membershipOf(seeded.id, freshStore.DEFAULT_WORKSPACE_ID)?.role, 'owner');
  } finally {
    fs.rmSync(freshDataDir, { recursive: true, force: true });
  }
});

test('global account role never overrides the current workspace membership', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-os-role-test-'));
  process.env.PROJECT_OS_DATA_DIR = dataDir;
  const store = await import(`./store.js?role=${Date.now()}`);
  const owner = store.addUser({
    username: 'workspace-owner@example.test',
    email: 'workspace-owner@example.test',
    password: 'workspace-owner-password',
    displayName: 'Workspace Owner',
    role: 'member',
  });
  const legacyAdmin = store.addUser({
    username: 'legacy-admin@example.test',
    email: 'legacy-admin@example.test',
    password: 'legacy-admin-password',
    displayName: 'Legacy Admin',
    role: 'admin',
  });
  const workspace = store.createWorkspace({ name: 'Member Boundary', ownerUserId: owner.id, status: 'active' });
  store.addMembership({ workspaceId: workspace.id, userId: legacyAdmin.id, role: 'member' });

  const port = 26000 + Math.floor(Math.random() * 2000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: testDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      PROJECT_OS_DATA_DIR: dataDir,
      PROJECT_OS_AUTH_USER: 'emergency-admin',
      PROJECT_OS_AUTH_PASSWORD: 'unused-emergency-password',
      PROJECT_OS_PUBLIC_BASE: baseUrl,
      PROJECT_OS_DEV_NO_AUTH: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  child.stdout.on('data', (chunk) => { serverOutput += chunk; });
  child.stderr.on('data', (chunk) => { serverOutput += chunk; });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child).catch((error) => {
    throw new Error(`${error.message}\n${serverOutput}`);
  });
  assert.equal(store.membershipOf(legacyAdmin.id, store.DEFAULT_WORKSPACE_ID), null);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: legacyAdmin.username, password: 'legacy-admin-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.ok(cookie);

  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  const meBody = await me.json();
  assert.equal(meBody.workspace.id, workspace.id);
  assert.equal(meBody.workspace.role, 'member');
  assert.equal(meBody.user.role, 'member');

  const createKey = await fetch(`${baseUrl}/api/kb-keys`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'must-not-exist' }),
  });
  assert.equal(createKey.status, 403);

  const createAdmin = await fetch(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'forbidden@example.test', password: 'forbidden-password', role: 'admin' }),
  });
  assert.equal(createAdmin.status, 403);
  assert.equal(store.getUserByUsername('forbidden@example.test'), null);
});

test('AI credential is tenant-scoped, revocable, validated, audited, and idempotent', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-os-agent-test-'));
  process.env.PROJECT_OS_DATA_DIR = dataDir;
  const store = await import(`./store.js?test=${Date.now()}`);
  const git = await import('./git.js');
  const templates = await import('./templates.js');

  const projectId = 'project-a';
  const repoDir = path.join(store.REPOS_DIR, projectId);
  const kickoff = {
    forWhom: 'AI-assisted delivery team',
    goal: 'An AI can resume the project and leave one checked progress record',
    acceptance: ['context is readable', 'a retried event creates one commit'],
    notDoing: 'no deployment or permission changes',
  };
  git.initRepo(repoDir);
  git.writeFile(repoDir, 'PROJECT.md', templates.projectMd('Project A', kickoff, 'Owner'));
  git.writeFile(repoDir, 'AGENTS.md', templates.AGENTS_MD);
  git.writeFile(repoDir, 'PROGRESS.md', templates.progressMd(20));
  git.writeFile(repoDir, 'HANDOFF.md', '# Handoff Package\n');
  git.commit(repoDir, { subject: 'Initialize project', actor: 'Owner', progressFrom: 0, progressTo: 20 });
  store.saveProject({
    id: projectId,
    workspaceId: store.DEFAULT_WORKSPACE_ID,
    name: 'Project A',
    kickoff,
    status: 'active',
    progress: 20,
    repoPath: repoDir,
    ownerName: 'Owner',
    nextStep: 'Complete the first verified slice',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store.saveProject({
    id: 'project-b',
    workspaceId: 'ws_other',
    name: 'Project B',
    kickoff,
    status: 'active',
    progress: 0,
    repoPath: path.join(store.REPOS_DIR, 'project-b'),
    ownerName: 'Other',
    nextStep: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const created = store.createAgentToken({
    workspaceId: store.DEFAULT_WORKSPACE_ID,
    projectId,
    label: 'Codex acceptance',
    expiresInHours: 24,
    createdBy: 'test-owner',
  });
  assert.ok(created.token.startsWith('pos_'));
  assert.equal(fs.readFileSync(path.join(dataDir, 'agent_tokens.json'), 'utf8').includes(created.token), false);

  const port = 21000 + Math.floor(Math.random() * 3000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: testDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      PROJECT_OS_PUBLIC_BASE: baseUrl,
      PROJECT_OS_DATA_DIR: dataDir,
      PROJECT_OS_DEV_NO_AUTH: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  child.stdout.on('data', (chunk) => { serverOutput += chunk; });
  child.stderr.on('data', (chunk) => { serverOutput += chunk; });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child).catch((error) => {
    throw new Error(`${error.message}\n${serverOutput}`);
  });
  const headers = { Authorization: `Bearer ${created.token}` };

  const context = await fetch(`${baseUrl}/api/agent/v1/projects/${projectId}/context`, { headers });
  assert.equal(context.status, 200);
  const contextBody = await context.json();
  assert.equal(contextBody.project.id, projectId);

  const otherTenant = await fetch(`${baseUrl}/api/agent/v1/projects/project-b/context`, { headers });
  assert.equal(otherTenant.status, 404);

  const before = git.readLog(repoDir).length;
  const eventHeaders = {
    ...headers,
    'Content-Type': 'application/json',
    'Idempotency-Key': 'acceptance-event-001',
  };
  const eventBody = JSON.stringify({
    message: 'Verified the first AI access slice',
    plainMessage: 'The AI can safely read project context and append one traceable progress event.',
    why: 'Validate the smallest read-write loop before widening the permission boundary.',
    benefit: 'The owner can understand what changed, and the next maintainer can continue immediately.',
    verification: 'Context read and progress write returned successfully, and the Git log gained exactly one commit.',
    stageIndex: 1,
    progressTo: 30,
    nextStep: 'Review the web timeline',
    actor: 'forged actor must be ignored',
  });
  const first = await fetch(`${baseUrl}/api/agent/v1/projects/${projectId}/events`, {
    method: 'POST',
    headers: eventHeaders,
    body: eventBody,
  });
  assert.equal(first.status, 201);

  const replay = await fetch(`${baseUrl}/api/agent/v1/projects/${projectId}/events`, {
    method: 'POST',
    headers: eventHeaders,
    body: eventBody,
  });
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get('idempotency-replayed'), 'true');
  assert.equal(git.readLog(repoDir).length, before + 1);
  assert.equal(git.readLog(repoDir)[0].actor, 'Codex acceptance');
  assert.equal(git.readLog(repoDir)[0].plainMessage, 'The AI can safely read project context and append one traceable progress event.');
  assert.equal(git.readLog(repoDir)[0].why, 'Validate the smallest read-write loop before widening the permission boundary.');
  assert.equal(git.readLog(repoDir)[0].benefit, 'The owner can understand what changed, and the next maintainer can continue immediately.');
  assert.match(git.readLog(repoDir)[0].verification, /exactly one commit/i);
  assert.equal(git.readLog(repoDir)[0].stageIndex, 1);

  const conflict = await fetch(`${baseUrl}/api/agent/v1/projects/${projectId}/events`, {
    method: 'POST',
    headers: eventHeaders,
    body: JSON.stringify({ message: 'Different request', verification: 'This deliberately differs from the original request.', progressTo: 31 }),
  });
  assert.equal(conflict.status, 409);

  const backwards = await fetch(`${baseUrl}/api/agent/v1/projects/${projectId}/events`, {
    method: 'POST',
    headers: { ...eventHeaders, 'Idempotency-Key': 'acceptance-event-002' },
    body: JSON.stringify({ message: 'Move backwards', verification: 'The request is intentionally invalid for the acceptance test.', progressTo: 10 }),
  });
  assert.equal(backwards.status, 400);

  const invalidRange = await fetch(`${baseUrl}/api/agent/v1/projects/${projectId}/events`, {
    method: 'POST',
    headers: { ...eventHeaders, 'Idempotency-Key': 'acceptance-event-003' },
    body: JSON.stringify({ message: 'Invalid progress', verification: 'The request is intentionally invalid for the acceptance test.', progressTo: 101 }),
  });
  assert.equal(invalidRange.status, 400);

  const missingVerification = await fetch(`${baseUrl}/api/agent/v1/projects/${projectId}/events`, {
    method: 'POST',
    headers: { ...eventHeaders, 'Idempotency-Key': 'acceptance-event-004' },
    body: JSON.stringify({ message: 'Missing verification note', progressTo: 31 }),
  });
  assert.equal(missingVerification.status, 400);
  assert.match((await missingVerification.json()).error, /verification/i);

  const mcpTransport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(testDir, '../mcp/server.mjs')],
    env: {
      ...process.env,
      PROJECT_OS_BASE_URL: baseUrl,
      PROJECT_OS_AGENT_TOKEN: created.token,
      PROJECT_OS_PROJECT_ID: projectId,
    },
    stderr: 'pipe',
  });
  const mcpClient = new Client({ name: 'project-os-acceptance-test', version: '1.0.0' });
  await mcpClient.connect(mcpTransport);
  const tools = await mcpClient.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    ['project_os_append_progress', 'project_os_get_context'],
  );
  const contextTool = tools.tools.find((tool) => tool.name === 'project_os_get_context');
  const progressTool = tools.tools.find((tool) => tool.name === 'project_os_append_progress');
  assert.equal(contextTool.annotations.readOnlyHint, true);
  assert.equal(contextTool.annotations.idempotentHint, true);
  assert.equal(progressTool.annotations.readOnlyHint, false);
  assert.equal(progressTool.annotations.destructiveHint, false);
  assert.equal(progressTool.annotations.idempotentHint, true);
  const mcpContext = await mcpClient.callTool({ name: 'project_os_get_context', arguments: {} });
  assert.equal(mcpContext.isError, undefined);
  assert.equal(mcpContext.structuredContent.project.id, projectId);
  const beforeMcpWrite = git.readLog(repoDir).length;
  const mcpWrite = await mcpClient.callTool({
    name: 'project_os_append_progress',
    arguments: {
      message: 'Verified the MCP read and write path',
      plainMessage: 'Codex completed a real context read and progress write-back.',
      why: 'Verify the complete path between the MCP client and the project service.',
      benefit: 'Users do not need to give an AI their website credentials.',
      verification: 'MCP listTools, context read, progress write, and Git log assertions passed in the acceptance test.',
      stageIndex: 1,
      progressTo: 35,
      nextStep: 'Review the browser timeline',
      idempotencyKey: 'mcp-acceptance-001',
    },
  });
  assert.equal(mcpWrite.isError, undefined);
  assert.equal(git.readLog(repoDir).length, beforeMcpWrite + 1);
  assert.match(git.readLog(repoDir)[0].verification, /acceptance test/i);
  await mcpClient.close();

  const beforeDoctor = git.readLog(repoDir).length;
  const beforeDoctorAudit = store.listAgentAudit(store.DEFAULT_WORKSPACE_ID, projectId).length;
  const doctor = await runNode([path.resolve(testDir, '../scripts/codex-doctor.mjs')], {
    env: {
      PROJECT_OS_BASE_URL: baseUrl,
      PROJECT_OS_AGENT_TOKEN: created.token,
      PROJECT_OS_PROJECT_ID: projectId,
    },
  });
  assert.equal(doctor.code, 0, doctor.output);
  assert.match(doctor.output, /Project OS connection: OK/);
  assert.match(doctor.output, /MCP tools: 2\/2 available/);
  assert.match(doctor.output, /No project progress or Git history was changed/);
  assert.match(doctor.output, /Credential usage and audit metadata were recorded/);
  assert.equal(git.readLog(repoDir).length, beforeDoctor);
  const doctorAudit = store.listAgentAudit(store.DEFAULT_WORKSPACE_ID, projectId);
  assert.equal(doctorAudit.length, beforeDoctorAudit + 2);
  assert.deepEqual(
    doctorAudit.slice(0, 2).map((event) => event.action).sort(),
    ['capabilities.read', 'project.context.read'],
  );

  const wrongProject = await runNode([path.resolve(testDir, '../mcp/server.mjs')], {
    env: {
      PROJECT_OS_BASE_URL: baseUrl,
      PROJECT_OS_AGENT_TOKEN: created.token,
      PROJECT_OS_PROJECT_ID: 'project-b',
    },
  });
  assert.notEqual(wrongProject.code, 0);
  assert.match(wrongProject.output, /project was not found for this credential/i);
  assert.equal(wrongProject.output.includes(created.token), false);

  const reachedHundred = await fetch(`${baseUrl}/api/agent/v1/projects/${projectId}/events`, {
    method: 'POST',
    headers: { ...eventHeaders, 'Idempotency-Key': 'acceptance-event-100' },
    body: JSON.stringify({
      message: 'All acceptance checks passed',
      plainMessage: 'Every acceptance check for this stage has passed.',
      why: 'Record verified evidence without letting the AI make the closure decision.',
      benefit: 'The owner can review the evidence and explicitly approve project closure.',
      verification: 'All acceptance assertions passed before the request was recorded.',
      progressTo: 100,
      nextStep: 'Wait for the project owner to approve closure',
    }),
  });
  assert.equal(reachedHundred.status, 201);
  assert.equal(store.getProject(projectId).progress, 100);
  assert.equal(store.getProject(projectId).status, 'active');
  assert.match(store.getProject(projectId).nextStep, /owner.*approv/i);

  const audit = store.listAgentAudit(store.DEFAULT_WORKSPACE_ID, projectId);
  assert.ok(audit.length >= 5);
  assert.equal(audit.every((event) => event.ip === null && event.userAgent === null), true);
  store.revokeAgentToken(store.DEFAULT_WORKSPACE_ID, created.credential.id);
  const revoked = await fetch(`${baseUrl}/api/agent/v1/projects/${projectId}/context`, { headers });
  assert.equal(revoked.status, 401);
  const revokedMcp = await runNode([path.resolve(testDir, '../mcp/server.mjs')], {
    env: {
      PROJECT_OS_BASE_URL: baseUrl,
      PROJECT_OS_AGENT_TOKEN: created.token,
      PROJECT_OS_PROJECT_ID: projectId,
    },
  });
  assert.notEqual(revokedMcp.code, 0);
  assert.match(revokedMcp.output, /invalid, expired, or revoked/i);
  assert.equal(revokedMcp.output.includes(created.token), false);
});
