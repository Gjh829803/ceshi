# PR 233: current asset and actor integration

The PR branch `codex/aircraft-seven-families-20260910` integrates `main`
`c1c3fa3fc1eec524843aec4d2b182db70d48cbf1` while preserving the PR's UEFN
skin, D01–D11 native flying creatures and space training. Original PR head:
`48e8feb7d6c1d187eb3e452a84236f3ec2bdaff2`.

## Asset ownership and discovery

- `assets/three-creator/catalog/<assetId>.json` remains the maintained catalog
  source; `asset-catalog.json` is generated. Humanoid registration and preset
  import update these sources instead of overwriting the aggregate.
- The humanoid manifest selects its visible model. The SDK does not hardcode the
  UEFN filename. URL identity includes the manifest, selected model and action
  resources; concurrent loads share immutable geometry while each actor owns
  its skeleton, inverse bind matrices, mixer, clips, materials and textures.
  Source factories retain immutable resource addresses after earlier instances
  have been disposed. Importing motion sources preserves the selected local skin.
- Model material textures default to off. The shared loader skips image decoding
  before material dependencies are loaded; original GLBs, material factors and
  vertex colors remain intact. The UEFN character therefore appears white by
  default. Browser callers can opt in with `loadTextures:true`; template identities
  and source factories preserve that choice. A Node host without image decoding
  APIs rejects an actual texture request with `MODEL_TEXTURE_DECODER_UNAVAILABLE`.
  Flying-creature flame effects retain their separate texture contract.
- `creature.dragon.d01` through `creature.dragon.d11` expose the new flying
  creatures to Creator. The existing `creature.dragon` denotes a distinct
  grounded-flight preset. Registration copies metadata, not model bytes, from
  the existing measured files in `assets/dragon-training`.
- Each flying asset declares its model, flame texture, calibration, animation
  prefix, source records, supported behavior and limitations. The current Host
  policy permits all eleven; frozen existing production policies remain unchanged.
  Capsule staging includes these exact hash-checked dependencies and excludes
  the separate H01 rider model. Supplied riders continue to use Source101.
- Agent entry: `assets_search` / `assets_describe`, then
  `creator_get_authoring_schema({document:'assets/animals/flying-mounts.md'})` and
  `creator_get_examples({topic:'mounted-interaction',variant:'flying-creature'})`. The example loads only its
  selected asset's resources and hands `FlyingCreatureVisual` to the existing
  SDK owner. Initialization failures clean both pre-transfer and World-owned
  resources. A model/clip alone does not install a second animation controller.

## Runtime integration

Dragon boarding transitions belong to `HumanoidActor`. Control transfer cannot
move another actor's transition or mounted relationship. Occupied dragons reject
another rider or summon request. Episode start preparation clears the selected
actor's old boarding transition. Rendering and physical observations use the same
actor identity, with one physics world, fixed clock and active camera writer.

Space drive-mode and docking commands accept optional `actorId`, defaulting to
the input actor. Discovery and Creator/Episode schemas use the same routing.
Commands do not transfer player or camera ownership. Docking acceptance changes
an intent; callers observe the actual docking status for completion.

## Validation

Evidence is retained locally under `.codex-tmp/pr233-integration/`.

| Check | Result |
| --- | --- |
| Complete local Vitest census | 1,606 cases executed: 1,598 passed initially. Two new-option declaration/signature failures were fixed; both affected suites passed (21 cases). Six existing time-budget failures passed serial reruns with unchanged assertions and timeouts. The original parallel run was not fully green. |
| Real Node model loading | 43 generic asset/library/locomotion cases and 59 source lifecycle/multi-actor cases passed without image decoder substitutes. Covers default embedded-image skipping, unsupported opt-in, cache isolation and failed-load cleanup. |
| Real browser model textures | 2 cases passed with actual Chromium image decoding, both cache orders, material/skeleton ownership, texture objects for SourceCharacter, and factories surviving source disposal. |
| Explicit actor command transport schema | 2 focused cases passed after adding named-actor acceptance and invalid actor rejection. |
| Asset policy, example files, native flying catalog | 27 cases passed, including selected asset bytes and policy isolation. |
| Episode and production orchestration Node contracts | 146 cases passed; cloud transport mocked. |
| Runtime capsule staging | 6 cases passed, including all eleven flying asset closures and the registered example. |
| Playground map/display units | 29 cases passed. |
| Real NPC Playground | Patrol, control transfer, pickup contention, carry/place, two seats, reset, cancellation and map cleanup passed with the UEFN skin; browser/runtime errors empty. |
| Real dragon Playground | Summon, physical approach, boarding, takeoff, turning, braking, flame, camera modes, route/reset and D02 loading passed. |
| Asset/model checks | Generated catalog matches all 43 sources; humanoid model rebuild matches committed bytes. |
| Engineering | Typecheck, lint, test census, runtime prebuild and Playground build passed. |
| Independent review | Actor/cache integration had no remaining P1/P2. A second review found missing example initialization cleanup; fixed before final example validation. |

A first dragon browser attempt did not reach boarding eligibility within its
30-second approach budget; the unchanged physical route succeeded on replay.
Bounded path samples and failure screenshots were added for subsequent diagnosis.
This is not proof that every possible scene approach succeeds.

The focused final Creator/Episode artifact report is
`.codex-tmp/pr233-integration/agent-flying-textures/report.json`. It separates Creator
recording/delivery health from measured mounted flight, braking, flame and
repeatable same-tick Episode frames. The final example source hash is
`b1955d5e85b73c737d62e32e71eeb338bca86feb476722e5f078eda81401dc62`;
Creator recorded successful summoning/boarding, and Episode measured 53.75 m
of flight followed by a stop after 3 seconds of braking. Both report empty
browser/runtime errors. The example cleanup P2 was independently rechecked as
resolved. Runtime bytes:
`282990831cac61f78440e71233fa76afe94d6bd863dd2c5696e4e3bdc54e77e7`.

No cloud generation, production deployment or PR merge is performed by this
integration. Full production clips and manual gameplay feel are outside this
check. Native dragon ground parking does not imply ground locomotion, damage,
audio or per-foot terrain IK; wing/tail tips are outside the core collision fit.
