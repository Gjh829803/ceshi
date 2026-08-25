# Gate Authority Closure V1 Design

**Status:** implementation authority

**Baseline:** `cursor/workspace-structure-audit-ad0d@41bbb4696a4ca315a67f11646dcae368ce95a639`

**Finding authority:** `docs/reviews/2026-08-24-workspace-structure-authority-review.md`

## 1. Goal

Make every default validation command read-only, give generated or captured evidence one explicit update owner, and close the independent-test coverage holes without running an already-covered test twice. Correct the audit where the current tree disproves an earlier claim.

This slice implements `WS-06A`, `WS-06B`, and the Site portion of `WS-00`. It does not implement the remaining Registry, Schema, Preview Bootstrap, Hosted contract, or package-boundary findings.

## 2. Current facts

- Root `pnpm test` already performs the fail-closed Vitest census followed by contract and resource-heavy lanes. `pnpm test:scenes` is a narrower duplicate and is not part of this slice's final gate.
- `apps/playground/vite-host.test.ts` imports `apps/playground/vite.config.test.mjs`, and the importing test is in the contract manifest. The audit claim that CI does not consume this Vite config is stale and must be withdrawn.
- `scripts/agent-self-check.test.ts` currently rebuilds the tracked Builder bundle before comparing source and bundle behavior. That makes the default root test a self-healing producer.
- Four Browser verifiers validate real Runtime behavior and then unconditionally promote staging output into tracked golden directories.
- Six root Node `.test.mjs` files exist, but `scripts/image-delivery.test.mjs` is not in a gate and imports a removed visual-plan producer. Two project-local Cursor Python suites and the Site build/test are also outside CI.
- The Site points at a deleted `/legacy/index.html`. Restoring that Legacy bundle is forbidden.

## 3. Authority model

| State or action | Single owner | Read-only consumers |
| --- | --- | --- |
| Builder self-check source | `scripts/agent-builder-self-check.ts` | bundle checker and source-side parity execution |
| Tracked Builder bundle bytes | `pnpm generate:agent-self-check` | `pnpm check:agent-self-check`, root self-check behavior test, CI |
| Browser verifier staging evidence | the invoked verifier process | default `verify:*` result summary |
| Tracked Browser golden directories | explicit `verify:*:update` scripts | default `verify:*`, reviews, documentation |
| Independent test membership | `scripts/lib/independent-test-gate.ts` | independent runner and census |
| Current architecture Site | `sites/world-sdk-blueprint/app/*` | Site render/build test and readers |
| Gate cleanliness | final CI `git diff --exit-code` | merge/review disposition |

No default `test`, `check`, `verify`, `typecheck`, or `build` command may update a tracked source or golden artifact. A command whose purpose is publication uses an explicit `generate:*`, `*:update`, or existing asset-write name.

## 4. Builder bundle contract

`scripts/build-agent-self-check.mjs` remains the low-level deterministic bundler but accepts an explicit output directory. `pnpm generate:agent-self-check` is the only package script that selects the tracked skill directory.

`pnpm check:agent-self-check` builds into a temporary directory, byte-compares the resulting `self-check.mjs` with the tracked bundle, reports stale or missing output, and removes the temporary directory in `finally`. It never runs the tracked producer first.

The root behavior test executes the already-tracked bundle and the source implementation against the same fixture. It does not build either implementation. Because the test has measured near the contract-lane timeout and exercises Python plus child processes, it moves to `resource-heavy` with reason `measured-duration`.

## 5. Browser artifact publication contract

The following default commands become read-only:

- `verify:canonical`
- `verify:placement-layout`
- `verify:rigged-subject`
- `verify:g-bot-subject`

Each verifier still creates sibling staging output, runs its real CLI/Browser/physics assertions, checks the exact expected file inventory, prints stable verification facts, and removes staging output. It does not compare whole generated directories with tracked goldens because runtime/session identities and screenshots are not byte-stable publication contracts.

Each verifier gains exactly one explicit update command with the `:update` suffix. Update mode executes the same validation path and then uses the existing atomic directory-promotion owner. Unknown CLI arguments fail closed. There is no implicit environment-variable update switch and no compatibility alias.

## 6. Independent test gate

One explicit manifest owns all non-Vitest tests in this slice:

