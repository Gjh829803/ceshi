# Playthrough Plan contract

Write valid JSON with these exact top-level fields:

```json
{
  "kind": "worldkit-playthrough-plan",
  "schemaVersion": 3,
  "id": "<stable lowercase id>",
  "sceneId": "<host scene id>",
  "seed": 0,
  "deliveryDurationSeconds": 180,
  "executionDurationSeconds": 180,
  "segmentCount": 6,
  "segmentDeliverySeconds": 30,
  "segmentExecutionSeconds": 30,
  "cameraResetBufferSeconds": 0,
  "simulationTickRate": 60,
  "captureFrameRate": 24,
  "frameCount": 4320,
  "executionFrameCount": 4320,
  "controlledEntityId": "<runtime subject id>",
  "worldPackageRootHash": "sha256:<64 hex> or unavailable",
  "motionRenderingGuidance": "<detailed scene-specific final locomotion mechanics>",
  "navigationEvidenceHash": "sha256:<exact Host evidence hash>",
  "segmentPlans": [],
  "inputIntervals": [],
  "cameraEvents": []
}
```

## Independent capture

Provide exactly six entries in Segment order. Global starts are 0, 30, 60, 90,
120 and 150 seconds, but each capture is independently reset and positioned.

```json
{
  "segmentId": "segment-00",
  "executionStartSeconds": 0,
  "deliveryDurationSeconds": 30,
  "cameraResetBufferSeconds": 0,
  "initialPositionMetersXYZ": [0, 0, 0],
  "initialFacingYawRadians": 0,
  "destinationId": "<navigation evidence destination id>",
  "destinationPositionMetersXYZ": [0, 0, 0],
  "arrivalRadiusMeters": 3,
  "expectedArrivalSeconds": 24,
  "routeBandIds": ["<admitted corridor id>"],
  "routeWaypointsMetersXYZ": [[0, 0, 0], [1, 0, 0]],
  "coverageTargetIds": ["<destination or visual target id>"],
  "purpose": "<scene-grounded local wandering and observation purpose>"
}
```

`initialPositionMetersXYZ` and every waypoint must be exact Host-admitted stand
positions. The first route waypoint equals the initial position. Captures may start
far apart and do not connect to the preceding capture. Use at least three distinct
destinations overall and cover all core destinations when evidence permits.

## Inputs and camera

Input intervals use the global 0–180 second clock, remain inside one 30-second
capture, are ordered and non-overlapping, and use W/A/S/D/Shift/Space with their
existing semantic actions. Keep movement active for most of each capture using
deliberate holds rather than taps. Space is normally a 0.08–0.25 second edge press.
Use purposeful S in at least three captures, without repeated opposite-key loops.

The first 2.0 seconds of every capture must be continuously covered by input intervals
that include W. Those opening intervals must not include S or Space and must contain no
gap. S remains required later in suitable captures, but never as the opening action.

Camera events also use the global clock. I/J/K/L are represented by pitch/yaw deltas;
one event remains within ±1.2 yaw and ±0.6 pitch radians. Plan useful observations,
not a mandatory end reset or identical orbit macro. A Camera Event's natural gesture
duration must not overlap any Space/jump interval; keep the camera stable throughout
takeoff, airborne time and landing input. Visual events are absent from this contract
and are authored later by one Gemini call for captures 00, 02 and 04 only. All six
captures still receive styled opening frames and Seedance outputs.
