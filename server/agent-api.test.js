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
});
