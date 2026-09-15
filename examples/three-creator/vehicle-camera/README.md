# Self-drawn car camera and glass

A native Three scene using only `humanoid.uefn-mannequin`. It selects
`humanoid.createRoadVehicleSpec('car')` before drawing its own car geometry. This
complete maintainer fixture includes the local [material helper](whitebox-materials.ts)
and [asset selection](project.json). Production
`creator_get_examples({topic:'custom-vehicle',variant:'car'})` returns a minimal binding snippet.

WASD moves or drives, F enters/exits, dragging orbits, and T cycles third person,
first person and shoulder. Space jumps on foot and brakes while driving. The
Presentation DOM Reset button calls `world.reset()`. The HUD reads the SDK's
current camera mode; [camera.json](config/camera.json) defines the default view and T cycle.

The nominal camera distance is 11 m; collision can shorten it. Normal speed is 12 m/s and boost speed is 16 m/s. Acceleration comes from the
configured powertrain. Wheel geometry and seat placement follow the model-free
configuration; wheel presentation reads the same SDK display sample. The nearby solid wall uses matching visual and collision
boxes, so camera obstruction can be compared with the car's open cabin/glass.
The SDK owns physics, animation, time and the active camera.

For a custom opening, set the third-person view's `opening`,
`framing.kind:'preserve-opening'` and document `activation:'on-input'` in camera.json.
Install the complete document with `world.setCameraFollow({configuration})` before
starting. First input retains that composition; reset restores the sealed opening.

`applyWhiteboxMaterials(root)` clones each distinct mesh material once, maps each
array slot to its clone and gives opaque surfaces a neutral matte finish. Glass
keeps its transparency, opacity, side and alpha test. Texture references stay
shared. Its returned callback restores exact original material/array references
and disposes only its clones; [main.ts](main.ts) registers it with world disposal.
The supplied humanoid model, rig and actions are retained throughout mounting.

[episode.json](episode.json) is a Creator real-input self-check plan: orbit,
cycle views on foot, enter, drive, brake, cycle views while mounted, exit, walk
and reset. Run the full plan through Creator `world_playtest`, then review the
recorded outcomes and world pixels. The plan itself is not evidence of a run;
independent Episode production still plans and records its own six segments.
