# Authority Root-Cause Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan. Cross-cutting public contracts and final integration remain main-agent-owned; workers may only take explicitly isolated file ownership after the named contract dependency is stable.

**Goal:** Implement the root-cause slice frozen in `docs/superpowers/specs/2026-08-26-authority-root-cause-closure-design.md`, preserve the current architecture, register expensive non-correctness work for later, and integrate a verified tree into `origin/main`.

**Architecture:** Freeze the current-only Hosted visual contract first, then adapt the atomic Preview. Independently close Canonical admission, Registry discovery, Subject vocabulary ownership, Studio process topology, production/test dependency inversion, and Planner generated parity. Finish with a read-only workspace boundary floor and one deduplicated release gate sequence.

**Tech stack:** TypeScript/Vitest/pnpm workspace; Node ESM/`node:test` Studio; generated standalone ESM checkers; Git worktree and read-only Cursor review.

---

## Task 1: Freeze scope and preserve completed foundations (`ARC-00`, `WS-03`, initial `HSE-00`)

**Files:**

- `docs/superpowers/specs/2026-08-26-authority-root-cause-closure-design.md`
- `packages/protocol/src/canonical-json.ts`
- `packages/authoring/src/{parse.ts,validate-v4.ts,subject-preset-candidate.ts}`
- `apps/studio/preview-bootstrap.mjs`
- corresponding tests

**Steps:**

1. Preserve the already observed RED cases for protocol/object/parser/candidate negative zero and the HSE-00 stale/cross-attempt bootstrap.
2. Run the four focused Authoring/Protocol files, Studio bootstrap test, and typecheck.
3. Commit the design and the two independently verified slices.
4. Do not run final aggregate gates yet; later tasks change their inputs.

## Task 2: Current-only Hosted visual contracts (`HSE-01.1`)

**Files:**

- Rename/modify `packages/runtime-contracts/src/capture-targets.ts` and its test
- Modify `packages/runtime-contracts/src/index.ts`

**RED:**

1. Add tests for distinct draft/final discriminators, exact keys, and old-shape rejection.
2. Assert malformed `null`, `{}`, `[{}]`, and partial nested objects produce diagnostics without throwing.
3. Assert capture groups cannot express a second identity.
4. Assert the whitebox manifest rejects old kind, old collection/field names, and traversal URIs.

**GREEN:**

1. Define `HostedVisualContractDiagnosticV1 { code, instancePath, message }`.
2. Define the draft/final/group/capture/manifest types exactly as the design specifies.
3. Implement unknown-safe validators with shared record/array/string/hash/ID helpers.
4. Delete dead manifest/type/validator exports and old public names.
5. Run the contract test and typecheck to obtain the expected consumer compile failures before migration.

## Task 3: Migrate Builder draft and trusted promotion (`HSE-01.2`)

**Files:**

- `scripts/finalize-spatial-build.ts/.test.ts`
- `scripts/agent-builder-self-check.ts`
- `scripts/agent-self-check.test.ts`
- `scripts/builder-skill.test.ts`
- `scripts/run-spatial-world-agent.sh`
- `.codex/skills/worldkit-canonical-builder/references/canonical-template.md`
- generated `.codex/skills/worldkit-canonical-builder/scripts/self-check.mjs`
- `docs/22-hosted-scene-brief-and-evaluation.md`

**RED:**

1. New draft promotes to final `visualTargetMappings` and derived `visualCaptureGroups`.
2. Old kind/field, final-as-draft, unknown keys, invented entity, and incomplete primary mapping fail.
3. Source and bundled Builder accept/reject the same fixtures and emit the same current validator version.

**GREEN:**

1. Import the draft/final types and validators from Runtime Contracts; delete the private draft interface/guard.
2. Update prompt/template/checker to the draft discriminator and `visualTargetMappings`.
3. Update promotion and its hashes without changing Scene Brief raw-byte joins.
4. Generate the Builder bundle through `pnpm generate:agent-self-check`, then prove `pnpm check:agent-self-check` is read-only.

## Task 4: Migrate live capture, manifest, and visual consumers (`HSE-01.3`)

**Files:**

- `scripts/worldkit.ts`
- Playground capture API/adapter/startup/main files and focused tests
- Studio server/recording files and tests
- styled/visual reconstruction scripts, Python consumer, Runtime Contracts visual reconstruction DTO
- rigged/G Bot verifier consumers

**RED:**

