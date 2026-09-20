# Camera calibration snapshots

The public `@worldkit/preset-content/cameras/presets.json` and
`@worldkit/preset-content/cameras/dragon-variants.json` exports are generated
snapshots under `config/generated/`. Author calibration in the engine's
`config/presets/subjects.json` camera entries, then run `pnpm content:sync`. The aggregate files must not
be edited by hand; `pnpm content:check` verifies their exact generated contents.
The SDK owns the native on-foot baseline in `config/camera/humanoid.ts` and exports
`createHumanoidCameraDocument`; the engine's person calibration preserves that
baseline and tests verify the native fading contract. Generic strategy defaults
apply to undeclared subjects.

Playground imports complete documents from its own `config/camera.json`,
`config/cameras/indoor-lab.json` and `config/cameras/npc-workshop.json`. Their preset
copies are project snapshots. Editing an engine preset does not silently change
an exported project. Selecting a dragon variant explicitly replaces that subject's
preset references in the current document, preserves project overrides and marks
the resulting document unsaved. The editor saves the exact active document.

The historical conversion used preserved source fixtures through
`scripts/migrations/camera-configuration.ts`. This is migration evidence, not a
runtime configuration layer or an authoring path for current library calibration.
`migration-report.json` inventories 33 profiles, 32 vehicle specs and 11 variants.
It distinguishes conversion from visual retuning. The original source bytes live
under `scripts/migrations/fixtures`; browser data was not inspected or migrated.

Control profiles now use version 3 and contain controls only; collision envelopes
remain on their vehicle or character specs. Browser debug keys use
`worldkit.control-profile.v3.<id>` and are read only with `debugProfiles=1`.
Existing `worldkit.asset-profile.v2.<id>` and `worldkit.humanoid.profile.<id>` values
remain untouched and inactive; no browser value is silently promoted into a project.

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

The later `vehicle-recenter-20260916` snapshots set third-person vehicle/mount
`orientation.recenter.minimumSpeedMetersPerSecond` to zero, including all eleven
dragon variants and all three Playground project snapshots. They retain the
1.5-second observation delay, smoothing and recovery values above. Rest/hover
can therefore return behind the subject after observing; person, first-person
and shoulder presets remain unchanged.

The seven additional aircraft subjects have explicit presets. Wearable views use
the native subject's dynamic follow pivot and preferred recenter pitch where their
configuration requests them; those measured anchors are not frozen preset values.
Project customization and optional state-based view selection follow the
[Agent camera guide](../../../creator-host/docs/agent/programming.md#defaults-and-custom-views).
Automatic wearable view selection is not currently implemented.
