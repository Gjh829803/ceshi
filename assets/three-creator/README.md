# Reusable character and vehicle assets

Each [`catalog/<assetId>.json`](catalog/) defines the asset ID, resource paths,
SHA-256 hashes, byte lengths and capabilities for one asset.
`pnpm content:sync` generates [`asset-catalog.json`](asset-catalog.json) from those sources.
The compiler verifies and packages the selected resource closure.

Asset producers should follow the [asset submission and Agent integration guide](../../docs/asset-production-integration.md).

`humanoid.uefn-mannequin` is the default humanoid. Keep its supplied visible model,
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

[`import-preset-content.ts`](../../packages/creator-host/scripts/assets/import-preset-content.ts)
regenerates resource identities and structural metadata, while preserving each
existing preset asset's `limitations` and `integrationMetadata` from its source definition.
Those fields remain the maintained guidance source. The importer reads the pinned
donor to export motion and preset resource bytes. The local humanoid manifest and
visible skin remain authoritative during imports. SDK and Playground TypeScript modules are maintained
in this repository and are never copied back from that historical source. Use
`pnpm content:sync` for routine catalog regeneration.

D01–D11 飞龙使用独立 ID `creature.dragon.d01` 至 `creature.dragon.d11`。
其 `integrationMetadata.visual` 声明模型、火焰资源和动画前缀，`vehicle.spec`
保留与 Playground 一致的尺寸、鞍位、核心碰撞和地面校准。
从 [动物 → 飞行坐骑](../../packages/creator-host/docs/agent/assets/animals/flying-mounts.md)
进入 `mounted-interaction` 的 `flying-creature` 绑定变体；使用专用 `FlyingCreatureVisual`，目录 `actions` 为空，
避免普通资产 mixer 与专用控制器争用动画。来源、限制与重新注册命令见
[飞龙资源说明](../dragon-training/README.md#creator--agent-接入)。
