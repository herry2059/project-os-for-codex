# Connect Codex

Project OS for Codex gives Codex explicit project tools. It does not ask Codex to sign in as a human and click through the whole website.

The first production-oriented vertical slice lets an agent:

1. read one project's goal, acceptance criteria, rules, progress, Git trail, handoff, and next step;
2. append one structured progress event with an agent-reported verification note;
3. create exactly one matching project-record Git commit, even when a network retry repeats the request;
4. make the result immediately visible in the web timeline.

## Why the agent should not receive your website password

A website account can usually manage projects, users, credentials, deletion, and settings. A password pasted into a model conversation can enter chat history, logs, screenshots, or a third-party service, and you cannot revoke access for just one agent.

The system uses a short-lived AI credential instead:

- bound to one `workspaceId` and one `projectId`;
- fixed scopes: `project.context.read` and `project.events.append`;
- expires after 24 hours or 7 days;
- independently revocable;
- returned in plaintext once and stored by the server only as a hash;
- server-derived agent identity rather than an actor supplied in the request body;
- audit records for reads, writes, rejected requests, idempotent replays, rate limits, and revocation.

## 1. Start the app

For local evaluation:

```bash
docker compose up --build
```

Open <http://localhost:8790>. The included Compose file listens on `127.0.0.1` only.

## 2. Create the connection

1. Create a project and define its acceptance criteria and next step.
2. Open the project and select **Connect**.
3. Under **Connect Codex**, name the connection and choose 24 hours or 7 days.
4. Select **Create AI credential**.
5. Run the generated command directly in your own terminal.

Do not paste the generated command or credential into a model chat, issue, screenshot, log, or repository.

## 3. Connect Codex

The page generates a command with real values. Its shape is:

```bash
codex mcp add project-os-<project-id> \
  --env PROJECT_OS_BASE_URL='https://your-domain.example' \
  --env PROJECT_OS_AGENT_TOKEN='pos_...' \
  --env PROJECT_OS_PROJECT_ID='<project-id>' \
  -- npx -y github:herry2059/project-os-for-codex#v0.2.0
```

Check the connection:

```bash
codex mcp list
```

Then ask Codex:

```text
Read the Project OS context first. Summarize the goal, acceptance criteria, risks, and next step. Complete and verify the next slice, then append one progress event.
```

[Official Codex MCP documentation](https://developers.openai.com/codex/mcp/)

## Current tools

### `project_os_get_context`

Read-only. Returns the kickoff card, acceptance criteria, `AGENTS.md`, handoff package, progress, recent Git trail, and next step.

### `project_os_append_progress`

A low-risk write tool with the following input:

- `message`: a concise technical statement of the checked result;
- `plainMessage`: the same result in language a non-technical project owner can understand;
- `why`: why this vertical slice was completed now;
- `benefit`: the concrete benefit for the user or next maintainer;
- `verification`: the concrete check performed, such as a command and result, inspected URL, screenshot, or artifact; this is agent-reported evidence for human review;
- `stageIndex`: optional project stage number from 1 to 99;
- `progressTo`: optional percentage from 0 to 100; it cannot move backward;
- `nextStep`: the required next concrete action; when progress reaches 100, it must state that human closure approval is pending;
- `idempotencyKey`: optional stable retry key; the MCP bridge derives one from the MCP request when omitted.

The server records the credential label as the actor. A request cannot claim a different identity in its body.

If the same idempotency key and payload are retried, the server returns the existing result and does not create a second event or Git commit. Reusing that key with a different payload returns `409`.

## Codex-focused behavior

The MCP server is shaped around Codex's documented capabilities:

- its initialization instructions tell Codex to read context first, follow `PROJECT.md` and `AGENTS.md`, complete one checked slice, include a verification note, and stop for human approval on high-risk actions;
- `project_os_get_context` is marked read-only and idempotent;
- `project_os_append_progress` is marked non-destructive and idempotent, but it remains an explicit write tool;
- the root `AGENTS.md` gives Codex durable repository rules before work starts;
- the generated command follows the official `codex mcp add ... -- <stdio command>` shape.

Configuration smoke test: on 2026-07-14, Codex CLI `0.144.2` parsed the supplied project-level MCP configuration and listed the pinned stdio server successfully with placeholder environment values. This proves configuration compatibility only; it is not a claim that a model completed a live project task.

Codex stores MCP settings in its configuration. The short-lived token is therefore present on the client until you remove the entry. Use HTTPS in production, choose the shortest practical lifetime, revoke the credential after the task, and remove the local entry:

```bash
codex mcp remove project-os-<project-id>
```

For a project-scoped setup that forwards local environment variables instead of committing values, copy [`.codex/config.toml.example`](../.codex/config.toml.example) to `.codex/config.toml` only in a trusted checkout, export the three `PROJECT_OS_*` variables locally, and restart Codex.

## AI access by module

The current MCP surface is intentionally smaller than the web application. This table describes what is available now and the boundary planned for future vertical slices. Planned actions are not implemented MCP tools yet.

| Area | Available to an agent now | Human-only boundary |
| --- | --- | --- |
| Project overview | Read the current project context and next step | No direct edit tool |
| Project timeline | Append a scoped, auditable progress event | Change ownership, edit the kickoff record, delete, or restore |
| Handoff | Read the handoff material returned with project context | Approve a formal handoff or change access |
| Project files | Read `HANDOFF.md`, `PROJECT.md`, `AGENTS.md`, and `PROGRESS.md` returned with context | Edit protected source or approve formal delivery |
| Team and access | No MCP tool | Invite, change role, suspend, or remove a member |
| AI credentials | No MCP tool | Create, reveal, rotate, or revoke credentials in the web application |
| Deployment | No MCP tool | Change configuration, deploy, roll back, or change domains and permissions |

Future tools must reuse the same controls: verified `workspaceId` isolation, minimum scopes, short expiration, idempotency, audit records, and explicit human approval for high-risk actions. The project will not bypass these controls by giving an agent an administrator password and asking it to click through the website.

## What remains human-only

Deleting or restoring projects, changing owners or roles, managing credentials, publishing knowledge, payments, deployment, and rollback are not exposed as MCP tools. Future modules will use draft and approval workflows rather than giving an agent unrestricted browser access.

## Remove or revoke access

Revoke the credential immediately from the project's **Connect** tab. You can also remove the local MCP entry:

```bash
codex mcp remove project-os-<project-id>
```

## Errors

- `401`: credential is invalid, expired, or revoked.
- `403`: credential lacks the required scope.
- `404`: credential does not belong to this project, or the project is deleted.
- `409`: the same idempotency key was reused for different content.
- `429`: too many writes in one minute.

Never solve a connection problem by disabling production authentication.

In production, the server refuses to start when the required bootstrap authentication variables are missing. `PROJECT_OS_DEV_NO_AUTH=true` is restricted to non-production local development.
