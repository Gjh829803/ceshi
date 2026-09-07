# Three Creator raw assets

These are the exact raw GLB bytes previously stored under the retired Playground.
Their asset IDs, public metadata, SHA-256 values and byte lengths remain in
[`asset-catalog.json`](../../scripts/three-creator/asset-catalog.json).
Only the Host source path changed; the public asset URI and animation metadata
are unchanged. Existing subject provenance and license records remain under
`assets/subjects` and `assets/licenses`.

The Creator compiler and source capsule verify catalog hashes before admitting
these files. New capsules use this independent asset directory; historical
capsules and delivered worlds retain their original identities and bytes.
