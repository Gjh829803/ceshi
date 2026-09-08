# Three world authoring and data production

Read [the architecture](docs/three-sdk-architecture.md), then the relevant
[SDK](packages/three-world/README.md), [Creator](scripts/three-creator/README.md)
or [Episode](scripts/three-episode/README.md) guide. Public contracts and their
actual consumers are authoritative.

## Authoring and capability layers

Creator worlds use white/light-gray primitive environment forms, uniform basic
lighting and a few identifying colors for key landmarks or interaction targets.
Preserve broad reference composition, scale, spatial relationships and real
collision/action conditions. Keep geometry functional and omit decorative detail,
extra clothing/accessories, atmospheric effects, reflections and elaborate shadows.

1. Reuse: `createHumanoidWorld` loads `humanoid.source-101` and its contextual
   controller. Keep the supplied visible humanoid model, rig and actions by default.
   Reuse other supplied subjects when suitable.
2. Bind: author ordinary Three Mesh/Group geometry freely. Bind custom subjects
   through `addCharacter({object,body,movement})`; bind vehicles through their
   visual root and `TrainingVehicleInstance.spec`. Define actual colliders,
   interaction anchors, climb surfaces and water for contextual abilities.
3. Configure: apply and export explicit movement/profile parameters with units.
4. Implement: edit the relevant SDK source module, rebuild it for the project,
   and verify its callers. Delivery must identify the actual runtime bytes.

The asset catalog is a reuse library. It is not the limit of what an Agent can
create. When no supplied subject fits, draw simple geometry and bind its abilities.
Custom skeletons need compatible bone mapping and animation validation. Drawing a mesh alone supplies
neither collision nor a locomotion or skeletal animation controller.

## Execution ownership

- The SDK owns one clock, physics world, controller per actor, animation owner
  and active camera writer. Extensions return intent to those owners.
- Three authoring owns visual geometry, materials, scene composition and game UI.
  Runtime source changes belong in the project runtime build; do not install a
  second physics, animation or camera loop in scene code.
- Creator owns compilation, browser tools, real self-check recording and delivery.
  Complete a real input plan covering the requested core functions and outcomes;
  choose its length by coverage. Episode independently plans and records real SDK
  inputs/actions.
- Keyboard, Agent requests and recordings use the same action contracts and
  controls metadata. Describe preconditions, scene requirements, completion and
  rejection reasons; an available clip is not proof of an executable ability.
- UI uses the Presentation DOM layer. Model input and production recordings use
  the renderer's pure world pixels.

## Production and data

Episode produces six 30-second clips, ten styles and prepared video requests.
Preparation workflows require `--stop-before-seedance`. The separate
[Seedance cloud lane](docs/three-episode-seedance.md) consumes reviewed requests,
dispatches provider jobs and persists native media, checks and delivery in S3.
An automatic Creator delivery subscription is not implemented.
Keep source/runtime/asset hashes, request identities, recorded evidence and
review identity consistent. Reconcile uncertain requests before retrying.
Shared reviews remain in their existing service. Exact image approval does not
approve a different image. Credentials, generated media, request journals and
review stores stay outside Git; private runtime config belongs in `.codex-tmp`.
Do not start, restart or change external production jobs without task authorization.

For GPT-6 task classification, consult the user-confirmed
[account capability record](docs/evaluations/gpt6-three/account-performance/gpt6-capabilities-20260907.md).
Match exact identities through its private mapping and check live availability
separately; unlisted capability is unknown.

## Engineering

For parallel edits, assign exclusive file ownership and agree shared interfaces
before implementation. Root owns integration. Follow the
[runtime checklist](docs/reviews/runtime-deep-review-checklist.md) for runtime
changes. Verify both Creator and Episode consumers, installed dependency
semantics, lifecycle transitions and actual failure conditions.
Run relevant tests, typecheck, test census and runtime prebuild for the final
source. Keep cloud transport mocked during local contract tests. Documentation
changes require link, source-claim, diff and direct schema-consumer checks.
Write current usage directly and concisely; avoid duplicate API drafts or
chronological design narratives.
