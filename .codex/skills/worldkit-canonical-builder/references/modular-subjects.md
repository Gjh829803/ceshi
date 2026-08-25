# Modular Subject Selection

Use this reference to select a complete controlled shape without crossing the
scene-authoring boundary. The product asset pipeline is modular internally, but
Canonical Builder output remains small and declarative.

## Authoring boundary

The ownership chain is:

```text
AuthoringSpec Subject Definition
  -> registered Subject Asset
  -> Registry/Resolver-owned Runtime Bundle
  -> immutable Model + Rig + Material Set + semantic Animation Clips
```

For an exact registered Subject, write only its
`worldkit://subject-definition/...` ref on the Subject node. For a custom
silhouette, one package-local Subject Definition may reference an exact
registered `worldkit://subject-asset/...` in an asset `visualParts` row and add
the minimum primitive parts around the same controlled transform.

Never put any of these lower-level refs in AuthoringSpec:

- `worldkit://subject-source-package/...`
- `worldkit://subject-model-asset/...`
- `worldkit://subject-runtime-bundle/...`
- `worldkit://animation-clip/...`
- `worldkit://material-set/...`

Never write a GLB URL, repository path, content Hash, raw bone name, or clip
file. Never run subject modularization or Runtime Bundle generation commands
during a Builder task. Registry resolution and the product asset pipeline own
all of that work.

An animation clip present inside a Runtime Bundle does not by itself grant a
new movement mode. Runtime behavior comes from the selected Subject
Definition's complete capability, Motion Profile, Control Profile, Medium,
Collider, Camera Context, and action resolver closure.

## Current modular rigged Subjects

| Complete shape | Definition ref for ordinary use | Registered asset ref for package-local composition | Behavior truth |
|---|---|---|---|
| G Bot humanoid | `worldkit://subject-definition/humanoid.g-bot@2` | `worldkit://subject-asset/actor.humanoid.g-bot@2` | Rigged ground humanoid; default human-shaped player |
| Golden humanoid | `worldkit://subject-definition/humanoid.rigged-golden@2` | `worldkit://subject-asset/humanoid.golden@2` | Rigged ground humanoid regression/fixture choice |

G Bot `@2` is the default ordinary playable human. The product package contains
25 independently versioned semantic clips and Golden contains 4, but the
Builder still selects behavior through the published Definition or a complete
documented motion closure. It never addresses those clips directly.

## xier120 complete static shapes

The following complete Definition refs are registered and renderable:

- `worldkit://subject-definition/xier120.aerial-cockpit@1`
- `worldkit://subject-definition/xier120.aerial-hanging@1`
- `worldkit://subject-definition/xier120.aerial-seated@1`
- `worldkit://subject-definition/xier120.aerial-seated-variant@1`
- `worldkit://subject-definition/xier120.aerial-standing@1`
- `worldkit://subject-definition/xier120.biped-animal@1`
- `worldkit://subject-definition/xier120.flat-seated-glider@1`
- `worldkit://subject-definition/xier120.four-wheel@1`
- `worldkit://subject-definition/xier120.four-wheel-variant@1`
- `worldkit://subject-definition/xier120.hoverboard-standing@1`
- `worldkit://subject-definition/xier120.prone-glider@1`
- `worldkit://subject-definition/xier120.quadruped-animal@1`
- `worldkit://subject-definition/xier120.quadruped-reptile@1`
- `worldkit://subject-definition/xier120.quadruped-ridable@1`
- `worldkit://subject-definition/xier120.snake-animal@1`
- `worldkit://subject-definition/xier120.three-wheel@1`
- `worldkit://subject-definition/xier120.tracked@1`
- `worldkit://subject-definition/xier120.two-wheel-motorcycle@1`
- `worldkit://subject-definition/xier120.two-wheel-motorcycle-variant@1`

Each matching registered asset ref has the same suffix under
`worldkit://subject-asset/`, for example
`worldkit://subject-asset/xier120.biped-animal@1`.

These modules provide a complete static visual plus the current ground
Character closure. Their names and silhouettes do not prove vehicle steering,
powered flight, mount, passenger, NPC, rigged animal, or animated wheel/limb
behavior. Select a complete Definition directly only when that static shape and
ground behavior are acceptable. When the shape is useful but the Brief needs a
different currently implemented closure, use its exact registered Subject Asset
as one visual part of a package-local Subject and apply the closest honest
closure from `resource-catalog.md` and `controlled-subjects.md`. Record any
behavior approximation in `aiMetadata.description`.

Do not split one xier120 complete shape into separate rider, vehicle, limb, or
equipment visual targets. It remains one controlled Subject and maps to one
`visualTargetId`.

## Selection procedure

1. Compare the Brief's complete controlled silhouette with the registered
   Definitions above.
2. If shape and executed behavior both match, use the exact Definition ref.
3. Otherwise create one package-local Subject, choosing a documented registered
   Subject Asset or primitive-only shape independently from the closest honest
   current motion closure.
4. Keep one Subject node, one collider policy, one spawn, one startup control
   binding, one Camera target, and one primary visual-target mapping.
5. Run the bundled Builder self-check. A valid asset ref is not enough: the
   complete capability/profile closure must also compile.

Do not edit the Registry or asset pipeline to make a single scene pass.
