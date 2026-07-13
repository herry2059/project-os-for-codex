# Adapter Contracts

The open-source build ships with local JSON and local Git defaults.

Production deployments can replace these boundaries without exposing private infrastructure:

- `GitStoreAdapter`: local Git, Gitea, GitLab, GitHub Enterprise, or object-storage-backed mirrors.
- `AiProviderAdapter`: OpenAI-compatible provider, self-hosted gateway, or enterprise proxy.
- `KnowledgeStoreAdapter`: JSON, PostgreSQL, vector database, Notion/GitBook importers, or internal knowledge services.

Keep private adapters in your own repository when they contain hostnames, credentials, metering logic, or organization-specific rules.

See `docs/INTERFACES.md` for the public interface specifications.
