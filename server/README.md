# Project OS for Codex Server

The server is the Git-backed execution kernel:

- one project equals one local Git repository
- one progress event equals one Git commit
- one handoff package gives the next human or AI agent enough context to resume

## Run

From the repository root:

```bash
pnpm install
pnpm --dir server run seed
PROJECT_OS_DEV_NO_AUTH=true pnpm --dir server start
```

The API listens on `http://localhost:8790` by default.

## Environment

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | server port | `8790` |
| `PROJECT_OS_DATA_DIR` | persisted data and Git repositories | `server/data` |
| `PROJECT_OS_AUTH_USER` | required production bootstrap account | empty |
| `PROJECT_OS_AUTH_PASSWORD` | required production bootstrap password | empty |
| `PROJECT_OS_DEV_NO_AUTH` | explicit local-only password bypass | `false` |
| `GIT_PUBLIC_BASE` | optional public clone URL prefix | empty |
| `GIT_PUBLIC_DIR` | optional bare mirror repository directory | empty |
| `PROJECT_OS_AI_BASE` | OpenAI-compatible provider URL, server side only | empty |
| `PROJECT_OS_AI_KEY` | provider key, server side only | empty |
| `PROJECT_OS_AI_MODEL` | chat model for draft/organize helpers | empty |
| `PROJECT_OS_EMBEDDING_MODEL` | embedding model for semantic search | empty |

No deployment-specific provider implementation, upstream token, or private metering key is included in the open-source build.

## Codex MCP

Create a short-lived AI credential from the project page, then run the generated MCP command. The credential is bound to one workspace and project, expires after 24 hours or 7 days, can be revoked independently, and is stored only as a hash.

Current tools:

- `project_os_get_context`
- `project_os_append_progress`

See [the English setup guide](../docs/CODEX_SETUP.md).

## Legacy Project Event API

This endpoint remains for early scripts. New integrations should use a short-lived AI credential and MCP. Never put secrets in URLs.

```bash
curl -X POST http://localhost:8790/api/projects/<id>/events \
  -H 'Content-Type: application/json' \
  -H 'X-Project-Key: <project-secret>' \
  -H 'Idempotency-Key: progress-step-001' \
  -d '{"message":"Add handoff checklist","verification":"The checklist page loaded and each acceptance item was reviewed.","progressTo":55,"nextStep":"Run acceptance smoke test"}'
```

## Deployment Notes

- Use a persistent volume for `PROJECT_OS_DATA_DIR`.
- Put a reverse proxy in front of the API in production.
- Production refuses to start without `PROJECT_OS_AUTH_USER` and `PROJECT_OS_AUTH_PASSWORD`.
- Keep provider secrets in server environment variables only.
- Back up `server/data` before destructive migrations.
