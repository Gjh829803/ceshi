# Native-default World Generation and Opening Gate Implementation Plan

**Goal:** Make every omitted-source world-generation request use the existing Babylon Native reconstruction transaction, while recording opening composition diagnostics and applying the explicit execution-purpose publication policy.

**Architecture:** `agent:world` is the sole source-neutral public dispatcher. It defaults to `babylon-native`; the Canonical shell is an internal explicit-source executor. Native prompt/reference input is converted into one frozen Case by a trusted Host preparation step, then handed to the existing reconstruction production transaction. The Capture owner computes one identity-bound Host gate; quality failure blocks publication only for explicit `strict-acceptance` with `qualityGateMode: "required-for-publication"`, not ordinary production.

**Spec:** `docs/superpowers/specs/2026-09-02-native-default-world-generation-and-opening-gate-design.md`

**Current policy amendment (2026-09-05):** the later
[production outcome parity design](../specs/2026-09-04-block-world-production-outcome-parity-design.md)
and [effect parity plan](2026-09-04-block-world-production-effect-parity-implementation.md)
supersede the original Mapper-task and unconditional quality-rejection rules.
The affected clauses below are synchronized to that cutover. Checkboxes record
implementation checkpoints, not fresh Case, aggregate CI or review acceptance;
[the progress ledger](../../18-refactor-progress-and-backlog.md) is the only live status authority.

## Constraints

- Exactly two mutually exclusive Scene Sources remain: `canonical` and `babylon-native`.
- Omitted `sceneSourceKind` means `babylon-native`; Canonical requires explicit selection.
- `agent:world` is the only public generation entry; no Native alias or failure fallback exists.
- Local/cloud changes only Codex execution location.
- Existing Native Check, Package, Receipt, RuntimeHost, Havok, Subject, Input, Action, Camera and lifecycle owners are reused.
- Formal Capture computes the Host gate; ordinary-production quality diagnostics
  cannot become publication blockers. Identity, payload, transport, cleanup and
  retained legacy-equivalent third-person entry validation remain enforced.
- Failed or stale Native input never reuses or mutates a frozen Case.

## Dependency graph

```text
NDG-10 source contract + public dispatcher
  -> NDG-20 source-specific frozen Route/Attempt identity
  -> NDG-30 trusted Native Case preparation
  -> NDG-40 Studio atomic source cutover

OCG-10 identity-bound Capture observations
  -> OCG-20 execution-purpose-aware gate admission
  -> OCG-30 strict-policy rejected Candidate evidence

NDG-40 + OCG-30
  -> NDG-90 focused verification and independent review
```

## NDG-10 — Public source contract and dispatcher

**Owned files:** `packages/scene-authoring-contracts/src/scene-authoring-contracts.ts`, `scripts/agents/run-world-agent.ts`, `scripts/agents/run-canonical-world-agent.sh`, root `package.json`.

**Deliverable:** one `sceneSourceKind: "canonical" | "babylon-native"` parser, omitted-to-Native behavior, explicit Canonical dispatch, and no public plan/build or Native aliases.

- [x] Add parser tests for omitted Native, explicit Canonical and rejected aliases.
- [x] Route Native to the reconstruction runner and Canonical to the retained internal shell.
- [x] Remove `agent:world:plan` and `agent:world:build` public scripts.
- [x] Preserve Canonical plan/build operations only behind explicit `--scene-source canonical`.

## NDG-20 — Frozen Route and Attempt identity

**Owned files:** `scripts/scenes/world-generation-route.ts`, `scripts/scenes/record-scene-authoring-attempt.ts`, and the existing reconstruction Route owner in `scripts/reconstruction/generation-request.ts`.

**Deliverable:** the public dispatcher freezes source selection before source-specific work. After the unified Planner has produced the identity-bound Scene Brief, Canonical emits and validates its formal Route before Builder/Attempt work rather than manufacturing `canonical-default`; Native reconstruction continues to recompute and compare its admitted Route inside its existing production owner.

