import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const requiredEnv = ['PROJECT_OS_BASE_URL', 'PROJECT_OS_AGENT_TOKEN', 'PROJECT_OS_PROJECT_ID'];
const expectedTools = ['project_os_append_progress', 'project_os_get_context'];
const missing = requiredEnv.filter((name) => !String(process.env[name] || '').trim());

if (missing.length) {
  console.error(`Codex doctor is missing required environment variables: ${missing.join(', ')}.`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'mcp/server.mjs')],
  env: { ...process.env },
  stderr: 'pipe',
});
const client = new Client({ name: 'project-os-codex-doctor', version: '0.3.0' });
let stderr = '';
transport.stderr?.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const tools = listed.tools.map((tool) => tool.name).sort();
  if (JSON.stringify(tools) !== JSON.stringify(expectedTools)) {
    throw new Error('The MCP tool allowlist does not match this release.');
  }

  const result = await client.callTool({ name: 'project_os_get_context', arguments: {} });
  if (result.isError || !result.structuredContent?.project) {
    throw new Error('The project context could not be read.');
  }
  const project = result.structuredContent.project;
  console.log('Project OS connection: OK');
  console.log(`Project: ${project.name || project.id || 'available'}`);
  console.log(`Current progress: ${Number.isFinite(Number(project.progress)) ? `${Number(project.progress)}%` : 'available'}`);
  console.log(`Next step: ${project.nextStep || 'not recorded'}`);
  console.log(`MCP tools: ${tools.length}/${expectedTools.length} available`);
  console.log('No project progress or Git history was changed. Credential usage and audit metadata were recorded.');
} catch {
  const reason = /invalid|expired|revoked|scope|not found|timed out/i.test(stderr)
    ? stderr.trim().split('\n').at(-1)
    : 'Project OS connection check failed.';
  console.error(reason || 'Project OS connection check failed.');
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
