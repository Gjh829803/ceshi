# Agent Whitebox World SDK rules

## Reading protocol

This file contains the repository-wide invariants. Do not preload every linked
document or scan `docs/` broadly.

- Start from the user request, the changed files, and this file.
- Use `rg` to find the relevant heading or contract; read only that section and
  its immediate dependencies. Read a whole design only when the user names it,
  the task changes its architecture, or the relevant section is not sufficient.
- Historical plans, reviews, receipts, and experiments are evidence for their
  recorded tree state, not default current authority.
- Use `docs/18-refactor-progress-and-backlog.md` only for roadmap/status questions.
- Load a project Skill only when the task matches it:
  - spatial planning: `.codex/skills/worldkit-spatial-planner/SKILL.md`
  - Canonical build: `.codex/skills/worldkit-canonical-builder/SKILL.md`
  - Babylon Native Block: `.codex/skills/worldkit-native-block-builder/SKILL.md`
- For Runtime implementation or review, use only the applicable sections of
  `docs/reviews/runtime-deep-review-checklist.md`. Use
  `docs/reviews/full-dimension-review-protocol.md` only for an actual design,
  change, or repository review—not ordinary implementation.

The user's explicit scope and stop instructions take precedence over optional
workflow suggestions.

## Repository ownership and hygiene

- Durable specifications, plans, and reusable guidance belong under
  `docs/superpowers/specs/`, `docs/superpowers/plans/`, and
  `docs/superpowers/skills/`. `.superpowers/` is workflow state only. ADRs and
  reviews belong under `docs/decisions/` and `docs/reviews/`.
- Repository scripts belong in a named responsibility directory under `scripts/`;
  stable entry points belong in the root `package.json`. Do not add executable or
  test files directly under `scripts/`.
- Preserve user-owned changes and work in the requested checkout or worktree.
- Before creating a generic helper, search the repository, runtime/platform APIs,
  Babylon.js, and current dependencies. Use direct `lodash-es` imports for
  established collection/object utilities and Babylon.js for 3D math. Every
  workspace package declares its own direct dependencies.
- Keep domain algorithms deterministic, local to their owner, and covered by
  focused tests.

## Complex work and agent boundaries

For complex SDK or Runtime work, define stable task IDs, dependencies, exclusive
ownership, input/output contracts, integration points, required evidence, and an
execution mode (`parallel-safe`, `sequential`, or `main-agent-only`). Keep
architecture, cross-cutting contracts, and final integration with the main agent.
Parallelize only independent ready work; worker success is not integration proof.

## Public contracts and clean breaks

- Use one canonical term, parser, public entry point, and state owner per concept.
  This repository is unreleased: touching a contract means a current-only clean
  break unless a frozen design explicitly says otherwise. Update Schema, Registry,
  Compiler, generated types/validators, examples, fixtures, receipts, Hashes, and
  consumers together; delete replaced aliases, adapters, fallbacks, and parsers.
- Prefer required discriminators and closed unions. Use `id` for the current
  object, role-qualified `...EntityId`/`...SocketId` for local references, `...Ref`
  for Registry/content resources, and `...Uri` for raw locations. Use
  `schemaVersion` for protocol shape, `version` for Registry resources, `kind` for
  persistent definitions, `type` for Commands/Events/Relationships/changes, and
  `mode` for mutually exclusive runtime state.
- Put units and coordinate domains in numeric field names. Use plural collection
  names, `...ById` for ID maps, and explicit boolean prefixes.
- Keep provider/engine vocabulary behind adapters. AI-facing relationships use
  role-qualified endpoints, never generic subject/target parameter bags.
- A temporary migration path requires a bounded ledger and deletion condition.
  Renaming a duplicate authority is not deletion.
- Consult the relevant section of
  `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md` only when
  these rules do not answer a public-contract decision.

## Runtime and single authority

- State affecting movement, collision, Action, Camera, event outcomes, or
  deterministic evidence has exactly one owner and one Snapshot, Hash, Reset,
  Replay, and Rollback representation.
- Fixed-step Runtime uses one prepared transaction for prepare, commit, abort,
  Snapshot, Replay, Reset, and Rollback. Providers pass placement and normalized
  input to that owner; they do not infer another Gameplay state machine or copy
  transition rules for preview.
- The current capability split is: speed in `control-feel-profile`, boolean
  capabilities in `locomotion-profile`, slope/step in Physics Body, and Character
  support in the single `checkSupport()` path. Do not restore Motion parameter
  bags, ray/AABB grounding, or parallel old/new authorities.
