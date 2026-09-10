# Reusable character and vehicle assets

[`asset-catalog.json`](asset-catalog.json) defines
public asset IDs, resource paths, SHA-256 hashes, byte lengths and capabilities.
The compiler verifies and packages the selected resource closure.

Asset producers should follow the [asset submission and Agent integration guide](../../docs/asset-production-integration.md).

`humanoid.source-101` is the default humanoid. Keep its supplied visible model,
skeleton and actions. `createHumanoidWorld` loads its complete action resources
and contextual controller. Its base model also
supports ordinary `world.assets.load` / `addCharacter` animation binding.
Select capabilities and scene requirements using the SDK `character-actions`
topic; an animation clip alone does not provide movement or interaction physics.

Reuse other supplied subjects when suitable; otherwise author simple Mesh/Group
geometry and bind its abilities. Vehicle visuals bind to a `VehicleInstance.spec`; custom ground subjects bind to
an explicit body and movement. Skeletal clips require a compatible rig.

Source notices and license files accompany the preset resources. Preserve them
when copying or repackaging the resources; mixed-source clips retain their
individual terms. See [SDK usage](../../packages/three-world/README.md).

Preset imports select model dependencies per asset: horse and carriage use the
horse model, while dragon uses the dragon model. The shared creature manifest and
its license notices remain attached for provenance. Raw creature GLBs do not
declare a `seat.driver` node; their logical seat comes from `vehicle.spec.seat`.
Only procedural vehicle exports create that named socket.

[`import-preset-content.ts`](../../scripts/three-creator/import-preset-content.ts)
regenerates resource identities and structural metadata, while preserving each
existing preset asset's `limitations` and `integrationMetadata` from this catalog.
Those fields remain the maintained guidance source. The importer also overwrites
donor-derived Playground source modules, so a full historical reimport requires
reviewing those changes separately; it is not a routine catalog repair command.
