# Workspace Package Migration Implementation Plan

**Goal:** Give each maintained component one clear package name, dependency owner
and instruction scope, preserving production execution.

**Architecture:** Follow the responsibilities in the spec; keep SDK execution
ownership unchanged. Move Creator browser code into its Host. Move Episode-only
helpers into Episode and shared capture/client modules into narrow packages.

**Tech Stack:** pnpm workspaces, TypeScript, Node ESM, Python, Vite and Vitest.

**Spec:** [Package responsibilities](../specs/2026-09-12-package-boundaries.md)

## Execution

- [x] Establish latest origin/main isolated worktree; run current boundary, census
  and type checks before editing.
- [x] Move components and configuration to their owners. Rewrite import paths and
  active documentation references; preserve historical identities.
- [x] Add workspace manifests with explicit exports and direct dependencies. Move
  Creator-to-Episode integration scripts outside production packages. Refresh lock.
- [x] Update compiler, project runtime copying, cloud capsule projection, test
  discovery and package boundary inventory for the actual new dependency closure.
- [x] Split AGENTS.md by maintenance scope; retain and reconnect production Agent
  document loading. Document commands and responsibilities at each package root.
- [x] Verify typecheck, lint, package boundaries, all existing test lanes, runtime
  prebuild, SDK Playground build and local source capsule staging. Inspect the final
  diff for semantic changes, orphan paths and accidental artifact edits.

No cloud launch, deployment, production job or remote publication is part of this
migration. Existing production identities are not rewritten or retried.

Verification details: [migration receipt](../../reviews/2026-09-12-workspace-package-migration.md).
