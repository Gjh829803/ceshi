---
name: worldkit-playthrough-planner
description: Plan six independent 30-second WorldKit player wander captures from trusted whitebox code, navigation evidence, and Runtime reconnaissance. Use only after a whitebox world is ready; do not author visual events, edit the world, record video, or call a video provider.
---

# WorldKit Playthrough Planner

Read every declared scene/runtime input and [references/contract.md](references/contract.md),
then write only the Host-declared `worldkit-playthrough-plan` JSON.

## Outcome

Plan six independent 30-second player captures. Each capture starts from a different
Host-admitted stand position and is recorded independently; captures are not a
continuous route and do not need to connect. Together they should expose the main
geographic zones, landmarks, foreground/midground/background relationships and useful
playable views of the world.

Choose each `initialPositionMetersXYZ` from an exact safe stand position in navigation
evidence. Give it an `initialFacingYawRadians` that opens on a useful third-person
view with room to move. The local route must begin at that position. Do not place the
Subject inside geometry, at a cliff edge without ground clearance, or at a position
that reconnaissance marked blocked or unsupported.

## Natural wandering

Each independent capture should look like a real player exploring for almost all of
its 30 seconds:

- the first 2.0 seconds of every capture continuously hold W; do not begin with S,
  Space, an idle pause, or a camera-only action;
- use sustained W/W+Shift travel and scene-grounded W+A/W+D arcs;
- keep pauses short and purposeful; do not stop after reaching one viewpoint;
- the Host rejects any capture with more than five consecutive seconds below
  0.05 m/s, including movement input held against a wall; budget enough clear
  route length for the full 30 seconds and change course before a boundary;
- include A, D, Shift and Space where natural, and purposeful short S actions across
  at least three of the six captures;
- avoid repeated W/S or A/D patrol macros, rapid taps, collisions and long blind
  holds into walls;
- raw keys are open-loop input, not waypoint following: align initial facing and
  A/D timing with the measured route, and do not assume a listed waypoint will
  steer the Subject automatically;
- use the evidence to pick a nearby destination and safe local route, but do not
  optimize for exact endpoint closure;
- vary the six paths, speeds and viewpoints instead of copying one control pattern.

Use I/J/K/L camera events often enough to inspect the environment while movement
continues. A capture may include a natural look-around, but there is no mandatory
end-of-segment camera reset and no required 180–360 degree orbit. End each capture in
a usable third-person framing. Never overlap a Camera Event with a Space/jump input;
finish a camera gesture before jumping or start it after the jump ends.

## Evidence and boundaries

Use the Scene Brief, world code, Runtime Snapshot, opening frame, world plan,
reconnaissance and navigation evidence together. Measured support, movement and
collision evidence outrank visual guesses. Never invent passability through a visible
gap that measured evidence marked blocked.

Write one detailed `motionRenderingGuidance` describing how Seedance should replace
coarse whitebox locomotion with natural body/equipment mechanics while preserving the
recorded root path, timing and camera. Cover the actual movement medium: walking,
sliding, paddling, driving, swimming, winged flight or the custom Subject motion.

Do not write visual-event ideas. All six captures continue through styled opening-frame
reconstruction and Seedance generation. After capture, the Host selects captures 00,
02 and 04 only for Prompt Events: one Gemini call sees those three 30-second whitebox
videos at 0.25fps plus their styled opening frames and creates five non-repeating
scene-specific events. Captures 01, 03 and 05 still generate Seedance, but have no
Prompt Events.

## Finish

Run the bundled self-check against the exact navigation evidence and repair only the
plan until it prints `WORLDKIT_PLAYTHROUGH_PLAN_OK`. Do not edit contracts, world
files, media or other outputs, and do not delegate or create another task.

When the Host provides an executed capture-quality report, treat it as a repair
request. Preserve every passing segment unless its start must change for uniqueness;
replace each failing segment's start, facing, route and input timing so its known
stationary window cannot recur. When the Host also provides capture repair evidence,
use its exact stalled world position, active keys, velocity and sampled approach trace
to route away from the observed blocker instead of repeating the same approach. The
repaired plan must still satisfy every rule above.
