# Three Creator SDK integration review

## Review metadata

Mode B: implementation review of the experimental Three Creator lane. Frozen
runtime/tool source: `e1fdfd5a52b4f145fb85537a322049be47f9b219` on
`codex/gpt6-world-agent-refactor`. This review does not promote the existing
Native production guard or qualify generated reference worlds.

Installed versions checked in code and executable tests: Three 0.185.1, Rapier
0.20.0, Recast core/generators 0.43.1, GLTFLoader/AnimationMixer from the same
Three version. The original V3 five-case artifacts and runtime lock are retained.

Verification on the affected tree:

| Command / evidence | Result | Scope |
| --- | --- | --- |
| `pnpm test` | exit 0; 354 files, 3843 tests passed, 3 skipped | boundary/census, 310 contract and 44 resource suites; includes new SDK 59 tests and tools 20 tests |
| `pnpm typecheck` | exit 0 | complete TypeScript tree after final frame-clock and reset changes |
| `pnpm test:independent` | Node 201 passed; command exit 1 at Site due to missing local `vinext` | initial environment failure, not reported as a passing aggregate |
| `npm ci --prefix sites/world-sdk-blueprint`, then `pnpm test:independent:site` | both exit 0; Site 1 passed | installed its existing lock without source changes; closes remaining independent lane without rerunning Node |
| `pnpm build` | exit 0 | existing Playground bundle; Three browser build covered separately by actual tools |
| SDK real browser long test and independent archive replay | passed | 181.245 wall seconds, 181.333s MP4, 544 frames, tick 0→10857, 242 trusted keyboard events, 29 repeats, same player identity; 36-file exact closure |
| G Bot/custom fox capability browser fixture | passed, short local fixture | original GLB animation, whole custom actor and tail, E interaction, NPC move/follow, spawn/despawn/visibility/scale; not a reference-quality verdict |
| Rotated asymmetric target Three views | passed with actual browser images | local semantic front, right/back, target and parent rotations, explicit override |
| New gallery staging and browser UI | passed, explicitly local fixture | strict source/reference/profile/closure checks, independent review requirement, separate review storage, real iframe controls and tab pause; not uploaded as a cloud result |

The full root aggregate ran while two narrowly scoped defects were corrected.
Its resource suite loaded the final `world.test.ts` (20) and `tools.test.ts` (20);
focused failing reproducers and final typecheck also passed. Those corrections do
not change the earlier contract suites' inputs. CLI/SDK inputs were byte-compared
with the frozen commit for the final 181s recording. Cloud capsule/browser doctor
and real paired model trials remain separate evidence and are recorded in the
experiment report when completed.

Local records: `.codex-tmp/three-integration-validation/`,
`.codex-tmp/three-creator-smoke/sdk-180-clock-fixed/independent-archive-report.json`,
`.codex-tmp/three-sdk-spike/sdk-capabilities-browser/`,
`.codex-tmp/three-sdk-spike/sdk-capabilities-opening-idle/`, and
`.codex-tmp/three-creator-smoke/triview-orientation/`.

Final local SDK worldBuildHash:
`f9c81ed64020c23a78ccff439c37d85b920f96824be9d1f93de6834411038344`.
Archive SHA256:
`3e142dad4d68f0eabe25a1ab436a53f17cd835a6e792bf09aa94c13f33e21551`.
Its cloud runtime lock field is null: this is local evidence, never cloud proof.

## Rechecking previous conclusions

The old Native five-case evaluation showed that a delivered world and author
waypoint success did not establish reference fidelity, elevated route support or
complete moving subjects. Those observations remain valid. No old case was
manually improved and relabeled as model output. The reported lighthouse
`ADAPTER_FIXED_INPUT_FAILED` still lacks an independently reproduced underlying
cause; the new frame-clock defect below is not presented as that old error's cause.

The new lane removes the Native build-module bridge, fixed primitive/ID policies
and camera composition restrictions. It supplies ordinary Three objects with one
Rapier physics world, optional ground navigation, typed commands and real browser
feedback. This implements the requested auxiliary framework; effectiveness on
model-generated reference worlds must be measured independently.