1. Capture API result has exact `visualTargetId/imageDataUri`; old keys are absent.
2. Whitebox manifest is written/read only at `triviews/whitebox-triview-manifest.json` with `whiteboxTriviews[].imageUri`.
3. Studio refuses an otherwise complete artifact chain containing only the old file/kind.
4. Visual/styled/recording consumers reject traversal URI and retain the same semantic visual target.

**GREEN:**

1. Rename only the HSE-01 contract family; retain unrelated app-local prototype IDs and runtime-babylon internal data URLs.
2. Update every producer/consumer and test fixture atomically; do not dual-read old files.
3. Run the focused contract, worldkit/capture, Studio, visual reconstruction, and Python tests.
4. Run a zero-census for all retired current-source symbols/kinds/fields/file names, excluding dated history.

## Task 5: Rebase atomic Preview on the final contract (`HSE-00R`)

**Files:**

- `apps/studio/preview-bootstrap.mjs/.test.mjs`
- `apps/studio/server.mjs/.test.mjs`
- `apps/playground/src/authoring-loader.ts/.test.ts`
- `apps/playground/src/main.ts`
- `apps/studio/public-proxy.mjs/.test.mjs`
- `docs/15-creator-studio.md`

**Steps:**

1. Change assembler/client validation from old `mappings` and group `id` to the frozen final types.
2. Preserve before/after record, evaluation attempt, canonical hash, scene/spec, and complete group mapping checks.
3. Keep one `/preview-bootstrap` request and prove the two split routes remain absent/forbidden.
4. Run Studio, full Authoring loader file, and typecheck.

## Task 6: One Registry discovery authority and honest Motion Catalog (`WS-01`)

**Files:**

- Subject Registry types/implementation/closure/capability resources and tests
- Motion Kernel catalog
- Authoring normalizers, Compiler, Execution Plan
- CLI, Browser, Preview Registry, promotion and verifier consumers/tests

**RED:**

1. CLI describe of `worldkit://control-feel-profile/humanoid.medium-ground@1` must succeed.
2. Unified list contains every resource exactly once, sorted/frozen; every entry identity-resolves.
3. Every public Ref edge resolves to the expected kind; dependency-edge closure equals SubjectPreset closure.
4. Execution Plan and Catalog exact-key tests reject `parameterSchemaRef` and `runtimeParameterNames`.

**GREEN:**

1. Add `resolveResource` and `listDiscoverableResources`; keep typed resolvers as projections.
2. Add one reference-edge enumeration consumed by admission and closure.
3. Migrate CLI/Browser/Preview/promotion/normalizer consumers from hand-composed lists.
4. Delete the two dead Motion Kernel fields and update hashes/fixtures atomically.
5. Run Registry, CLI, Browser, Authoring, Compiler, and tracked fixture checks affected by content hashes.

## Task 7: One Subject serialized vocabulary owner (`WS-02`)

**Files:**

- Create `packages/subject-contracts/`
- Runtime Contracts SubjectPreset/Execution Plan/Runtime Session
- Subject Registry, Subject Actions, Authoring, Compiler, Runtime Babylon
- product/fixture scripts and manifests/lockfile
- remove obsolete generic contracts vocabulary

**RED:**

1. Shared constants are frozen, unique, and exact.
2. Candidate rejects unknown `resourceKind` before drift comparison.
3. Execution Plan rejects unknown Action, Bone, and Topology.
4. Authoring package schema rejects stale bone `root` and is exact-parity with the shared constant.
5. Automatic resolver outputs only `idle/walk/run/jump`.

**GREEN:**

1. Create the dependency-light package with closed types, guards, and SubjectPreset DTOs.
2. Replace duplicate public definitions with imports; do not re-export compatibility aliases from former owners.
3. Update Schema/runtime validators to consume the closed guards and remove stale `root`.
4. Update direct package dependencies and lockfile.
5. Run focused Subject/Authoring/Runtime tests plus typecheck.

## Task 8: Truthful active publication (`WS-00`)

**Files:**

- `docs/00-project-overview.md`
- `docs/18-refactor-progress-and-backlog.md`
- `docs/20-gameplay-integration-contract.md`
- Site only if its rendered claim needs a matching wording change

**Steps:**

1. Remove contradictory “M5 incomplete” and unchecked historical R1b completion entries without erasing later roadmap gaps.
2. Document Host Reset and Browser Reset separately, with exact RuntimeHost/Browser links.
3. Run claim census/link diff; run Site test only if Site source changed.

## Task 9: Supervised public Studio (`HSE-02`)

**Files:**

