# World SDK Blueprint Site

This is the repository-owned current architecture publication for Agent Whitebox World SDK. It renders directly from `app/page.tsx`; it does not embed or restore the retired Legacy site bundle.

The public claims follow the active repository authorities:

- `docs/00-project-overview.md` for current product scope and role boundaries;
- `docs/18-refactor-progress-and-backlog.md` for implementation status;
- `docs/20-gameplay-integration-contract.md` for the current protocol chain.

When those authorities change, update the Site and its rendered contract test in the same change. Historical reviews and superseded protocol versions are not publication sources.

## Local verification

Use a supported Node version (`>=22.13`, excluding unsupported odd-numbered releases required by transitive tooling), then run:

```bash
npm ci
npm test
```

`npm test` performs the Vinext production build and server-renders `/`. The test requires the current Canonical V4 → IR V4 → Plan V5 → RuntimeHost → Babylon/Havok → Browser V5/Snapshot V4 chain and rejects any `/legacy/` iframe or asset dependency.
