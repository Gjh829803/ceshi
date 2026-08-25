# WorldKit Builder Resource Catalog

This is a catalog of reusable movement, camera, asset, and collider building
blocks for Canonical AuthoringSpec V4. It is not a whitelist of complete
Subjects. Reference exact Registry versions, but create a package-local Subject
Definition whenever the planned complete shape or assembly is not already a
named Registry Subject.

## Controlled Subject selection

| Intended controlled subject | Exact ref | Rendered form | Policy |
|---|---|---|---|
| Playable ground humanoid | `worldkit://subject-definition/humanoid.g-bot@2` | Rigged product G Bot built from the locked modular Runtime Bundle, with ground actions, collider/control profiles, and camera sockets | Default and recommended for any human-shaped third-person player |
| Golden rigged fixture | `worldkit://subject-definition/humanoid.rigged-golden@2` | Rigged Golden built from the locked modular Runtime Bundle | Use only when the plan explicitly asks for the Golden fixture or a regression fixture |
| Primitive humanoid proxy | `worldkit://subject-definition/humanoid.third-person@1` | One static vertical capsule; normally appears as a red column | Use only for an explicitly requested capsule/primitive placeholder; never use as the default humanoid |
| Primitive quadruped proxy | `worldkit://subject-definition/quadruped.ground-proxy@1` | Static box/cylinder quadruped proxy | Use only for an explicitly simple ground quadruped |

`humanoid.g-bot@2` resolves its registered Subject Asset, locked Runtime Bundle, rig, animation set, collider, locomotion, version-locked control-feel profile, control, camera-context, and render binding through the Registry. Ordinary Authoring JSON contains only the Subject Definition ref. A package-local Subject may use the documented registered Subject Asset ref in one `visualParts` row, but never a Source Package, Model, Clip, Material Set, Runtime Bundle, URL, or filesystem path. Every package-local Subject Definition must explicitly provide a registered `controlFeelProfileRef`; the Builder never authors raw feel parameters as a substitute.

The Registry also contains advanced or experimental packages, but their presence is not production admission. The hosted production lane is fail-closed:

| Movement intent | Builder choice | Status |
|---|---|---|
| Ordinary ground humanoid | `worldkit://subject-definition/humanoid.g-bot@2` | Supported modular rigged Subject |
| Board, glide, vehicle, watercraft or another motion-changing assembly | Use an exact registered Definition only when the bundled validator accepts its complete closure without reserved relationships | Otherwise preserve its shape with a package-local ground approximation and disclose the behavior gap |
| Mount, seated driver/passenger, tethered multi-entity assembly | Do not author | Relationship runtime remains reserved |
| Custom silhouette or multi-part assembly | Author one package-local Subject Definition | Bind asset and primitive visual parts into one controlled Subject, then select a current motion closure independently |

The modular asset boundary and xier120 static-shape choices are explained in `modular-subjects.md`. The assembly and honest fallback boundary is explained in `controlled-subjects.md`. Do not copy a similarly named Registry preset or reconstruct a capability closure from parts.

## Package-local motion closure recipes

The maintained package-local template in `controlled-subjects.md` provides the
current ground recipe. Keep its physics, locomotion, feel, camera-context,
medium, harness and render refs together. Never mix individual refs from an
unapproved closure.

| Executed behavior | `capabilityRefs` | Default / fallback Motion | Control |
|---|---|---|---|
| Camera-relative supported ground | `locomotion.ground@1` | `free-ground.humanoid-medium@1` / `safe-ground@1` | `planar.camera-relative@1` |

All values above use the `worldkit://capability/`,
`worldkit://motion-profile/`, or `worldkit://control-profile/` namespace as
appropriate. A wheeled-looking, mounted-looking or floating shape can remain
one custom Subject while using the ground recipe as a disclosed approximation.
Record the semantic difference in `aiMetadata.description` and continue.

## Camera

Use `worldkit://camera/third-person.standard@1` as the Canonical Camera rig and
configure its initial framing from the actual assembled Subject and entry shot.
The Subject's camera-context profile selects the existing runtime behavior for
its chosen validated motion closure.

Third-person fields:

- `pitchRadians`: `-0.95..0.65`
- `distanceMeters`: `1.8..8`
- `targetHeightMeters`: `0.5..4.5`
- `fovDegrees`: `35..90`
- `aspectRatio`: normally `1.7777777777777777`

For G Bot, a target height near `1.2..1.25m`, distance near `4.5..6m`, and FOV near `50..60°` are normal starting values, not mandatory presets. Derive target height, distance, pitch, and FOV from the complete Subject's bounds, locomotion speed, desired environment visibility, and the strict centered-rear entry requirement.

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

- Prefer a Registry Subject only when both its complete shape and motion semantics match. A missing named Subject is never a reason to omit outputs: author a package-local Subject from registered assets and primitive parts, then bind the closest honest existing motion closure. The Agent never adds or modifies an SDK motion basis.
- Prefer `authoringAvailability: recommended` resources over proxy, advanced, or experimental resources.
- Never silently replace a required rigged humanoid with a capsule because a capsule is easier to validate.
- Treat clothing, armor appearance, weapons, backpacks, and decorative carried items as styling inputs. They do not receive whitebox geometry when they do not change movement.
- When equipment changes locomotion, control, collider, medium, facing, or camera behavior, the whole human-plus-equipment assembly must be one controlled Subject. Follow `controlled-subjects.md`; never approximate binding with a separate Object.
- Shape and movement are independent decisions. The maintained package-local recipe covers free ground and may drive a custom shape without adopting a preset silhouette. Other requested modes use an exact accepted Registry Definition when available, or the disclosed ground approximation otherwise.
- Never emit a capability or Subject Definition whose resolved relationship closure contains `relationship.mount`, `relationship.seat`, or `relationship.tether`. These names are vocabulary, not usable runtime behavior.
- Never inline asset URLs, hashes, Runtime Bundle refs, Source Package refs, Model refs, animation clips, or bone names. Registry resolution owns them. Only exact registered Subject Asset refs explicitly listed in this Skill may appear inside a package-local Subject `visualParts` row.
