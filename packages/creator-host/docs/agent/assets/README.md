# Assets and subjects

Select a category, then a concrete asset or authored object, then its required
movement/actions and integration. Each category's returned assetIndex lists only
permitted catalog resources with assets_describe links. Categories describe
binding options; they do not promise that a ready-made model is available.

| Category | Contains |
| --- | --- |
| [Humans](humans/README.md) | Supplied model/rig, movement, scene actions, interactions and integration |
| [Animals and creatures](animals/README.md) | Permitted animals, their own movement/actions, independent control or riding |
| [Vehicles](vehicles/README.md) | Handling configurations, authored model binding, driving and rider integration |
| [Scene objects](scene/README.md) | Terrain, ordinary/interactive props, landmarks and capture targets |

The effective permissions come from creator_describe_environment.assetPolicy.
Search by name or action with assets_search; read the selected asset's resources,
animation mapping, recommended body/movement and limitations with assets_describe.
Select its IDs in project.json. The Host packages exact resources and dependencies.
Choose colors per object, with no fixed role palette. Different important
counterparts should be distinguishable; same-kind repetitions may share a color.
For supplied humans use the [human integration](humans/integration.md) color API.
In three-sdk, other loaded models can use `setObjectColor` from `@worldkit/three`; read
`topic:'presentation', sections:['guide','contracts']` for ownership and cleanup.
Raw-profile and authored meshes use their own independent Three materials.
Custom external resources follow assetPolicy; ordinary Three geometry is allowed.
Each capability must state its trigger, prerequisites, scene conditions, parameters,
completion and source entry point. Clips alone do not establish executable actions.
