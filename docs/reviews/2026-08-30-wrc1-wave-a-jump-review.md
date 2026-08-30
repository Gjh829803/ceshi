# WRC-1 Wave A Split-Jump Merge-Candidate Review

- Review date: 2026-08-30
- Evidence source commit: `4b6a3fbe1c4cb41009a3c39bfc6af64c5923cf97`
- Branch base: `origin/main` at `38ca91b52af005237420875e27c588c6ebf02b2c`
- Design authority:
  [`2026-08-30-wrc1-pr41-split-jump-correction-design.md`](../superpowers/specs/2026-08-30-wrc1-pr41-split-jump-correction-design.md)
- Implementation plan:
  [`2026-08-30-wrc1-wave-a-jump-authority-implementation.md`](../superpowers/plans/2026-08-30-wrc1-wave-a-jump-authority-implementation.md)
- Local disposition: **implementation and scoped evidence complete; first-pass Cursor findings
  repaired; a fresh exact-SHA Cursor Cloud review and affected heavy gates remain required before
  merge**
- Release status: `experimental`

This is a Mode B merge-candidate review. It does not mark `JUMP-0..3` or `WRC-GOV-1` complete in
the live backlog before the replacement branch is independently reviewed and merged to `main`.

## 1. Authority verdict

Wave A follows PR #41 rather than the rejected PR #51 authority path:

- `CharacterMovementRuntimeV1` exclusively owns buffered/anticipating/airborne/landed Jump Episode
  state, variant selection, fixed-Tick timing, physics proposal, Snapshot, Hash, reset, replay and
  rollback.
- Subject Actions resolves presentation only from the committed Movement result. There is no caller
  `jumpPresentation`, `SplitJumpIntentV1`, Babylon pending/active jump state, or animation-driven
  rewrite of `jumpPressed` / `jumpHeld`.
- Babylon consumes the committed presentation key, plays admitted ordinary Action bindings and may
  adjust only a Subject-owned visual descendant for foot support. Body, Subject Origin, Camera and
  Gameplay state remain unchanged.
- The exact Alpha GLB and manifests are admitted through Registry, Resource Lock, WorldPackage and
  Host resolver boundaries. The product verifier derives its expected Subject set from Normalized IR
  rather than assuming one instance.
- A quick Space press is latched until the next fixed input sample. Shift state is frozen at press
  time, so a released `Shift+Space` still commits the large variant without adding a new Motion Kernel
  identity consumer.

The mechanical authority policy reports one protected fact, `jump-episode`, across 655 scanned files
and rejects provider-side owners or forbidden input mutation.

## 2. Asset and runtime admission

The admitted product asset is:

- Subject Asset: `worldkit://subject-asset/actor.humanoid.alpha-local-actions@1`
- GLB SHA-256: `580113b6d9a80c0d40a93a77f1e09a564585b0d6665d8814b9d9401f1d51260e`
- byte length: `6,841,456`
- Control Feel: `worldkit://control-feel-profile/humanoid.alpha-local-actions@1`
- Control Feel hash: `sha256:d4ba87d4aa77af6faff83d41c222d57688a1a202037f34674eba9a1182bb00b9`
- small anticipation: `50` fixed ticks at 60 Hz
- large anticipation: `54` fixed ticks at 60 Hz

The source asset contains bounded Hips translation in the split-jump clips. Runtime admission now
measures it through the installed Babylon parent world matrix and accepts it only when all of these
conditions hold:

1. the Clip has exactly one admitted `rootMotionMode: "in-place"` binding;
2. repeating Clips close within `0.0001 m`;
3. the world-space translation envelope is at most `0.5 m`;
4. small takeoff and airborne tracks target the same root property and meet continuously;
5. non-finite, missing, unbound, accumulating, discontinuous and over-budget tracks fail closed with
   `SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED`.

Focused adversarial coverage includes Bone and linked-node identity, scalar and Vector3 channels,
parent scale, multi-axis diagonal distance, phase discontinuity and over-budget travel.

## 3. Product evidence

