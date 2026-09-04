# Subject Assembly Agent packs implementation plan

**Status:** complete

**Target branch:** `codex/block-world-main-3c-integration`

## Goal

Make the Hosted Block Builder author one controlled `Subject Assembly` whose
base can be any admitted existing Subject Pack or Agent-drawn rigid Three.js
shape assembly. The Agent may add rigid attachments, select one compatible
Motion Pack, select automatic or fixed locomotion presentation, and select a
Camera Pack with an explicit target binding. Human is only the first complete
rigged pack; it is not an architectural special case.

The first end-to-end proof is a rigged G Bot in fixed idle presentation with an
Agent-drawn sword attachment, powered-flight movement, and a collision-safe
third-person camera. The same APIs must also admit a fully custom rigid mesh
base without bones.

## Frozen responsibility boundaries

- Three.js remains an authoring-only geometry source. Only
  `@whitebox-world/block-world-three` may inspect Three.js objects.
- The Block compiler is the sole resolver from Agent-friendly Pack IDs and Mesh
  bindings to exact package Subject definitions and immutable Registry refs.
- Babylon consumes the existing flattened Runtime Subject descriptor: one
  optional rigged asset plus rigid primitive parts under one Subject root.
- A Motion Pack owns whole-assembly movement. Attachments never own a second
  controller or locomotion state.
- A Presentation Policy selects animation presentation only; it does not change
  physics or motion. Fixed presentation is restricted to a locomotion key that
  the base rig publishes; static bases ignore animation policy safely.
- A Camera Pack selects composition behavior. Camera Director remains the sole
  owner of the committed Camera pose, and Spring Arm remains the hard-collision
  authority for every third-person pack.
- Agent-authored shapes may contribute to the derived Subject collider only
  when explicitly marked `include`. Decorative attachments default to
  `exclude`.
- Test fixtures and primitive traversal proxies remain available to SDK tests
  but are absent from the Agent-selectable Pack catalog.

## Work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / integration point | Evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| `SA-0` | Freeze vocabulary, Pack IDs, compatibility rules, and this graph | — | all | this plan | plan review + diff check | main-agent-only |
| `SA-1` | Add closed Block World Subject Assembly, Motion/Presentation, Camera Pack, and extracted Mesh-part contracts | `SA-0` | `SA-2`, `SA-3` | `packages/block-world/src/types.ts` | typecheck + contract tests | sequential |
| `SA-2` | Bind and validate Agent-drawn box/sphere/cylinder Three.js Subject meshes without treating them as world blocks | `SA-1` | `SA-3`, `SA-5` | `packages/block-world-three` + module loader seam | binding/extraction adversarial tests | sequential |
| `SA-3` | Resolve any admitted registered base or custom Mesh base plus attachments into one flattened package Subject definition | `SA-1`, `SA-2` | `SA-4`, `SA-5` | `packages/block-world-compiler` | registered-base and custom-base compile tests | sequential |
| `SA-4` | Implement powered-flight resources/runtime and fixed-presentation policy without coupling animation to movement | `SA-3` | `SA-5` | Registry catalogs, Canonical compilation, Babylon Motion/Presentation | deterministic 30/60/120-style tick tests, reset, collision | sequential |
| `SA-5` | Implement standard third-person, over-shoulder, giant, and first-person Camera Packs with socket/bounds/local-point targeting | `SA-3` | `SA-6` | Camera Registry profiles + initial target socket seam | compile/parse/director tests + Spring Arm regression | sequential |
| `SA-6` | Publish Catalog V2 and Builder documentation, excluding fixtures from selectable packs | `SA-3`, `SA-4`, `SA-5` | `SA-7` | Agent catalog generator + Builder skill references | generated-file identity + skill tests | sequential |
| `SA-7` | Add flying-sword and custom-rigid-base examples, then run final gates | `SA-4`, `SA-5`, `SA-6` | — | examples/tests; no unrelated worktree files | focused tests, typecheck, contract/resource-heavy/build gates | main-agent-only |

## Stable Agent contract

```ts
controlledSubject: {
  kind: "assembly",
  entityId: "player",
  assemblyId: "flying-sword-rider",
  visualTargetId: "visual-target-1",
  yawQuarterTurnsY: 0,
  baseSubject: {
    kind: "subject-pack",
    subjectPackId: "humanoid.g-bot",
  },
  attachments: [{ subjectMeshBindingId: "flying-sword" }],
  motion: { motionPackId: "flight.powered-standard" },
  presentation: {
    kind: "fixed-locomotion",
    presentationKey: "locomotion.idle",
  },
}
camera: {
  kind: "pack",
  entityId: "camera-main",
  cameraPackId: "third-person.standard",
  target: { kind: "base-subject-socket", socketId: "ThirdPersonTarget" },
  aspectRatio: 16 / 9,
}
```

For a custom base, `baseSubject.kind` becomes `custom-mesh` and names one or
more Subject Mesh binding IDs plus truthful category/topology metadata. Camera
target bindings are `base-subject-socket`, `base-subject-bounds`,
`assembly-bounds`, or `subject-local-point`.

## Compatibility rules

- `ground.character-standard` requires a ground locomotion capability.
- `flight.powered-standard` supplies powered-flight capability/control and is
  compatible with the shared character-body adapter.
- `fixed-locomotion` on a rigged base must name a published automatic
  presentation key. Static custom bases accept it as a no-op visual policy.
- `base-subject-socket` requires the exact socket on the selected base.
- Bounds/local-point targets compile to a Host-created local Camera target
  socket; the Agent never names bones.
- `first-person.standard` requires a valid socket or explicit local/bounds
  target. Other packs use the Spring Arm.

## Non-goals

- Agent-authored skeletons, skinning, morph targets, custom shaders, or
  animation retargeting;
- bone-level attachment authored by the Agent;
- multiple independently controlled bodies inside one assembly;
- arbitrary imported Three.js geometry in this slice;
- runtime interpretation of natural-language goals.

## Completion rule

The slice is complete when both existing-pack and custom-mesh bases compile
through the unchanged Canonical world path, powered flight moves the whole
assembly without walk/run/jump presentation, each Camera Pack resolves its
declared target and preserves third-person hard collision, the Agent catalog
contains no selectable fixtures, bundled Builder scripts are regenerated, and
the relevant repository gates pass on the final tree.

## Completion evidence

- Catalog V2 publishes 26 reusable Subject Packs, 3 Motion Packs, and 4 Camera
  Packs; SDK fixtures are absent from the Agent projection.
- Both `flying-sword-assembly-world.mjs` and
  `custom-mesh-subject-world.mjs` pass the real Block check and compiler.
- The flying-sword Runtime proof moves one rigged base plus rigid attachment as
  a single powered-flight body, keeps the fixed idle presentation, collides
  with solids, uses the requested Socket, and replays deterministically.
- `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `pnpm test:independent`, `pnpm verify:g-bot-subject`, and
  `pnpm verify:canonical` pass on the final implementation tree.
- The complete Studio suite passes 163/163 assertions when its eleven files
  are run independently with Node's force-exit test option; the stock aggregate
  command leaves test-created network handles open in this workspace after all
  `server.test.mjs` assertions finish.
