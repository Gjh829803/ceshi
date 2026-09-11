# Workspace package migration verification

Base: `c8b442fb096dd7da4a3c7126f5003a7152157de6` (#235).
Implementation branch: `codex/package-boundaries`.
Package responsibilities and commands: [workspace guide](../workspace-packages.md).

## Preserved production behavior

`packages/three-world`, `@worldkit/three`, public SDK types, MCP actions, project
profiles, asset IDs, recording requirements and root production commands retain
their existing semantics. Creator task requirements, Episode planner/style/image/
review prompts, asset/account policy, profiles and presentation defaults were
compared against the base. They are byte-identical. Two configuration files
change only the relocated prompt/launcher paths. Dependency resolution/integrity
records below the lockfile importer section are unchanged. All 43 catalog asset
identities and their model/resource declarations are unchanged; metadata links
follow their owning source files.

Both base and candidate runtime prebuilds were produced on this machine:

| Runtime file | Comparison |
| --- | --- |
| `three.js` | Byte-identical, SHA-256 `07cfce21e8a76b9dd1914ab11cd2fb30e0ac84f05888f5b71e3b497d0f8af18a` |
| `worldkit-three.js` | Byte-identical, SHA-256 `ee62638b41196eaf49162861dd8c018caad994161dabbb264bbd1a24c309fbfa` |
| `bridge.js` | Executable content identical; only esbuild source-path comments differ |

The combined runtime identity changes with the bridge bytes, as required. Do not
reuse an old runtime lock for a new source release. New build identity does not
claim new gameplay or rendering behavior.

Existing frozen-task policy paths retain their original recorded identity; a
relocation is accepted only for equal pinned bytes. Supervisor recovery delegates
to that reader without converting the stored path into a new CLI override.
Episode entrypoints select the known current or pre-package path inside the actual
frozen image/archive, preserving Node arguments and the original TypeScript loader.
Hydration still verifies the archive SHA first. Streaming overlays preserve their
pinned bytes and select their destination from the hydrated workflow location.
No provider job, image, archive, request or shared-review identity is rewritten.

## Verification evidence

- Root and package-local typechecks passed; `pnpm lint` passed.
- Workspace package inventory and dependency boundaries passed with zero debt.
- Vitest census retained all 122 files: 37 contract and 85 resource-heavy.
- Contract lane: 37 files, 363 tests passed. The independent-census contract was
  rerun after registering the new frozen-entrypoint suite: 10 tests passed.
- Resource-heavy lane: 84 files passed; one asset-policy test detected catalog
  metadata changing during the migration run. After finalizing that metadata,
  the complete affected asset-policy file passed all 17 tests. The full 85-file
  lane was not repeated; it contains 1,359 tests, and the other passing files'
  runtime behavior was not changed by the later Host recovery fixes.
- Final independent lane: 274 tests passed, including Python wrappers under
  Python 3.13. Local system Python 3.9 was insufficient for existing `zip(strict=)`
  tests; production CI already selects Python 3.12.
- Frozen old/new layout tests exercised actual local Node entrypoints, TypeScript
  workflow execution, CPU host chaining, missing layouts and overlay file copies.
  Supervisor recovery exercised the actual supervisor with a local transport stub.
- Runtime prebuild and SDK Playground build passed; catalog/source consistency
  passed for 43 entries. Browser regressions covered initial mounts, real driving,
  camera handoff/reset, model-color isolation and texture alpha.
- Creator capsule tests passed. A staged capsule was copied outside this checkout,
  installed offline with its projected frozen lock, prebuilt, and used to compile
  an external author workspace. It did not rely on repository `node_modules`.
  Maintainer `AGENTS.md` files are excluded from production capsules; the original
  production Agent documents remain included.
- Active documentation link checks and diff whitespace checks passed.
- Independent bounded review covered package dependencies, source packaging and
  frozen-task execution. All three reported recovery-path findings were fixed and
  rechecked with no remaining actionable findings.

Local evidence is retained under the worktree's ignored `.codex-tmp/` directory,
including `runtime-parity.json`, `production-policy-parity.json`, test logs and
capsule isolation results. These checks establish local execution and packaging;
no real cloud generation, deployment, publication or semantic world review was run.