- [x] Remove the Canonical default Route constructor from Attempt recording.
- [x] Write and validate Canonical Route bytes after Planner self-check and before Builder/Attempt execution.
- [x] Keep Native Route recomputation in the existing reconstruction production owner.
- [x] Reject Route/Brief/Source identity disagreement fail-closed.

## NDG-30 — Trusted Native Case preparation

**Owned files:** `scripts/reconstruction/run-native-world-agent.ts` and `scripts/reconstruction/native-world-case-preparation.ts`.

**Deliverable:** prompt/reference input first runs the unified Planner task and self-check through a source-discriminated closed output profile. The Host derives the closed baseline proposal from frozen Planner outputs and the visual identity palette, with no additional Native Case Mapper model task. Native planning produces only the Scene Brief, World Plan and entry target; it never creates or retains Canonical Height Intent artifacts. The Host binds fixed cross-Case thresholds, admitted resource descriptors, Case/Profile/Capture intent, bootstrap and bounds, publishes the Case atomically, then invokes the existing reconstruction transaction.

- [x] Support prompt-only and PNG/JPEG reference input.
- [x] Reject unsupported media, changed input identity and partial Case roots.
- [x] Keep one unified Planner while selecting a required `sceneSourceKind` output profile: Canonical retains Height Intent; Native has exactly three semantic outputs and no Height Intent.
- [x] Bind the selected Scene Source in `planner-self-check.json`, replay the same route-aware checker in the Host, and reject Native receipts in the Canonical terrain finalizer.
- [x] Derive one closed baseline proposal in the Host without another Mapper model task (current parity cutover).
- [x] Copy admitted descriptors and Skill/checker closure from repository-owned frozen resources.
- [x] Clean temporary task and staged Case roots on every failure path.
- [x] Invoke the existing Check/Package/Runtime/Capture/Evaluation/repair transaction without a Canonical fallback.

## NDG-40 — Studio atomic cutover

**Owned files:** `apps/studio/src/server.mjs`, `apps/studio/public/index.html`, `apps/studio/public/app.js`.

**Deliverable:** every new Studio job freezes `sceneSourceKind`, defaults Native, passes the same field to `agent:world`, and exposes the Native final Package/Capture/Evaluation/Launch closure instead of testing Canonical filenames.

- [x] Default new jobs and test-set jobs to Native; retain explicit Canonical selection.
- [x] Include Source in immutable job identity, persistence, retry and spawn arguments.
- [x] Use source-specific artifact closure and Native Capture as the Native cover image.
- [x] Do not route Native Package through the still Canonical-only Viewer bootstrap.
- [x] Return `STUDIO_PREVIEW_NATIVE_USE_FINAL_LAUNCH` instead of silently falling back to Canonical Preview.

## OCG-10 — Identity-bound opening observations

**Owned files:** `packages/runtime-contracts/src/formal-world-capture.ts`, `packages/runtime-babylon/src/formal-world-capture-provider.ts`, `scripts/reconstruction/opening-composition-host-gate.ts`, and the current shared `scripts/visual/entry-third-person.ts` validator (the former Python entry is removed).

**Deliverable:** the same formal Capture transaction records the SDK Camera Snapshot, controlled Subject projection and explicit Native visual-group projections. The Host evaluates fixed cross-Case safety limits plus Case/Profile region and anchor thresholds.

- [x] Record the controlled Subject center, size and coverage from the rendered SDK entity.
- [x] Reject Subject identity mismatch; measure and diagnose center drift and scale.
- [x] Measure and diagnose SDK camera collision retraction, FOV drift and pitch drift.
- [x] Measure and diagnose missing, out-of-region or out-of-anchor semantic targets and incorrect depth order.
- [x] Keep semantic measurement tied to explicit Package materializer handles; never scan Mesh names/tags.
- [x] Retain legacy-equivalent third-person entry validation; do not promote the additional quality measurements to ordinary-production blockers (current parity policy).