- Create `apps/studio/owned-process.mjs/.test.mjs`
- Create `apps/studio/public-server.mjs/.test.mjs`
- Modify `apps/studio/public-proxy.mjs/.test.mjs`
- Modify app/root package scripts, config example, docs 15

**RED:**

1. Weak/missing key fails before child spawn.
2. Child environment excludes the Basic key and public-wrapper variables.
3. Wrong readiness nonce, child early exit, timeout, and occupied proxy port leave no public listener or child tree.
4. Authorized real health succeeds without forwarding Authorization.
5. Parent/child crash and SIGTERM close proxy and process group; ignored SIGTERM escalates.

**GREEN:**

1. Implement one app-local idempotent owned-process lifecycle with bounded grace and process-group cleanup.
2. Add a private nonce readiness handshake between wrapper and internal Studio.
3. Start proxy only after the expected child is ready; fail closed on child exit.
4. Keep `public-proxy` as the low-level command and point root `studio:public` at the wrapper.
5. Run all Studio tests and a real wrapper topology test.

## Task 10: Move spawn safety to its production owner (`WS-04`)

**Files:**

- Create `packages/terrain-surface/src/spawn-safety.ts/.test.ts`
- Modify Terrain Surface export/manifest
- Modify Compiler, World, Playground test imports/manifests
- Delete Testkit spawn-safety implementation/types and production dependencies
- update README/docs package responsibility text and lockfile

**RED:**

1. Copy the existing exact diagnostic matrix to the new owner before moving implementation.
2. Add architecture negative asserting zero non-test source/manifest imports of `@whitebox-world/testkit`.

**GREEN:**

1. Move without changing algorithm, types, diagnostics, ordering, epsilon, or defaults.
2. Update imports/dependencies and delete old implementation with no facade.
3. Run Terrain Surface, Compiler, World, scene tests, typecheck, and zero-census.

## Task 11: Source-generated Planner checker (`WS-07A`)

**Files:**

- Create `scripts/agent-planner-self-check.ts`
- Extend bundle builder/check library/tests and root scripts
- Replace generated Planner checker
- update Studio expected validator version/fixtures and docs 22

**RED:**

1. Source and tracked bundle both run valid, duplicate visual target, second Subject, and 49-character movement fixtures.
2. Assert exact status/diagnostics/receipt bytes and raw Scene Brief content hash.
3. Mutate either tracked bundle in a temporary copy; check fails and does not repair it.

**GREEN:**

1. Adapt `parseSceneBriefV1` output to the portable receipt; do not reimplement rules.
2. Generalize explicit generate/check to planner and builder.
3. Regenerate both bundles once, run check, and prove tracked fingerprints remain unchanged.

## Task 12: Read-only workspace boundary floor (`WS-05A`)

**Files:**

- Create boundary scanner/verifier/tests
- Create `config/workspace-boundary-debt.json`
- Modify root scripts/test census/CI only as required

**RED:**

Test missing direct dependency, private sibling source, production-to-devDependency, nonexistent/test-only export, cycle, unregistered debt, and stale debt. Test a legal exported `/testing` edge.

**GREEN:**

1. Parse static/export/dynamic/require imports with TypeScript AST.
2. Resolve workspace manifests/exports and production/test classification deterministically.
3. Require exact debt entries with importer/specifier/owner/reason/removal gate; reject wildcards.
4. Add the read-only verifier to the aggregate without duplicating existing contract/heavy lanes.

## Task 13: Audit disposition, final gates, review, and main integration (`ARC-INT`)

**Files:**

- `docs/reviews/2026-08-24-workspace-structure-authority-review.md`
- active docs touched above
- no product files except confirmed review fixes with a new RED

**Steps:**

1. Rebase/merge latest `origin/main` into the worktree and perform a semantic three-way review of every authority.
2. Update the audit baseline, counts, finding dispositions, root-cause/deferred split, work graph, and exact evidence. Do not mark deferred P2 maintenance as fixed.
3. Run focused tests invalidated by the final merge/fixes.
4. On the final unchanged tree run generated checks, boundaries, Studio, independent lane if changed, typecheck, root test once, build once, and only the required Browser/capture verifier.
5. Record pre/post tracked and untracked fingerprints, `git diff --check`, and branch/upstream state.
6. Use project-local read-only Cursor completion review; independently reproduce every finding and fix only confirmed defects with a RED first.
7. Read the finishing-development-branch skill, commit all final truth updates, merge the verified branch into local `main`, push `origin/main`, and verify remote SHA. Do not force-push.