The immutable evidence is under
[`examples/evidence/alpha-local-actions-world`](../../examples/evidence/alpha-local-actions-world/verification.json).
It binds the following identities:

- Normalized IR: `sha256:817d52e713acd72d24e8583e0cda239a38874d70c28cdc0de9b562cac69f43b7`
- Execution Plan: `sha256:d9b27d5c72e74b62a0425b2842634ee6e8a077f9fa3e641708b103dbc32502b0`
- World Build Identity: `sha256:b6f217b429a21e1de827fb50db84af80aca9f017b96db49801321c962ee5fe3f`
- WorldPackage root: `sha256:4072fd7cf354577178e4f7771386143cd623ef9cd800d689b0f6e5a987c6f4cb`

The Browser verifier used Chromium `151.0.7922.34`, WebGL2 and SwiftShader. Software rendering is
valid static correctness evidence but not performance evidence.

| Observation | Result |
|---|---|
| two isolated Subjects load | `alpha-primary`, `alpha-secondary` both ready |
| idle support | Tick 12, position `[-2, 0, 18]`, `movementMedium: ground` |
| small jump recipe | `jump`; Tick 60, Y `0.6714166667`, medium `air` |
| large jump recipe | `jump + run`; Tick 64, Y `0.8614854167`, medium `air` |
| visual distinction | small/large silhouette difference ratio `0.9103498542` |
| complete Browser cycle | spawn Tick 0/Y 0; takeoff Tick 51/Y `0.0916666667`; apex Tick 67/Y `0.8171333333`; fall Tick 68/Y `0.81615`; land Tick 92/ground; reset Tick 0/Y 0 |
| collision | 360 walk-right ticks stop at X `1.28`, before the wall budget X `6.8` |
| deterministic publication | `verify:alpha-local-actions:update` followed by check mode produced exact matching artifacts |

The product receipt deliberately records the two fixed-input recipes and their physical/visual
outcomes; it does not publish a caller-provided `jumpVariant` as if Browser V5 observed the private
Movement Episode. Committed `small`/`large` variant selection remains proven by the Movement
Snapshot/Hash/Golden tests at the authority layer.

The reviewer visually inspected [`jump.png`](../../examples/evidence/alpha-local-actions-world/jump.png)
and [`jump-large.png`](../../examples/evidence/alpha-local-actions-world/jump-large.png): the small
pose is compact with arms bent, while the large pose has a materially wider airborne silhouette.
This is rendered inspection, not a human `FeelReviewReceipt`. Human feel promotion remains owned by
the later WRC Action/Camera acceptance work and does not upgrade this experimental profile.

## 4. Local verification record

| Command or gate | Exact-tree result |
|---|---|
| `pnpm check:agent-self-check` | exit 0; Planner and Builder bundles current |
| `pnpm typecheck` after review repairs | exit 0 |
| planned focused suite | 413 pass; one stale catalog expectation found and repaired |
| `selectable-control-feel.test.ts` repair replay | 5 / 5 pass |
| keyboard split-jump latch replay | 1 / 1 pass |
| `runtime.test.ts` after current-pose foot-anchor repair | 139 / 139 pass |
| `pnpm verify:runtime-authority-boundaries` | exit 0; 659 files; policy hash `sha256:b4625e82adc3caff782894e0b2733be33b0a272afb0b386290120e457f8b3e85` |
| `pnpm verify:3c-migration` | exit 0; 11 entries, 61 live references; ceiling not relaxed |
| `pnpm verify:g-bot-subject` after shared verifier repair | exit 0; existing product evidence matches |
| `pnpm verify:alpha-local-actions:update` | exit 0; artifacts published |
| `pnpm verify:alpha-local-actions` after full-cycle repair | exit 0; deterministic check |
| `pnpm build` after final admission fix | exit 0; 2,215 modules; existing chunk advisory only |
| `git diff --check` | exit 0 before evidence commit |

