# Changelog

## 0.2.0

### Added

- Short-lived AI credentials bound to one workspace and one project.
- Revocation, expiry, audit history, rate limiting, and server-derived agent identity.
- Idempotent Agent API progress writes with one matching Git commit.
- A stdio MCP server for Codex.
- Root `AGENTS.md` and an English Codex setup guide.
- Real dark/light product screenshots and Agent API + MCP acceptance tests.
- Plain-language progress fields for result, reason, benefit, stage, and next action.
- Owner approval for workspace join requests; invite codes no longer grant membership directly.
- An anonymized maintainer activity graphic with an explicit non-adoption disclaimer.

### Changed

- Production now fails closed when bootstrap password authentication is missing.
- Local Docker evaluation binds to `127.0.0.1` and enables no-auth mode explicitly.
- New integrations use short-lived MCP credentials; the persistent project key API is compatibility-only.
- README, package metadata, `llms.txt`, and public metadata now describe the verified Codex MCP integration.
- Renamed the public project to `Project OS for Codex` and the repository target to `project-os-for-codex` while keeping an explicit independent-project disclaimer.
- Replaced runtime variables with the neutral `PROJECT_OS_*` prefix.

### Security

- Agent writes validate progress, prevent rollback, require stable idempotency keys, and ignore body-supplied actor names.
- Cross-workspace and cross-project access is rejected from the credential's server-side ownership fields.
- Project deletion revokes all active AI credentials for that project.
- Provider keys and website passwords are excluded from the Agent API and MCP surface.
- Workspace joins require owner/admin review and reject cross-workspace request IDs.
- Browser progress actors are derived from the authenticated session rather than request bodies.
- Reaching 100% progress still requires a human to confirm project closure.
- Network metadata is excluded from AI audit records unless the operator explicitly opts in.

## 0.1.0-public-candidate

### Added

- Public README and deployment documentation.
- Deployment and interface documentation.
- Adapter boundary documentation for Git, AI provider, and knowledge storage.
- Curated public starter knowledge with no private customer data.
- Security publication checklist.

### Changed

- Removed deployment-specific provider implementation from the public candidate.
- Replaced internal business seed data with curated public starter knowledge.
- Project secrets are documented as header-only.

### Security

- Excluded production data, private deployment cards, and conversation logs from the public candidate.
- Added explicit guidance to keep provider secrets server-side only.
