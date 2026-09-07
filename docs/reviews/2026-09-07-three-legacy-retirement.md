# Three legacy code retirement

Source scope: working-tree cleanup based on `22ddb16d`, after the documentation
cleanup was pushed. This is local source/verification evidence, not deployment.

## Preserved current architecture

A final comparison with the base found zero deleted files among 208 original
files in the current SDK, Creator, Episode, cloud, production and review roots.

| Root | Original files | Cleanup effect |
| --- | ---: | --- |
| packages/three-world | 41 | No file changes |
| packages/camera-collision | 4 | No file changes |
| apps/three-creator-playground | 2 | No file changes |
| apps/creator-evaluation-site | 4 | No file changes |
| scripts/three-creator | 21 | Asset catalog source paths only |
| scripts/three-episode | 76 | Two imports switched to neutral shared helpers |
| scripts/production | 10 | Original files unchanged; add offline test wrapper |
| scripts/evaluations | 2 | No file changes |
| deploy/creator-evaluation | 7 | No file changes |
| deploy/three-creator-runtime | 4 | Extend capsule regression tests |
| scripts/cloud files with three in their name | 37 | None deleted; source staging and Vertex module path updated |

LWDP generation client, cloud-production-run, episode-style-variants and rendered
frame encoder implementation bytes are unchanged. Creator diagnostics now use
the equivalent existing Three runtime IO helpers.

The two catalog GLBs moved from the old Playground into assets/three-creator.
Asset IDs, public URIs, animation metadata, SHA-256 and byte lengths are unchanged.
Their source staging regression failed on the old application path, then passed
with the independent asset path. A separately reproduced, pre-existing capsule
omission was fixed by including the four files consumed by the extensions example.

Canonical JSON/hash and GPU batch execution were extracted into neutral modules,
preserving persisted identities, receipt/resume behavior and explicit Host effects.
The six Vertex helper function bodies were moved unchanged; the Three adapter no
longer loads the old Episode CLI or its unused imports. No new admission or video
provider behavior was added.

## Removed scope

Remove 35 obsolete workspace packages plus old Playground/Native/Studio apps,
CLI and authoring workflows, old executable skills, blueprint Site and old example
worlds/goldens. The tracked deletion count is 1444, including the two asset old
paths now relocated and 100 old scene artifact files removed after the user
explicitly included artifacts/scenes in this cleanup. Ignored local caches, external worktrees, running production
jobs, provider archives, original runtime locks and source patches are preserved.
Three retains Rapier, Recast and the existing Recast patches. Babylon/Havok and
removed workspace dependencies no longer occur in the current lockfile.

Root commands and CI now use the Three runtime build and every surviving test.
The new retirement guard checks actual import/dependency syntax; it detects dangling
removed-package imports that the older workspace-boundary checker missed. Both
censuses remain explicit and reject missing/stale/unclassified entries. Old tests
were removed with their executable subjects; shared-client tests were migrated.

## Verification

- `CI=1 pnpm install --frozen-lockfile`: passed with pnpm 10.14.0.
- `pnpm typecheck`: passed.
- `pnpm test`: passed; 38 suites, 425 tests (121 contract + 304 resource-heavy).
  Includes real Chromium/MCP, Rapier, capture and reset behavior.
- `pnpm test:independent`: passed; 25 Node suites, 195 tests, no skipped tests.
  The Node wrappers also run all five surviving Python suites.
- `pnpm verify:three-workspace`: passed. Workspace debt is zero.
- `pnpm test:census`: 38 suites, 18 contract + 20 resource-heavy.
- `pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/three-runtime-cleanup`: passed.
  runtimeHash: `d02c2130d6f6d45ec7e6db3e3925c14bbc3bd2342f5fb76da4c59e298328ca47`;
  manifest SHA: `0c9b2d6035ac53987712fc69f8f245e1febb022dd728b0a022a9a38d34cd07a7`.
- Existing sdk-capabilities demo compiled with that runtime, opened in the in-app
  browser, accepted movement/jump and camera input, and reset successfully. No
  browser console errors were returned by the final error-log read.
- Local Markdown links and historical Git targets checked; `git diff --check` passed.

The first Node aggregate had two failures from tests reading retired runner files.
Those tests were removed with their obsolete subjects; all shared helper tests
remain, and the final aggregate above passed. Independent static review found no
confirmed cleanup-induced executable-path defect; its capsule omission finding
was reproduced and fixed as described above.

No provider submission, campaign restart, cloud test/deployment or remote CI run
was performed. New production capsules still require an explicitly authorized
release; historical published worlds retain their original identities.


## Follow-up: old scene artifact directory

The user explicitly included `artifacts/scenes` in cleanup. All six directories
(cloud-ridge-celestial-gate, grassland, green-sahara-caravan,
memory-postcard-coastal-ride, sunlit-flower-bay, world-08170639-54db) use retired
AuthoringSpec/WorldSpec and capture/plan formats. No retained Three source or
configuration references this directory or these case identities.

All 100 files were tracked, unmodified and byte-equal to HEAD before removal.
The change removes only these repository-local old scene artifacts; current
Three production inputs, published worlds and external provider archives are
unchanged. No runtime replay is needed for this unreferenced artifact deletion.


## Follow-up: remaining artifacts

The user then explicitly authorized removing the entire repository-local
`artifacts` directory. Its remaining 61 tracked, unmodified files were old BNA-1
receipts, a Native import comparison and four terrain experiment sets (about
20 MiB). A lone `.DS_Store` was the only untracked file. All tracked bytes were
verified against the base Git commit before removal.

The two `sourceExperiment` references in the historical terrain exemplar metadata
now point to their exact pre-cleanup Git trees. Exemplar images and content hashes
are unchanged. The current Three code, source bundles, published worlds and
external production archives do not consume this retired artifact directory.


## Final submission scope

The user's final local cleanup also removed the repository-local orchestration
skill's three files and `.cursor/environment.json`. These four configuration/
workflow deletions are included in the total above. The two active SDK packages
remain byte-identical to the base. Workspace boundaries, complete Vitest census
and whitespace checks were rerun before committing; previous full behavior test
results remain scoped to their unchanged runtime/test inputs.

Recast core and generators are installed with the lockfile's patch hashes and
are consumed by Three navigation. Resource-lifetime fixes are on the active
navigation generation path; the optional legacy `sourceAreaMode` modes are not
passed by the current SDK. The patches were retained unchanged in this cleanup.