The first independent Cursor Cloud review at `b3e34a40689ac6ee45c31848fcddf836bef09110`
returned an authority GO with four P2 findings. The separate heavy-gate agent passed 19 requested
commands but returned NO-GO because root tests exposed the retired artifact path and a stale
WorldPackage identity gold, while Python validation left an untracked `__pycache__`. All review and
gate findings are repaired in the evidence source commit above; the final exact-SHA replay remains a
separate pre-merge step.

Root `pnpm test` was intentionally not repeated locally. The WRC-1 verification policy assigns full
repository heavy gates and independent review to separate Cursor Cloud tasks against the exact merge
candidate SHA.

## 5. Findings closed during product verification

### P1: Root/Hips translation admission rejected the exact product asset

The previous blanket rejection treated any root or Hips position channel as locomotion authority.
Installed Babylon `9.23.0` inspection and the exact GLB showed that the only position channels belong
to the Hips presentation in `small-jump.takeoff` and `small-jump.airborne`; after the authored `0.01`
parent scale their envelope is approximately `0.312 m`. The new bounded world-space admission keeps
locomotion authoritative while allowing this visual pose data.

### P1: Product verifier assumed exactly one Subject

The Alpha fixture intentionally has two instances. The verifier now compares the Runtime Bootstrap
and Browser Snapshot to the subject IDs in Normalized IR, preserving compiler/runtime identity and
proving multi-instance isolation without fixture-specific branching.

### P1: Asset test terrain contaminated locomotion evidence

The original `0.5 m` procedural relief made an idle Subject slide or lose support, producing `walk`
or `jump` under an empty input sequence. This is an action/asset/collision fixture, not a terrain
traversal fixture, so it now uses zero-amplitude ground and exact Y=0 support anchors. Terrain slope
behavior remains owned by dedicated route/traversal cases.

### P2: New Control Feel exposed a stale catalog gold

The Registry test now includes the Alpha Control Feel in the discoverable catalog while separately
proving it is not selectable by the G Bot definition. No alias, fallback or shared selection set was
added.

### P2: quick-press latch increased a legacy symbol count

The first implementation repeated `activeMotionKernelRef` in a second mapping branch and tripped the
3C migration ceiling. The latch now preserves the transient Space key through the existing mapping,
then consumes it after the fixed sample. Shift-at-press is added only when that existing mapping
resolved `jump`; the migration ceiling remains unchanged.

### P2: Browser evidence mislabeled requested input as committed variant

The verifier no longer serializes a caller-provided `jumpVariant`. Its split-jump section uses
`small` and `large` as recipe slots and records only Browser-observed position, medium and rendered
silhouette. A separate Tick-by-Tick Browser cycle now proves spawn, takeoff, apex, fall, land and
clean reset without exposing the private Jump Episode through Browser V5.

### P2: governance did not reject private owner imports

The authority verifier now rejects static imports or re-exports below
`@whitebox-world/character-movement/*` from the Babylon provider while continuing to admit the
package root contract. A RED-to-GREEN regression proves the exact private-import diagnostic.

### P2: foot anchoring could sample the previous render pose

Installed Babylon `9.23.0` inspection showed that `AnimationGroup.goToFrame()` does not prepare the
Skeleton. The visual sampler now calls the owned Skeleton's `prepare(true)` before reading foot
absolute positions. The regression proves a finite, non-zero correction within the existing
`0.03 m` per-Tick visual-only limit while both committed Subject roots and the sibling instance remain
unchanged.

### Gate blockers: retired evidence path, stale identity gold and Python cache

Alpha evidence now lives under the repository's single checked-in example authority,
`examples/evidence/`. The placement-world identity expectation was regenerated from the changed
Registry lock rather than weakening equality, and nested `__pycache__/` output is ignored so a
read-only test run leaves the tracked-tree contract clean.

## 6. Remaining pre-merge work

1. Commit this review document and use the resulting exact SHA for two separate Cursor Cloud tasks:
   independent full-dimension review and heavy gates.
2. Repair only confirmed findings with a behavior-level reproducer and rerun invalidated gates.
3. Push the replacement branch, create the replacement PR, link and close superseded PR #51.
4. After merge, update the live backlog with the merged `main` SHA and start the next independently
   useful WRC-1 package.
