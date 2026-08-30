# Playthrough Plan contract

Write valid JSON with these exact top-level fields:

```json
{
  "kind": "worldkit-playthrough-plan",
  "schemaVersion": 1,
  "id": "<stable lowercase id>",
  "sceneId": "<host scene id>",
  "seed": 0,
  "durationSeconds": 90,
  "simulationTickRate": 60,
  "captureFrameRate": 24,
  "frameCount": 2160,
  "controlledEntityId": "<runtime subject id>",
  "worldPackageRootHash": "sha256:<64 hex> or unavailable",
  "motionRenderingGuidance": "<scene-specific final locomotion mechanics>",
  "explorationTargets": [],
  "inputIntervals": [],
  "cameraEvents": [],
  "seedancePromptEvents": []
}
```

## Exploration target

```json
{
  "id": "<stable id>",
  "description": "<reachable area, viewpoint, or complete visual target>",
  "priority": "required or opportunistic"
}
```

Provide at least two. Do not label unreachable evidence as required.

## Input interval

```json
{
  "id": "input-00",
  "startSeconds": 0,
  "endSeconds": 3.2,
  "rawKeys": ["W", "Shift"],
  "semanticActions": ["move-forward", "run"],
  "purpose": "<scene-grounded reason>"
}
```

Allowed raw keys: `W`, `A`, `S`, `D`, `Shift`, `Space`.
Allowed actions: `move-forward`, `move-backward`, `move-left`, `move-right`,
`run`, `jump`, `boost`, `brake`, `primary-action`, `secondary-action`.
Intervals are ordered, non-overlapping, within 0-90 seconds, and contain 12-240
rows. Gaps are natural idle play.

At the 30s and 60s Segment boundaries, the interval from 1.5 seconds before to
1.0 second after the boundary is a rear-view opening window. Any input interval
overlapping it must be W or W+Shift. Do not use S, A, D, or Space there. Do not
place a camera event inside the same window. S remains required in every third,
but belongs away from Segment boundaries.

## Camera event

```json
{
  "id": "camera-00",
  "atSeconds": 4.2,
  "yawDeltaRadians": -0.18,
  "pitchDeltaRadians": 0.06,
  "purpose": "<visible inspection purpose>"
}
```

Provide 6-80 ordered events. Include negative/positive yaw and negative/positive
pitch. One event may not exceed 1.2 yaw or 0.6 pitch radians.

## Seedance Prompt Event

```json
{
  "id": "prompt-event-00",
  "windowIndex": 0,
  "globalSeconds": 15.25,
  "segmentId": "segment-00",
  "segmentRelativeSeconds": 15.25,
  "targetNames": ["<existing natural target name>"],
  "eventClass": "subject-transformation | ability-manifestation | environment-transformation | atmospheric-spectacle",
  "magnitude": "large-scale",
  "frameImpact": {
    "scope": "subject-dominant | environment-dominant | sky-dominant",
    "coverage": "large",
    "contrast": "dramatic"
  },
  "dominantChange": "<large frame-dominant visible change>",
  "targetContext": "<where/what it is doing now>",
  "beforeState": "<locked initial appearance>",
  "transitionDescription": "<continuous visible process>",
  "afterState": "<observable completion>",
  "actionCoupling": "<preserved whitebox motion/camera and synchronization>",
  "spatialContinuity": "<unchanged layout/topology/occlusion>",
  "audioDescription": "<synchronized effect sound only>",
  "negativeConstraints": "<explicit bounded restrictions>",
  "timing": {
    "transitionDurationSeconds": 1.2,
    "ending": "hold",
    "endingDurationSeconds": 0
  },
  "eventPrompt": "<exact canonical renderer output>"
}
```

For index N, global time is in `[10+30N,20+30N)`, `segmentId` is
`segment-0N`, and relative time is `globalSeconds - 30N`. `ending` is one of
`hold`, `fade`, `settle`.

The three Events use at least two `eventClass` values and two `frameImpact.scope`
values. At least one scope is `environment-dominant` or `sky-dominant`. The
authorized visual transformation may be radical, but it never changes the
recorded root trajectory, camera, entity count, physical collision, or topology.

Before filling the structured fields, define each Event as one familiar,
scene-grounded noun phrase that an ordinary viewer can immediately name. Do not
use an abstract ring, halo, portal, geometric canopy, magnetic curtain, energy
ribbon, glyph, light tunnel, generic particle stream, or unexplained color wash
unless that exact phenomenon is explicit in the user/source evidence. A
sky-dominant Event should normally be a recognizable weather, atmospheric, or
physical phenomenon rather than invented motion-graphics geometry.

An `environment-transformation` must describe a completed frame whose dominant
environment palette or material response is unmistakably different from the
before-state; a same-color gloss/grade or local transition stripe is not enough.

Use the self-check's diagnostic paths to repair content. Never edit this contract
or the self-check during a planning task.