The current near-field obstruction signal is the SDK Camera Domain's requested-versus-effective arm and collision-retracted state. This checkpoint does not introduce an RGB-derived or second depth-map authority. A future richer occlusion measurement must extend the same formal Observation contract and Capture provider; it must not become a post-publication Studio heuristic.

## OCG-20 — Production Capture admission

**Owned files:** `scripts/reconstruction/formal-capture.ts` and `scripts/reconstruction/production-run-ports.ts`.

**Deliverable:** the reconstruction owner supplies the explicit execution purpose and gate inputs. Case/Profile/Request hashes are joined before evaluation. Ordinary production preserves quality diagnostics without vetoing a valid Capture; only explicit strict-acceptance with a required quality gate rejects publication on quality failure. Hosted cleanup remains required.

- [x] Add stable Host gate diagnostics.
- [x] Validate Case/Profile/Request identity before gate evaluation.
- [x] Evaluate after the exact opening Capture and complete Runtime cleanup before publication.
- [x] Require gate input at the production owner type boundary.
- [x] Preserve the lower-level transport function only for isolated transport tests.

## OCG-30 — Rejected Candidate evidence

**Depends on:** OCG-20.

**Scope:** strict-policy rejected-Candidate evidence; not an ordinary-production quality veto or an extra repair-task prerequisite.

**Execution mode:** `main-agent-only`.

**Owned files:** `scripts/reconstruction/formal-capture.ts`, `scripts/reconstruction/opening-composition-host-gate.ts`, `scripts/reconstruction/production-run-ports.ts`, and `scripts/reconstruction/run.ts` plus their focused tests.

**Inputs:** one fully validated Hosted Capture payload and one identity-bound failed `OpeningCompositionHostGateResultV1`, with explicit strict-acceptance and required-for-publication policy.

**Outputs:** one immutable `rejected-capture/` directory containing the rendered views, observations, and `opening-composition-gate-result.json`; one rejected-Capture result surfaced by the strict-acceptance invocation.

**Deliverable:** a composition-gate failure under the explicit strict policy remains fail-closed for formal admission while preserving identity-bound evidence for inspection. That rejected result never publishes `formal-world-capture-receipt.json`, never marks the world Ready, and never mutates an accepted `capture/` path. Ordinary production does not enter this rejection path merely because quality diagnostics fail and does not launch an external source-repair task for them.

- [x] Publish rejected evidence atomically only after payload validation and a completed Hosted cleanup.
- [x] Keep transport, payload, stale-identity, and publication failures free of misleading rejected-Candidate output.
- [x] Surface the rejected opening image, gate-result, and verified Attempt
  WorldPackage paths in the strict rejection result so `worldkit native run` can open
  the Candidate with an explicit rejected status.
- [x] Preserve detailed target/measurement/threshold diagnostics without lowering thresholds.
- [x] Lock the strict rejection's no-Receipt and no-Ready boundary with focused tests; preserve ordinary-production publication policy separately.

## NDG-90 — Verification and handoff

- [x] Focused contract, Route, preparation, Capture, evaluator and visual-validator tests.
- [x] Studio server tests.
- [x] TypeScript typecheck.
- [x] Test census and `git diff --check`.
- [x] Run dispatcher smoke checks for omitted Native and explicit Canonical selection.
- [ ] Run one real omitted-source local reference Case and retain identity-bound final artifacts.
- [ ] Run one explicit Canonical smoke Case.
- [ ] Perform independent branch review and close every P0/P1 before merge.
- [ ] Freeze the merge-candidate SHA and run the one final affected/full gate checkpoint.

The unchecked NDG-90 evidence items are merge/admission evidence, not missing implementation hidden behind a compatibility path. This branch must not be described as production-complete until they pass on its final reviewed SHA.
