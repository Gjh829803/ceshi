# Reusable character and vehicle assets

[`asset-catalog.json`](../../scripts/three-creator/asset-catalog.json) defines
public asset IDs, resource paths, SHA-256 hashes, byte lengths and capabilities.
The compiler verifies and packages the selected resource closure.

`humanoid.source-101` is the recommended humanoid. `createHumanoidWorld` loads
its complete action resources and contextual controller. Its base model also
supports ordinary `world.assets.load` / `addCharacter` animation binding.
Select capabilities and scene requirements using the SDK `character-actions`
topic; an animation clip alone does not provide movement or interaction physics.

Three geometry and custom Mesh/Group subjects can be authored freely. Vehicle
visuals bind to a `TrainingVehicleInstance.spec`; custom ground subjects bind to
an explicit body and movement. Skeletal clips require a compatible rig.

Source notices and license files accompany the training resources. Preserve them
when copying or repackaging the resources; mixed-source clips retain their
individual terms. See [SDK usage](../../packages/three-world/README.md).
