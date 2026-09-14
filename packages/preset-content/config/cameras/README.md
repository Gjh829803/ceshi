# Camera calibration snapshots

`presets.json` contains per-subject content differences from the SDK camera
strategies. `dragon-variants.json` contains the eleven variant-specific snapshots.
The SDK owns the native on-foot baseline in `config/camera/humanoid.ts` and exports
`createHumanoidCameraDocument`; content export derives the person snapshot from
that public baseline. Generic strategy defaults apply to undeclared subjects.

Playground imports complete documents from its own `config/camera.json`,
`config/cameras/indoor-lab.json` and `config/cameras/npc-workshop.json`. Their preset
copies are project snapshots. Editing a library preset does not silently change
an exported project. Selecting a dragon variant explicitly replaces that subject's
preset references in the current document, preserves project overrides and marks
the resulting document unsaved. Task9's editor must save the exact active document.

The one-time repository tool `scripts/migrations/export-camera-calibration.ts`
exports from preserved legacy source fixtures, through `camera-configuration.ts`.
It is not a runtime configuration layer and must not be imported into packages.
`migration-report.json` inventories 33 profiles, 32 vehicle specs and 11 variants.
It distinguishes conversion from visual retuning. The original source bytes live
under `scripts/migrations/fixtures`; browser data was not inspected or migrated.

Profiles now use version 2 and contain controls and envelopes only. Browser keys
use `worldkit.asset-profile.v2.<id>`. Existing `worldkit.humanoid.profile.<id>` values
remain untouched; explicit `migrateLegacyAssetProfile` exports controls/envelopes
and preserves original bytes and inactive camera data for separate migration.

Native on-foot opening pitch .35 and body ratio .655, near .08, vehicle ranges,
shoulder full-effect speeds, and per-view lens values are explicit configuration.
Old swimming/driver-eye fallbacks, orbit-relative lateral offsets, collision
padding/bypass and doubled damping require visual retuning. First-person collision
is intentionally enabled and roll inheritance disabled. No screenshot equivalence
or performance improvement is claimed by the numerical migration.

The `pr240-camera-migration-20260914` snapshots apply the later vehicle recovery
calibration to third-person views: 0.12 seconds clear hold, 0.18 seconds half-life,
6 m/s recovery limit and 0.015 m release deadband. Numbered flying creatures retain
their 12 m/s recovery limit and zero deadband. Other views keep their own tuning.
The historical exporter and migration report still describe the original conversion;
rerunning that one-time exporter does not preserve subsequent content calibration.

The seven additional aircraft subjects have explicit presets and the glider uses
its 16 m aircraft framing. Paraglider third-person framing uses 9.5 m distance,
2.1 m origin offset and 0.25 rad pitch; wingsuit uses 7.5 m, 1 m and 0.2 rad.
These are the fully airborne values from the previous wearable framing, now stable
named presets. Spreading, seating and canopy animation no longer interpolate camera
configuration implicitly. Projects can author additional named views and select
them explicitly; no automatic wearable state selection is declared or implemented.
