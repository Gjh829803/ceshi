# Three SDK and data production branch

This branch consolidates the current Three Creator production lane, the Three
SDK and the independent Three Episode pipeline. The current user explicitly
excludes the old Babylon production workflow from this integration.

Read [the branch guide](docs/three-sdk-data-production.md) for entry points,
source provenance, implemented boundaries and verification commands.

## Current responsibilities

- `packages/three-world`: Three/Rapier runtime; one fixed clock, physics world,
  character support authority, animation owner and camera writer.
- `scripts/three-creator` and `scripts/cloud/three-eval*`: retain the verified
  Creator v0.2 production delivery contract, including actual self-check input
  recording. Do not silently mix preview-first v0.3 tools with v0.2 validators.
- `scripts/three-episode`: consumes a verified delivered world, plans and records
  six 30-second clips, prepares ten visual styles and video requests. Its own
  recording is independent of Creator's self-check recording.
- Episode execution requires `--stop-before-seedance`. Video provider submission
  and automatic subscription to Creator deliveries are not implemented here.
- Shared human feedback must not be forked by SDK version. World reviews remain
  in the existing shared service; image feedback uses the existing case/style/
  image identity. A previous image decision does not approve different images.
- Generated case data, recorded media, request journals and reviewer stores remain
  external to Git. Private runtime configuration remains under ignored
  `.codex-tmp`; never commit credentials or copy them into model workspaces.

## Existing production and changes

This branch does not take ownership of existing production processes. Do not
restart the closed overnight campaign, submit the paused missing cases, rewrite
running job inputs or create a replacement for an unknown request outcome.
Reconcile the exact persisted request/job identity before any retry.

Source worktrees are preserved. Existing published SDK files were already updated
in place on 2026-09-07, as requested; that deployment is separate from building
new artifacts from this integrated branch. Keep old provider archives as evidence.
A new Episode source derives its runtime identity through the source adapter.

## Engineering and verification

For a cross-cutting change, define responsibility boundaries, dependencies,
exclusive file/process ownership and integration evidence before parallel edits.
Root owns shared interfaces and final integration. Follow
`docs/reviews/runtime-deep-review-checklist.md` for runtime changes; verify actual
installed dependency semantics and use a failing reproducer for a confirmed bug.

Preserve both Creator camera/capture behavior and Episode reset/capture behavior
when integrating the SDK. Passing one side's tests does not establish the other.
Run relevant Three tests, typecheck, test census and runtime prebuild on the final
source state. Keep cloud calls mocked during local contract tests. Do not claim
video readiness from a prompt-only or material-incomplete request.

Ordinary scene tasks may author Three geometry, assets and supported SDK intent;
they must not patch physics, animation, camera or host validators to pass a scene.
New production capsules must bind the integrated source and actual runtime bytes.
Historical runtime locks remain history and do not release this new SDK.