- Verify engine behavior against the installed Babylon/Havok source. A confirmed
  Runtime bug requires a failing reproducer, focused regression, and adversarial
  cases appropriate to the changed owner.
- Run `pnpm verify:3c-migration` when movement authority, fixed input, Locomotion
  publication, or provider/Host ports change. Weakening its structural assertions
  requires a design update and independent review.

## Verification discipline

- Before substantial verification, state the changed inputs, invalidated evidence,
  smallest rerun set, and whether this is the single final full-gate checkpoint.
- During implementation, run only the focused RED-to-GREEN reproducer and directly
  affected contract, typecheck, build, Browser, or capability gate.
- Freeze the candidate before repository-wide heavy gates and one independent
  exact-SHA review. P0/P1 findings block; batch or defer P2/P3. Do not create an
  edit/full-test/review loop for advisory cleanup.
- Evidence belongs to relevant inputs and tree state, not merely to a SHA. Rerun
  only invalidated evidence. Do not repeat a command already covered by a broader
  passing command; root `pnpm test` includes `pnpm test:scenes`, while Studio,
  production builds, Browser checks, rendered inspection, and manual interaction
  remain separate evidence layers.
- Documentation-only truth changes receive diff/link checks only. If the user says
  to stop testing, cancel immediately, run nothing further, and report existing and
  missing evidence.
- Frozen Skill/checker copies change byte-for-byte with their live source and use
  the focused drift gate. Native Block Builder changes require
  `pnpm check:native-block-builder-skill`.

## Scene and workflow boundaries

- Planning, whitebox implementation, and visual styling are separate authorities.
  Planner owns plan inputs; Host owns locks and trusted compilation; Builder owns
  implementation; Visual Bible works from verified SDK captures. Conflicts produce
  a formal change request, never a silent upstream edit.
- Catalog scenes follow: plan -> `plan:freeze`/`plan:check` -> implement/register ->
  `test:scenes`, `typecheck`, `build`, `plan:scene`, `plan:scene:check` -> SDK
  capture -> `visual:finalize`/`visual:check`. Do not edit Runtime, physics, camera,
  or rendering internals merely to create a scene.
- Automatic Planner and Canonical Builder work runs through exactly one Codex task per stage.
  Hosted Planner and Canonical Builder each perform bounded checker-driven repair inside that
  task. The Host replays each checker once and does not create hidden repair jobs. Their Skills
  own output schemas, provenance, terrain, subject, framing, and self-check details.
  Each Native Attempt is itself one Codex task and may perform only its own bounded checker-driven self-repair inside that task.
  Never describe or implement an external Native Attempt as same-task self-repair, a hidden retry, or a fallback.
- Formal generic Codex stages route through `scripts/agents/run-codex-task.mjs`, use
  `gpt-5.6-sol` with `xhigh`, and reject downgrade. Treat job-creation POSTs as
  non-idempotent: submit once and reconcile unknown outcomes by `request_id`. Never
  expose credentials, mutable checkout state, another case's artifacts, or
  undeclared output paths to isolated tasks.
- ADR-0007 is the only Babylon Native authoring exception. A Native Module may
  create visuals only in the Host Candidate Scene and submit Spawn/static Collider
  intent through the versioned boundary; it may not create Engine, Scene, render
  loop, physics objects, main camera, Gameplay entities, input, timers, or another
  tick. One world selects exactly one Scene Source.
- Generated planning images are untrusted proposals. Runtime consumes only metric
  Authoring data compiled by the trusted Host. Whitebox tri-views come from the
  verified Runtime, never image generation.

## Product and capability boundaries

- `pnpm dev`, `worldkit run`, and Studio Preview share the Babylon/Havok Viewer and
  RuntimeHost. `worldkit run` fixes one Canonical source; query parameters cannot
  replace it. `?artifact=1` is planning capture only, and the removed
  `?authoring=1`/catalog-gameplay routes must not return.
- On `504 Outdated Optimize Dep`, refresh Vite dependencies once; do not change
  Runtime code to fix cache state.
- Catalog authoring targets outdoor heightfield worlds. Hosted Builder capabilities
  and approximations are owned by its Skill and validators; do not claim exact
  support from a visual approximation or smoke test.
- Mount, seat, and tether remain reserved unless a frozen implementation design
  activates one. Per-scene Builder output is data-only and never modifies
  SDK/Registry/Runtime/Compiler/protocol authorities.
