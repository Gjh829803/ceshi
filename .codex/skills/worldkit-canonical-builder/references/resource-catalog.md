# WorldKit Builder Resource Catalog

This is the maintained selection guide for resources usable by Canonical AuthoringSpec V4. Reference exact versions. Do not inline Registry definitions or raw asset locations.

## Controlled Subject selection

| Intended controlled subject | Exact ref | Rendered form | Policy |
|---|---|---|---|
| Playable ground humanoid | `worldkit://subject-definition/humanoid.g-bot@2` | Rigged product G Bot GLB with Mixamo rig, ground actions, collider/control profiles, and camera sockets | Default and recommended for any human-shaped third-person player |
| Golden rigged fixture | `worldkit://subject-definition/humanoid.rigged-golden@2` | Rigged Golden GLB fixture | Use only when the plan explicitly asks for the Golden fixture or a regression fixture |
| Primitive humanoid proxy | `worldkit://subject-definition/humanoid.third-person@1` | One static vertical capsule; normally appears as a red column | Use only for an explicitly requested capsule/primitive placeholder; never use as the default humanoid |
| Primitive quadruped proxy | `worldkit://subject-definition/quadruped.ground-proxy@1` | Static box/cylinder quadruped proxy | Use only for an explicitly simple ground quadruped |

`humanoid.g-bot@1` resolves its GLB, rig, animation set, collider, locomotion, version-locked control-feel profile, control, camera-context, and render binding through the Registry. Authoring JSON contains only the Subject Definition ref. Every package-local Subject Definition must explicitly provide a registered `controlFeelProfileRef`; the Builder never authors raw feel parameters as a substitute.

The Registry also contains advanced or experimental packages, but their presence is not production admission. The hosted production lane is fail-closed:

| Movement intent | Builder choice | Status |
|---|---|---|
| Ordinary ground humanoid | `worldkit://subject-definition/humanoid.g-bot@2` | Supported |
| Board, glide, vehicle, watercraft or other motion-changing assembly | Do not select in production | Report a capability gap; a catalog row or experimental kernel is not production admission |
| Mount, seated driver/passenger, tethered multi-entity assembly | Do not author | Relationship runtime remains reserved |
| Hover, powered flight, underwater six-degree movement | Report capability gap | Exact Motion Kernel remains reserved |

The assembly boundary is explained in `controlled-subjects.md`. Do not copy a similarly named Registry preset or reconstruct a capability closure from parts.

## Camera

Use `worldkit://camera/third-person.standard@1` for the default and only allowed rig unless the plan explicitly requires another supported camera profile.

Third-person fields:

- `pitchRadians`: `-0.95..0.65`
- `distanceMeters`: `1.8..8`
- `targetHeightMeters`: `0.5..4.5`
- `fovDegrees`: `35..90`
- `aspectRatio`: normally `1.7777777777777777`

For G Bot, a target height near `1.2..1.25m`, distance near `4.5..6m`, and FOV near `50..60°` are normal starting values. Preserve the plan's opening composition when it gives more specific evidence.

## Package-local whitebox Prototypes

Canonical V4 supports these primitive Prototype shapes:

- `box`: `sizeMetersXYZ`
- `sphere`: `radiusMeters`
- `cylinder`: `radiusMeters` and `heightMeters`
- `cone`: `radiusMeters` and `heightMeters`

Every Prototype has `id`, `version: 1`, `kind: "primitive"`, its shape fields, `collisionEnabled`, and an optional semantic class. Objects reference it as `package://prototype/<id>@1`.

Use collision for walkable or blocking structure. Disable collision for distant silhouettes and render-only identity masses.

When an explicitly constrained Route must cross an ordinary static step, deck, platform, or ramp, an eligible collision-enabled Prototype also declares:

```json
"traversalSurfaceBindings": [
  {
    "id": "deck",
    "kind": "collider-subshape",
    "logicalSubshapeId": "primary",
    "traversalSurfaceProfileRef": "worldkit://traversal-surface-profile/ground.static@1"
  }
]
```

Use this R1B binding only for an actual walkable single-layer static surface included in a required constrained Route. Do not add it to background geometry, vertical blockers, dynamic/overlapping surfaces, open worlds, or merely because an Object has collision.

## World environment

The Canonical schema supports these environment presets:

- `clear-day`
- `golden-hour`
- `overcast`
- `night`

This workflow always authors `clear-day` for generated whitebox worlds. It provides the same neutral daytime inspection light for every case, even when the reference image is night, sunset, foggy, indoors, in space, or deliberately underexposed. The other schema values are not Builder choices in this workflow. Final time of day, colored lighting, atmospheric exposure, materials, weather particles, clouds, flowers, and painterly detail belong to post-whitebox styling and are not collision geometry.

## Selection rules

- Prefer a Registry Subject over a handmade local Subject Definition when the Registry has the intended controllable class.
- Prefer `authoringAvailability: recommended` resources over proxy, advanced, or experimental resources.
- Never silently replace a required rigged humanoid with a capsule because a capsule is easier to validate.
- Treat clothing, armor appearance, weapons, backpacks, and decorative carried items as styling inputs. They do not receive whitebox geometry when they do not change movement.
- When equipment changes locomotion, control, collider, medium, facing, or camera behavior, the whole human-plus-equipment assembly must be one controlled Subject. Follow `controlled-subjects.md`; never approximate binding with a separate Object.
- Never emit a capability or Subject Definition whose resolved relationship closure contains `relationship.mount`, `relationship.seat`, or `relationship.tether`. These names are vocabulary, not usable runtime behavior.
- Never inline asset URLs, hashes, rig profiles, animation clips, or bone names. Registry resolution owns them.
