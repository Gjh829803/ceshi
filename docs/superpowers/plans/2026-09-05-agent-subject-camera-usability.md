# Agent Subject and Camera usability

## Scope and ownership

Extend the existing Assembly contract with a clearer generated catalog, reusable
setup helper, and fixed playback of registered actions. Keep direct Three.js
Mesh authoring, existing movement kernels and camera implementations. Defaults
are recommendations; explicit combinations remain available when they compile.
No new workflow gate, model task, asset import service, or test-case repair.

| ID | Deliverable / files owned | Depends on | Blocks | Mode | Evidence |
| --- | --- | --- | --- | --- | --- |
| U1 | Fixed-action presentation through subject contracts, Authoring, Runtime bootstrap and animation player | none | U2, U4 | main-agent-only | Compiler, parser, fixed tick/reset/multi-instance animation tests |
| U2 | Catalog defaults, visual/action capability descriptions, recommended versus compatible movement; scripts/lib/agent-authoring-catalog.ts | U1 | U3, U4 | sequential | Every generated default compiles; no human receives kart as a recommendation |
| U3 | Skill-owned setup helper and examples, Builder Skill/reference/prompt, Studio catalog projection | U2 | U4 | sequential | Helper produces ordinary Assembly/Camera fields in local and portable workspaces |
| U4 | Regenerate catalog/bundles; integration, typecheck, relevant aggregate tests, build, true runtime preview | U1, U2, U3 | none | main-agent-only | Test results and visually inspected previews; original cases untouched |

## Contracts

- `presentation.kind = fixed-action` selects one exact published `actionId` from
  the base's Animation Set. Repeat clips loop; once clips play once and hold
  their last frame. It takes effect at tick zero and reset. Explicit gameplay
  actions retain priority; fixed presentation only replaces locomotion visuals.
- Motion and collision retain their existing owners. Fixed playback cannot
  enable swimming/flying/combat or move the subject root.
- The existing `fixed-locomotion` spelling remains supported. Static/custom
  shapes have no actions and use automatic presentation.
- Catalog `recommendedSetup` supplies ordinary `motion`, `presentation`, and
  Camera fields. `compatibleMotionPackIds` means technical composability;
  `recommendedMotionPackIds` means normal use. Primitive proxies are explicit
  choices, separate from reusable GLB models. No implicit model fallback.
- A portable `createSubjectSetup` helper expands catalog defaults into the
  existing authored object fields; it creates no Mesh, separate controller,
  second world schema, or runtime state. Explicit options win over defaults.
- Camera targets remain Socket, base bounds, assembly bounds, or a local point.
  Adding attachments defaults the setup helper to assembly bounds; selecting
  first person uses the published eye Socket, or requires a deliberate point.

## State authority

| State | Owner | Consumers |
| --- | --- | --- |
| Registered visual/action inventory | Subject Registry | Catalog, Authoring, animation player |
| Default authoring combinations | Generated catalog policy | Skill helper, Studio, Builder |
| Fixed action selection | Subject presentation policy | Animation player |
| Active gameplay action / fixed tick | Existing gameplay resolver | Animation player / snapshots |
| Movement, support, facing | Existing motion/Havok controller | Subject transform, gameplay |
| Camera target/orbit/collision | Existing camera director | Rendering, snapshots |

Fixed action sampling uses the existing deterministic animation player and
fixed tick. No second animation clock or direct bone manipulation is added.

## Completion evidence (2026-09-05)

U1–U4 are implemented on `codex/block-world-main-3c-integration`. Original
evaluation cases and the old branch were not edited. Pre-existing worktree
changes were preserved.

- The generated menu contains 21 model packs and 6 explicitly selected geometry
  proxies, 4 Motion Packs, 5 Camera Packs, and 25 G Bot action bindings. The live
  Studio `/api/subject-catalog` returns the same capabilities and defaults.
- `pnpm typecheck`, `pnpm build`, Skill `quick_validate.py`, and final
  `pnpm check:agent-self-check` passed. Build retains its existing large-chunk
  warning. The helper was also imported successfully using plain Node from a
  temporary directory containing only its bundled `.mjs` file.
- All five complete examples pass `checkBlockWorldModuleV2`: default human,
  STK kart, flying sword, seated flight assembly, and custom mesh subject.
- `pnpm test` passed all 3,174 contract tests (3 skipped). Its resource-heavy
  lane passed 556 tests and initially failed 4 bundle-copy tests because their
  temporary fixtures omitted the newly added helper. Those fixture manifests
  were corrected. Final sequential reruns passed all 24 Builder/bundle tests
  and all 7 Planner bundle tests, including the 4 prior failures and a new
  helper-tampering test. The complete aggregate command was not rerun afterward.
- An earlier parallel focused rerun hit two timeouts during simultaneous heavy
  suites; the quiet sequential rerun above passed without changing timeouts.
- `pnpm test:independent:node` passed 161/161. Studio's independent suite passed
  164/165: its unchanged public-server startup test selected an ephemeral port
  too high to reserve the default Playground port (`studioPort + 1000`). A
  focused rerun with a valid explicit Playground origin passed. The updated
  subject-catalog endpoint test also passed.
- `pnpm verify:g-bot-subject` passed with real GLB/Havok. Fixed-action integration
  tests cover movement with stable presentation, tick-zero/reset behavior,
  deterministic replay, multi-instance isolation, and gameplay action priority.
- A real seated-flight preview was rendered and visually inspected at
  `.codex-tmp/agent-pack-usability/seated-flight-final.png`. The seated G Bot is
  supported by custom rigid seat/platform shapes; the requested/effective
  camera arm is 4 m without retraction. This SwiftShader preview establishes
  visual correctness, not hardware performance.
- Detailed command logs are under `.codex-tmp/agent-pack-usability/`.

## Remaining boundaries

- Static models and custom rigid shapes do not gain skeletons or animated limbs.
  Fixed playback does not automatically resize the collider or move sockets.
- First-person and over-shoulder cameras can be selected in authored worlds;
  the existing hosted Planner still requires a centered rear opening. This
  change does not remove or broaden that separate workflow policy.
- No generic asset importer, new generation gate, or automatic repair of old
  evaluation worlds was introduced.
