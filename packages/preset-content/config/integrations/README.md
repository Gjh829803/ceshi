# Content facts and engine presets

`subjects.json` selects versioned content for the seven static browser snapshots.
`whitebox.json` binds each supported asset to one exact content version and owns
Host scene placement and camera references. `../presets/subjects.json` owns runtime
handling and camera presets. Neither file stores measured model geometry.

The canonical contract is `asset-library/schemas/content-parameters.schema.json`.
`content-ownership.json` is its generated, package-local allowlist of content parameter paths.
`true` means the complete value belongs to content; an object splits a mixed field.
Unknown content fields and any engine write to an owned content path are rejected.
Composition merges only disjoint fields; it never silently overrides a value.
After a contract change, regenerate the package copy with
`syncContentOwnership(libraryRoot, packageRoot)` from `asset-library/tools/presets.mjs`;
the same function with `check=true` rejects drift. The adapter contract test also
compares the schema and generated copy. Edit the schema, never the package copy.

| Content paths | Meaning |
| --- | --- |
| `id`, `name`, `en`, `archetype`, `visualVariant` | Subject identity and visual classification |
| `seat`, `radius`, `envelope` | Subject seat and body dimensions |
| `wheelbaseMeters`, `rearAxleZMeters` | Physical axle layout |
| `wheelPhysics.{radius,hubHeight,halfTrack,halfWheelbase,wheelWidth,wheels}` | Actual wheel geometry and mechanical wheel roles |
| `wheelPhysics.{chassis,cabin,bodyParts}` | Subject collision geometry |
| `flyingCreatureCollision` | Measured collision probes |
| `flyingCreatureGround.{rootHeight,seat,probes,support}` | Measured ground pose and support geometry |
| `bodyPhysics.water.{depth,bottom}` | Subject water-contact dimensions |
| `spaceFlight.hull` | Hull geometry classification |

Wheel `steering` and `driven` flags describe the model's mechanical wheel roles;
they stay alongside the actual wheel layout. Steering response, tire friction,
suspension travel limits, balance assistance, simulated mass/center of mass,
powertrain and braking are engine calibration. Ground landing/takeoff durations
are engine timing. Water displacement/damping and abstract drive radius are
engine simulation parameters; they are not measured mesh dimensions.

Public Node entry: `@worldkit/preset-content/assets/host-adapter`.

- `composeContentSpec(id, {asset_version, parameters})` is pure and accepts remote
  content facts. A missing integration or a version mismatch throws.
- `composeAssetCatalog(entries)` enriches content-only Whitebox entries and removes
  their transport-only `contentVersion`. Unintegrated model-only entries can preview;
  unintegrated vehicles are rejected.
- `runtimeAssetContext(ids)` identifies runtime/adapter versions and hashes selected
  presets and integrations. Its override digest represents an empty override set;
  it does not describe later per-project runtime customization.
- `createContentAdapter({presets, integrations})` creates an isolated adapter without
  mutating configuration or content. Returned specs are independent copies.
- `presetAuthoringContext(configuration?, selection?)` supplies the explicit engine
  callback, camera map and selection to library snapshot authoring tools.

`syncPresetContent(libraryRoot, outputPackageRoot, check, authoringContext)` and
`buildPresetContent(libraryRoot, authoringContext)` never import engine code. Their
context is mandatory; the standalone library build does not create engine snapshots.
The default adapter reads package JSON configuration once on module import. The
module is for Node Hosts; browsers retain static imports from `config/generated`.