## Findings and resolutions

### [P1] [D2/D6] First animation frame could silently stop the new world — fixed

- Evidence: the first real 180s attempt retained tick 0, no movement and an empty
  WebM. `start` initialized time with `performance.now()`, then accepted an earlier
  rAF timestamp; negative delta threw and the catch stopped without diagnostics.
- Expected: frame timing uses one browser clock and runtime failures retain their
  original cause. A stopped runtime must not consume an entire long playtest.
- Resolution: initialize from the first rAF callback, clamp backwards deltas,
  record `WORLD_FRAME_FAILED`, and report stopped SDK state immediately in the
  playtest. A failing clock reproducer now passes. An intentional stopped-world
  browser request for 180s returned failure in 1.185s with tick 3.
- Rechecked: corrected 3s browser gate and final 181s same-source delivery passed.

### [P1] [D2/D4] Reset could render a character's bind pose — fixed

- Evidence: Three AnimationMixer `stopAllAction()` restored bind transforms;
  selecting idle without a zero-time update left the paused opening in that pose.
- Resolution: reset now evaluates the selected asset animation before rendering.
  A real AnimationMixer regression failed before the fix and passes after it.
  The asset example explicitly evaluates the chosen initial pose as well.

### [P1] [D1/D2] Nested entities could become unintended parent collision — fixed

- Evidence: registering a skinned decoration beneath a rigid mesh caused the next
  parent collision extraction to reject skinning; ordinary attachments could be
  absorbed into the parent collider. Nested navigation roots were also dropped.
- Resolution: registry-owned WeakSet boundaries stop extraction at independently
  registered descendants. Each physical root is extracted exactly once for nav.
  Parent refresh is staged atomically; reset restores registrations before bodies.
- Rechecked: real rigid/character collision, marker switches, nested navigation,
  decorative skinned descendants and attachment/reset regressions pass.

### [P1] [D2/D4] Transform/camera/capture state differed across resets — fixed

- Evidence: manual-matrix translation remained modified after reset; scaling it
  lost position. Parented cameras and semantic actor facing used local/world axes
  inconsistently; front capture defaulted to the wrong direction.
- Resolution: retain manual matrices and camera projection in reset state, convert
  world commands through parent transforms, preserve rollback state, and share
  local -Z/+Y semantic facing through the observer. Rotated asymmetric browser
  captures verify actual front/right/back images.

### [P2] [D1/D6] Scratch capsules and test imports broke the package boundary gate — fixed

- Resolution: exclude only the repository-root `.codex-tmp` from maintained-source
  discovery, with tests showing other hidden/package-local paths remain checked.
  Existing Creator tests now use the public Native host export and a testing-only
  runtime possession export. No production export or debt rule was weakened.

No known unresolved P0/P1 from the reviewed local SDK checks is concealed as a
passing result. This is not an exhaustive absence-of-defects claim.

## Dimension coverage

| Dimension | Coverage and limits |
| --- | --- |
| D1 boundaries and state ownership | Checked: one Three scene/renderer observation, one physics owner, explicit entity/collision boundaries, isolated cloud source/credentials and versioned delivery |
| D2 runtime semantics | Checked against installed engine behavior and real tests: movement, support, timing, animation, parent transforms, reset, disposal and command rollback |
| D3 dependencies and maintenance | Checked: direct pinned dependencies, minimal cloud capsule, no Babylon bridge in Three package, no invented ground controller or shadow state in mesh userData |
| D4 schema and agent usability | Checked: normal Three authoring, units, stable IDs, closed command union, actual exported API guide, profile-specific examples, reference-first camera freedom |
| D5 authority and compatibility | Checked: user-authorized new experimental lane, immutable old V3 outputs, separate gallery path, no production promotion or semantic pass from technical delivery |
| D6 evidence and evaluation | Local automated, actual browser, images/video and independent archive checks complete; real cloud/pair quality tracked separately and not inferred from these tests |
