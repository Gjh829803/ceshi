# Three Creator raw assets

These are the exact raw GLB bytes previously stored under the retired Playground.
Their asset IDs, public metadata, SHA-256 values and byte lengths remain in
[`asset-catalog.json`](asset-catalog.json).
Only the Host source path changed; the public asset URI and animation metadata
are unchanged. Existing subject provenance and license records remain under
`assets/subjects` and `assets/licenses`.

The Creator compiler and source capsule verify catalog hashes before admitting
these files. New capsules use this independent asset directory; historical
capsules and delivered worlds retain their original identities and bytes.

Training imports select model dependencies per asset: horse and carriage use the
horse model, while dragon uses the dragon model. The shared creature manifest and
its license notices remain attached for provenance. Raw creature GLBs do not
declare a `seat.driver` node; their logical seat comes from `training.spec.seat`.
Only procedural vehicle exports create that named socket.

[`import-training-content.ts`](../../scripts/three-creator/import-training-content.ts)
regenerates resource identities and structural metadata, while preserving each
existing Training asset's `limitations` and `integrationMetadata` from this catalog.
Those fields remain the maintained guidance source. The importer also overwrites
donor-derived Playground source modules, so a full historical reimport requires
reviewing those changes separately; it is not a routine catalog repair command.
