## Summary

## Verification

- [ ] `pnpm run check`
- [ ] `pnpm audit --prod --audit-level=high`
- [ ] server health smoke test
- [ ] Codex MCP context read or `pnpm codex:doctor` when integration behavior changed
- [ ] docs updated if interfaces changed
- [ ] no secrets, private domains, production data, or raw conversation logs
- [ ] affected UI reviewed in light and dark themes, or marked not applicable

## Risk

Does this change auth, workspace isolation, project secrets, deletion, deployment, or provider adapters?
