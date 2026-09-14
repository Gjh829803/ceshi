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
the resulting document unsaved. The editor saves the exact active document.

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

Current camera behavior combines these saved values with the SDK's calibrated
strategies and native subject anchors. Native swimming and driver-eye fallbacks,
orbit-relative shoulder offsets, and view-specific collision and roll behavior
are retained. The native humanoid baseline disables first-person collision and
roll inheritance; vehicle views retain their own settings. The historical
migration report describes the original conversion, not current runtime behavior
or visual acceptance.

The `pr240-camera-migration-20260914` snapshots apply the later vehicle recovery
calibration to third-person views: 0.12 seconds clear hold, 0.18 seconds half-life,
6 m/s recovery limit and 0.015 m release deadband. Numbered flying creatures retain
their 12 m/s recovery limit and zero deadband. Other views keep their own tuning.
The historical exporter and migration report still describe the original conversion;
rerunning that one-time exporter does not preserve subsequent content calibration.

The seven additional aircraft subjects have explicit presets. Wearable views use
the native subject's dynamic follow pivot and preferred recenter pitch where their
configuration requests them; those measured anchors are not frozen preset values.
Project customization and optional state-based view selection follow the
[Agent camera guide](../../../creator-host/docs/agent/programming.md#defaults-and-custom-views).
Automatic wearable view selection is not currently implemented.
