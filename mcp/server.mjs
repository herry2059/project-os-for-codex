#!/usr/bin/env node

import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

const baseUrl = String(process.env.PROJECT_OS_BASE_URL || '').trim().replace(/\/$/, '');
const agentToken = String(process.env.PROJECT_OS_AGENT_TOKEN || '').trim();
const projectId = String(process.env.PROJECT_OS_PROJECT_ID || '').trim();
const requiredScopes = ['project.context.read', 'project.events.append'];
const requiredTools = ['project_os_append_progress', 'project_os_get_context'];

if (!baseUrl || !agentToken || !projectId) {
  console.error('Missing PROJECT_OS_BASE_URL, PROJECT_OS_AGENT_TOKEN, or PROJECT_OS_PROJECT_ID.');
  process.exit(1);
}

async function request(pathname, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${agentToken}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`Project OS request failed with status ${response.status}.`);
      error.statusCode = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function safeErrorMessage(error) {
  if (error?.name === 'AbortError') return 'Project OS connection timed out. Check that the service is reachable.';
  if (error?.statusCode === 400) return 'Project OS rejected the request. Check the required progress fields and limits.';
  if (error?.statusCode === 401) return 'Project OS credential is invalid, expired, or revoked.';
  if (error?.statusCode === 403) return 'Project OS credential does not have the required project scope.';
  if (error?.statusCode === 404) return 'Project OS project was not found for this credential.';
  if (error?.statusCode === 409) return 'Project OS rejected a conflicting retry key.';
  if (error?.statusCode === 429) return 'Project OS is temporarily rate limited. Try again shortly.';
  return 'Project OS is temporarily unavailable. Check the connection and try again.';
}

async function verifyConnection() {
  const capabilities = await request('/api/agent/v1/capabilities');
  if (capabilities?.project?.id !== projectId) {
    const error = new Error('Project OS credential does not match the configured project.');
    error.statusCode = 404;
    throw error;
  }
  const scopes = new Set(Array.isArray(capabilities?.credential?.scopes) ? capabilities.credential.scopes : []);
  if (requiredScopes.some((scope) => !scopes.has(scope))) {
    const error = new Error('Project OS credential does not have the required project scope.');
    error.statusCode = 403;
    throw error;
  }
  const tools = Array.isArray(capabilities?.tools)
    ? capabilities.tools.map((tool) => tool?.name).filter(Boolean).sort()
    : [];
  if (JSON.stringify(tools) !== JSON.stringify(requiredTools)) {
    throw new Error('Project OS service does not expose the required Codex tools.');
  }
  return capabilities;
}

function toolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function toolError(error) {
  return {
    isError: true,
    content: [{ type: 'text', text: safeErrorMessage(error) }],
  };
}

const server = new McpServer(
  { name: 'project-os-for-codex', version: '0.3.0' },
  {
    instructions:
      'Read project context before acting. Follow PROJECT.md and AGENTS.md. After each checked slice, append one progress event with a concrete verification note. Never request or expose passwords, tokens, provider keys, or credentials. Deletion, permission changes, publication, payment, deployment, and rollback always require a human.',
  },
);

server.registerTool(
  'project_os_get_context',
  {
    title: 'Read Project OS context',
    description:
      'Read the current project goal, acceptance criteria, AGENTS rules, handoff package, progress, recent Git trail, and next step before starting work.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    try {
      return toolResult(await request(`/api/agent/v1/projects/${encodeURIComponent(projectId)}/context`));
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  'project_os_append_progress',
  {
    title: 'Append checked project progress',
    description:
      'After completing and checking one project slice, append a concise progress event plus the check performed. This creates one matching project-record Git commit. Progress cannot move backward.',
    inputSchema: {
      message: z.string().min(1).max(240).describe('One concise technical sentence describing the checked result'),
      plainMessage: z.string().min(1).max(500).describe('Required plain-language result that a non-technical project owner can understand'),
      why: z.string().min(1).max(500).describe('Required reason this slice was done now'),
      benefit: z.string().min(1).max(500).describe('Required concrete benefit for the user or the next maintainer'),
      verification: z
        .string()
        .min(1)
        .max(500)
        .describe('Required concrete check performed, such as a command and result, inspected URL, screenshot, or artifact; this is agent-reported evidence'),
      stageIndex: z.number().int().min(1).max(99).optional().describe('Optional project stage number'),
      progressTo: z.number().min(0).max(100).optional().describe('New progress percentage; omit if unchanged'),
      nextStep: z.string().min(1).max(500).describe('Required next concrete action; at 100%, say that human closure approval is pending'),
      idempotencyKey: z
        .string()
        .min(8)
        .max(160)
        .regex(/^[A-Za-z0-9._:-]+$/)
        .optional()
        .describe('Stable retry key; normally generated from the MCP request'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ message, plainMessage, why, benefit, verification, stageIndex, progressTo, nextStep, idempotencyKey }, extra) => {
    const generatedKey = `mcp-${String(extra?.requestId ?? crypto.randomUUID()).replace(/[^A-Za-z0-9._:-]/g, '-')}`;
    try {
      return toolResult(
        await request(`/api/agent/v1/projects/${encodeURIComponent(projectId)}/events`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey || generatedKey },
          body: JSON.stringify({ message, plainMessage, why, benefit, verification, stageIndex, progressTo, nextStep }),
        }),
      );
    } catch (error) {
      return toolError(error);
    }
  },
);

const transport = new StdioServerTransport();
try {
  await verifyConnection();
} catch (error) {
  console.error(safeErrorMessage(error));
  process.exit(1);
}
await server.connect(transport);