- every root `scripts/*.test.mjs` Node test;
- both project-local `reviewing-with-cursor` Python unittest files;
- the active `sites/world-sdk-blueprint` build/render suite.

The independent runner first performs census discovery and fails on missing, stale, duplicate, or out-of-root rows. It then runs the requested lane or all lanes sequentially. CI calls the all-lanes command once. Studio remains separate because it is a package-owned Node suite; root Vitest remains separate; neither is re-run by the independent runner.

The removed `createVisualPlanSource` test is deleted because its producer no longer exists and the repository has no current consumer for that contract. The two real `importGeneratedImages` behavior tests remain and enter the Node lane.

## 7. Site publication boundary

The Site remains active and is repaired as a current-state architecture overview rather than archived. Its page is rendered directly by the current React entry and summarizes only current, source-backed boundaries:

- Canonical Authoring V4 → NormalizedWorldIR V4 → ExecutionPlan V5;
- RuntimeHost → Babylon.js/Havok;
- Browser Protocol V5 / Snapshot V4;
- current outdoor-heightfield production boundary and explicit capability gaps.

The page must not iframe or reference Legacy assets. The rendered test asserts the current architecture claims and the absence of `/legacy/` publication paths. The Site README describes this repository-specific purpose rather than the original generic starter.

## 8. CI sequence and efficiency

CI runs each evidence layer once:

1. install workspace and Site dependencies;
2. `check:agent-self-check`;
3. `typecheck`;
4. `test:studio`;
5. `test:independent` (Node, Python, Site exactly once);
6. root `test` (census, contract, resource-heavy exactly once);
7. Playground `build`;
8. final `git diff --exit-code`.

The final clean-tree assertion detects any accidental tracked write by any preceding check. It is not a second generated-bundle comparison and does not rerun tests.

## 9. Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | `depends_on` | `blocks` | Exclusive ownership | Input/output contract and integration point | Required evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GAC-01 | Builder generate/check separation | — | GAC-04 | `scripts/build-agent-self-check.mjs`, new checker, `scripts/agent-self-check.test.ts`, Builder package scripts, its manifest row | source TS + tracked bundle → temporary byte comparison; tracked output only through `generate:agent-self-check` | stale-bundle RED, temporary-output GREEN, behavior parity, clean tree | main-agent-only |
| GAC-02 | Browser verifier check/update split | — | GAC-04 | artifact publication helper/tests, four verifier entrypoints, four package-script pairs | verified staging directory + explicit mode → inventory-only check or atomic promotion | check leaves target unchanged; update replaces target; bad args reject; four real check runs leave tree clean | main-agent-only |
| GAC-03 | Independent Node/Python/Site gate and current Site | — | GAC-04 | independent manifest/runner/tests, root scripts, CI lane, `sites/world-sdk-blueprint/**` | discovered suites must equal manifest; runner executes each lane once | orphan/stale/duplicate REDs; image delivery GREEN; Python GREEN; Site build/render GREEN | main-agent-only |
| GAC-04 | Integration, documentation, and audit disposition | GAC-01, GAC-02, GAC-03 | — | `.github/workflows/ci.yml`, README/current gate docs, audit report | one current tree and one coverage matrix | focused suites, census, typecheck, root test, build, clean-tree, independent review | main-agent-only |

All tasks are `main-agent-only` because they overlap root scripts, CI, the audit authority, or shared publication helpers. Parallel mutation would create more coordination cost than elapsed-time savings.

## 10. Non-goals

- Do not restore Legacy, Three.js, Rapier, or deleted packages.
- Do not add a second Vitest lane or include `test:scenes` in the final matrix.
- Do not make nondeterministic Browser artifacts byte-stable by deleting truthful runtime/session identity.
- Do not change Runtime, physics, camera, gameplay, Authoring Schema, Registry, or Browser contracts.
- Do not delete tracked golden artifacts; only correct who may update them.

## 11. Completion criteria

- Default root and Browser verification commands leave tracked files unchanged.
- A stale Builder bundle fails `check:agent-self-check` without first repairing itself.
- Every current independent Node/Python/Site suite is discovered and executed exactly once in CI.
- The Site renders current architecture content and contains no Legacy dependency.
- The audit withdraws the stale Vite-config subclaim and records exact dispositions for this slice without closing unrelated findings.
- Fresh focused and relevant full gates pass on one clean tree.
