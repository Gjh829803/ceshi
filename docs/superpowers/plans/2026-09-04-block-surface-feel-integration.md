# Block Surface Feel integration

## Goal

Let the Block Builder choose immutable ordinary, ice, and mud walkable presets so
the Babylon/Havok collider material and the controlled Subject's grounded motion
both respond to the same Host-owned Surface Profile. Keep traversal admission
(`can this Subject stand here?`) independent from locomotion feel (`how does it
move here?`).

## Stable contracts

- `BlockSurfaceProfileDefinitionV1` is owned by `@whitebox-world/block-world`.
  It owns static-contact friction/restitution and grounded speed,
  acceleration, and deceleration ratios.
- `BlockPresetDefinitionV1.surfaceProfileRef` selects exactly one immutable
  Surface Profile for a solid preset and is `null` for non-solid presets. The
  Agent selects a preset; it never authors numeric physics or feel values.
- Block compilation preserves the selected preset in the canonical object's
  semantic class. The Babylon Block adapter is the sole place that resolves
  that Block-only identity back to a Surface Profile.
- The existing Character support sample remains the only grounding authority.
  Surface selection consumes its supporting contact point; it must not add a
  ray, AABB test, or second grounded-state inference.
- World gravity ownership is unchanged. Surface Profiles do not alter gravity,
  jumping, flight, water movement, or airborne control.

## Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | Depends on | Blocks | Exclusive ownership | Verification | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Freeze the Block Surface Profile and preset contract in this document | none | S2-S4 | this plan | plan diff review | main-agent-only |
| S2 | Add immutable normal/ice/mud profiles and walkable presets; preserve them through Block clustering semantics | S1 | S3, S5 | `packages/block-world`, Block compiler contract tests | preset and compiler tests | sequential |
| S3 | Build one collision group per Chunk and Surface Profile and resolve a profile from support-contact geometry | S2 | S4, S5 | Block collision and reconstructed-surface adapter files | topology/collision tests | sequential |
| S4 | Apply grounded response ratios in both Motion Kernel and Golden Character Movement paths | S3 | S5 | movement runtime integration seams | normal/ice/mud fixed-Tick comparison | sequential |
| S5 | Publish the presets to the Agent catalog/docs and regenerate portable Builder bundles | S2-S4 | S6 | catalog, Builder reference, generated bundles | catalog and bundle checks | sequential |
| S6 | Run focused tests, typecheck, relevant contract gates, and review the final diff | S5 | none | verification process | recorded passing commands | main-agent-only |

## Closed first-slice behavior

| Surface Profile | Physical friction | Maximum speed | Acceleration | Deceleration |
| --- | ---: | ---: | ---: | ---: |
| normal | 0.75 | 1.00x | 1.00x | 1.00x |
| ice | 0.05 | 1.00x | 0.35x | 0.12x |
| mud | 1.00 | 0.55x | 0.60x | 1.25x |

When the authoritative support sample publishes contact points touching more
than one Block surface, Runtime selects the profile with the lowest
deceleration ratio, then lowest acceleration ratio, then lexical Resource Ref.
This makes a partially supported foot on ice predictably slippery and removes
provider contact-order dependence.

## Non-goals

- Arbitrary Agent-authored friction numbers.
- Per-triangle painted materials inside one Block.
- Local gravity fields, conveyors, damage surfaces, footsteps, or particle
  effects.
- Replacing the existing Traversal Surface Profile, whose current role is
  navigation face selection rather than movement feel.
