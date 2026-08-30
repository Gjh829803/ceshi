---
name: worldkit-playthrough-planner
description: Plan one scene-grounded 90-second WorldKit player episode from trusted whitebox code and reconnaissance evidence, including natural WASD/Shift/Space play, camera exploration, and three high-detail timed Seedance Prompt Events. Use only after a whitebox world is ready; do not edit the world, record video, or call a video provider.
---

# WorldKit Playthrough Planner

Work only inside the extracted task workspace. Read the declared world evidence and
[references/contract.md](references/contract.md) before writing the plan.

## Responsibility

Create exactly one `worldkit-playthrough-plan` JSON for the Host-declared scene and
output path. The plan is a full 90-second player script created before recording.
Do not edit world code, Authoring data, Scene Brief, Runtime artifacts, images, or
any other file. Do not generate media or call another model/provider.

## Evidence

Ground every choice in all available evidence:

- Scene Brief and movement modes;
- actual world implementation/Authoring code;
- Runtime Snapshot and actual whitebox opening frame;
- top-down plan and visual-target manifest;
- Host reconnaissance report and its ordered screenshots.

Reconnaissance is trusted trial evidence. Use its measured movement, collisions,
camera, support state, failures, and visible geography. Do not assume an object is
reachable because it is visible, and do not invent a route absent from the world.
For every probe, read the Snapshot V4 `subjects` state and `movementEvidence`.
A null position or displacement is insufficient evidence. A
`blockedOrStalled: true` probe forbids planning continued travel in that direction
until another measured probe demonstrates a clearance maneuver. Use the measured
before/after positions to reason about heading and free space; screenshots alone
never prove a passable opening.

## Player behavior

Plan natural exploration rather than a key-coverage benchmark:

- use W as the principal forward action, interleaved with turns, observation,
  pauses, recovery, and speed changes;
- use A and D in multiple locations to steer, strafe, or circle visible targets;
- use S as real retreat/reposition behavior in every 30-second third, with at
  least three seconds total; never append meaningless taps to satisfy coverage;
- keep the 30s and 60s Segment boundaries simple and rear-facing: during the
  1.5 seconds before through 1.0 second after each boundary, use only idle or
  W/W+Shift and schedule no camera event. Put S, A, D, Space, and camera surveys
  in the middle of each Segment instead. The Host recenters the camera once in
  this window so every Segment opening remains a standard third-person rear view;
- use Shift in at least three separate bursts, alternating normal and faster play;
- use Space in at least three scene-compatible action/probe moments. If the
  Subject cannot jump, label the interval as a capability probe/no-op rather than
  claiming a jump occurred;
- look left, right, up, and down at useful moments, keep changes gradual, and
  return to a playable forward view;
- maximize reachable-area and landmark coverage within 90 seconds without
  teleporting, modifying the map, crossing colliders, or hiding failure.
- before approaching a large wall, ring root, cliff, furniture cluster, or narrow
  opening, use shorter input intervals and include a credible retreat plus lateral
  reorientation option; never schedule repeated forward/run intervals through an
  unmeasured gap merely because the Scene Brief says that a route should exist;

Input intervals are ordered and non-overlapping. Combined keys such as W+Shift or
W+A are encouraged when they reflect natural control. Avoid frame-by-frame jitter,
mechanical loops, or holding one state for most of the episode.

## Final motion rendering guidance

Write one scene-specific `motionRenderingGuidance` for the complete controlled
Subject. This is not another input timeline. It tells Seedance how to turn the
coarse whitebox locomotion into convincing final-body mechanics while preserving
the recorded root trajectory and timing.

Infer the guidance from the actual movement mode and complete target:

- ground walking/running needs natural alternating steps, pelvis and shoulder
  counter-rotation, foot planting, weight transfer, acceleration and braking;
- skiing, boarding, skating, or other surface sliding needs balanced knee/hip
  flexion, edge pressure, lean and counter-rotation that follow each recorded
  carve, with believable contact and inertia instead of rigid translation;
- paddled craft needs repeated, side-correct paddle strokes, torso rotation,
  blade entry/exit and water reaction when the existing complete target includes
  a paddle;
- winged flight needs coherent flap/glide cycles, lift response and body banking
  when the existing complete target has wings;
- other custom movement needs equally explicit contact, propulsion, balance,
  secondary motion, and transition mechanics grounded in the Subject evidence.

Do not ask Seedance to copy placeholder limb angles or rigid whitebox mechanics.
Do not invent equipment or anatomy absent from the complete target. The final
micro-animation may refine limbs, body balance, cloth, wings, paddle, board, or
other existing moving parts, but may not change the recorded Subject root path,
travel direction, speed phases, action timing, contacts, camera, or final landing.

