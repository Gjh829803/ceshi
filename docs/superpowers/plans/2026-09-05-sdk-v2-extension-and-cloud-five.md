# SDK v2 extension implementation and cloud five-case run

User authorization: implement the aligned SDK, fill extension gaps, then generate five cases concurrently in cloud. This supersedes the D0-only pause. Branch codex/gpt6-world-agent-refactor. No edits to old Native generated artifacts. Model remains gpt-6-astra / xhigh.

## Frozen implementation boundary

The existing Three runtime becomes a private WorldEngine (engine.ts/engine-contracts.ts). It remains the sole scene, renderer, physics and fixed-clock executor. The public World facade owns capability registration, commands and epoch-safe authoring. The old field names are private transport only and are not exported as alternate Creator APIs. No second renderer/physics/loop is introduced.

New contracts are in packages/three-world/src/contracts.ts:

- registerMovement: versioned authored function receives readonly body/input/state and a real physics probe; returns XYZ velocity, applyGravity and optional facing/action. SDK owns KCC/contact/support and per-entity state. Ground navigation only advertises ground; an authored movement's existence does not claim generic flying/climbing pathfinding.
- defineParameter additionally supports a synchronous effect for explicitly declared visual or private state channels. Managed entity/physics/camera mutation remains forbidden. Faulting arbitrary authored JS pauses and diagnoses; no claim of arbitrary JS rollback. Initial/reset effects restore registered initial values. Ordinary visual Three code stays ordinary code.
- registerGeometry + entity.set-geometry provide named prepared BufferGeometry for runtime control. replaceGeometry is the Creator shortcut. First implementation replaces a non-skinned Mesh geometry with stable entity/root identity, material and attachments; compound objects may register independently controllable mesh sections. Physical candidates validate before publication, preserve old geometry on failure, invalidate navigation and stale tasks, and reset restores the baseline geometry. No arbitrary geometry arrays are sent through the fast model command.
- Default WASD movement, arrows/mouse orbit, Shift held run and single-press jump. Short jumps use continuous verified jump; no automatic hard landing. Existing role/pose/units/parameter authority from v2 remain.

## Dependency graph and exclusive ownership

| ID | Deliverable | depends_on | blocks | Owner / files | Evidence | Mode |
|---|---|---|---|---|---|---|
| E0 | Extension contract + work graph | D0 + user authorization | E1–E6 | Root contracts.ts, engine-contracts.ts, this plan and specs | Type/API consistency | main-agent-only |
| E1 | Physics carry fix, volumetric camera probe, XYZ movement/probe | E0 | E3,E5,E7 | native_integration_map physics.ts + physics.test.ts | Original movement baseline + adversarial pair/movement/probe tests | parallel-safe |
| E2 | Camera rig | E0 | E5,E7 | model_path_audit camera.ts + camera.test.ts | Desired orientation, transition, obstruction, reset and schedule tests | parallel-safe |
| E3 | Core facade/control/extensions/assets | E0, E1 interface | E6,E7 | Root world.ts/engine.ts/input.ts/geometry.ts/navigation.ts/assets.ts/index.ts and root-owned tests + asset registry | Commands, ownership, initial/reset, stale tasks, geometry failure, custom movement/effects | main-agent-only |
| E4 | Cloud SDK-only five-suite and concurrency | E0 | E8 | cloud_probe_execution scripts/cloud/three-eval-* and doctor/experimental stage | Dry plan, exact runtime/tool body closure, actual account readiness; no model POST yet | parallel-safe |
| E5 | Core integration | E1,E2,E3 | E6,E7 | Root engine/world integration | One real world, no frame/authority duplication | sequential |
| E6 | Creator tools/bridge/examples/docs | E0 interface, E3/E5 semantics | E7,E8 | creator_tools_review scripts/three-creator/*, apps/three-creator-playground/bridge.ts, examples/three-creator/*, packages/three-world/README.md | Actual command/operation observation and fresh public examples | parallel-safe |
| E7 | Required gates + real browser baseline | E1–E6 | E8 | Root integration/evidence directories/review report | Focused tests, full applicable typecheck/test/build, actual input/video/extensions/reset | main-agent-only |
| E8 | Frozen cloud package, 5 parallel SDK cases, independent review/gallery | E4,E7 | delivery | Cloud worker jobs; Root visual/playability review + publication | Five actual jobs, preserved failures, source-bound captures, playable links | sequential |

Cloud can preflight during implementation but only receives a frozen integrated capsule after E7. Use SDK-only five-case selection, concurrency up to 5 subject to observed provider availability. Record actual running concurrency and queue time. Do not switch model or mix runtime revisions to make jobs appear faster. The earlier reference acceptance plan is versioned before model output to reflect arrows as camera controls. No extra raw five-case batch in this requested run.