## Seedance Prompt Events

Choose one deterministic time inside each Host window: 10-20, 40-50, and 70-80
global seconds. Each becomes 10-20 seconds relative to its 30-second segment.

The Event is rendered later by Seedance. It does not change the whitebox Runtime.
Write one scene-specific, unmistakably large visual event that Seedance can
render while the whitebox root motion/camera/layout remain authoritative. Do not
reuse a literal example or a shared template with names swapped, but use the same
broad classes of cinematic change when they fit the scene: radical transformation
of the existing controlled Subject, a large ability manifestation, a broad
environment material/state transformation, or a sky/atmosphere-scale spectacle.

Choose the event as a human-recognizable idea before writing visual detail. An
ordinary viewer must be able to name the whole change with one familiar concrete
noun phrase, and that phrase must naturally fit this scene. Prefer familiar
weather, terrain/material states, physical phenomena, celebrations, or readable
Subject transformations over novel visual-design concepts. Clarity and scene fit
matter more than originality. Familiar concepts such as a blizzard, sandstorm,
thunderstorm, tornado, volcanic/lava state, aurora, fireworks, or a clearly named
armor/outfit/material transformation illustrate the required level of immediate
recognition; they are not a list to copy, and must not be chosen when unsupported
by the actual scene.

Do not invent abstract spectacle merely to satisfy the sky/environment scope.
Reject concentric sky rings, giant halos, portals, abstract geometric canopies,
magnetic curtains, energy ribbons, floating glyphs, arbitrary light tunnels,
generic particle streams, and unexplained color washes unless the user or source
scene explicitly contains that exact phenomenon. If the first one-sentence event
idea sounds like motion-graphics jargon rather than something a player would
naturally request, discard it and choose a more familiar scene-grounded event.

Every Event must dominate a large part of the visible Subject, environment, or
sky and create a dramatic before/after read. A small dust puff, short particle
trail, local contact splash, edge light, narrow light sweep, mild tint, or minor
surface glow is never sufficient as the primary Event. Large transient visual
volumes are allowed. A visually transformed Subject remains the same controlled
actor on the same recorded trajectory, and a transformed ground/sky remains the
same collision and topology underneath.

For an environment material/state transformation, the completed frame must no
longer retain the pre-event environment's dominant material response or dominant
palette. Use an unmistakable frame-scale change in hue/value, reflectance,
weather, or visible state; do not rely on gloss, a same-color grade, or a narrow
transition boundary to carry the Event. The after-state must remain clearly
readable for the declared hold/fade/settle duration.

Across the three Events, use at least two different event classes and at least
two different impact scopes. At least one Event must dominate the environment or
sky rather than only the Subject. This diversity rule never justifies an abstract
or unfamiliar effect; use a familiar environment or weather change instead.

Each Event must completely specify:

- an existing, naturally named target and its current visible context;
- `eventClass`, fixed `magnitude: "large-scale"`, and a structured large-frame
  impact declaration;
- a `dominantChange` that explains why the result is immediately readable at
  frame scale rather than a local embellishment;
- the exact pre-event appearance;
- a continuous, directional, materially visible transition;
- transition duration and hold/fade/settle ending;
- observable completion state;
- compatibility with the actual input/action and camera at that moment;
- the same controlled actor/root track, camera, physical geometry, topology,
  occlusion logic, and entity count; Event-authorized appearance, body styling,
  material, weather, atmosphere, and transient effect volumes may change;
- synchronized effect/environment sound only;
- no new/deleted people or objects, structural mutation, cut, UI, text, logo,
  music, dialogue, narration, or singing.

If an event needs a major Subject action, the input plan must contain a compatible
Space or declared semantic-action interval at the same time. Otherwise choose an
event that can occur during the existing motion. Event rendering may add natural
biomechanical micro-motion, but may not invent a new root action, trajectory,
takeoff, landing, or timing beat absent from the whitebox video.

Populate the structured fields first, then set `eventPrompt` to the exact output
of the canonical renderer used by the self-check script. The eventPrompt is an
immutable renderer instruction, not a summary.

## Finish

1. Write the JSON at the exact Host-declared output path.
2. Run:

```text
node .codex/skills/worldkit-playthrough-planner/scripts/self-check.mjs --input <output> --scene-id <scene-id>
```

3. If it fails, revise the same file and rerun. Finish only after it prints
`WORLDKIT_PLAYTHROUGH_PLAN_OK`.

Do not delegate, create another task, loosen the self-check, or claim video work.
