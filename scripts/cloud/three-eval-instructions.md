Build the uploaded reference and creative request into an explorable world using
the selected Three Creator profile. The reference, intended subject, spatial
relationships and gameplay goals are the creative authority. Match the first-frame
composition, perspective, subject scale and occlusion. Keep recognizable geometry,
complete moving subjects, stable colors, real elevation and connected routes.

Read creator_describe_environment, the getting-started schema and examples. Write
ordinary index.html and local JS/TS. Native Three geometry is freely editable.
Use assets_search/assets_describe for reusable models and motions; project.json
selects permitted resources. Humans should normally use humanoid.source-101 and
createHumanoidWorld. It loads the supplied rig and complete action controller.
Customize visual children while retaining compatible animation bindings. Other
subjects may be drawn freely and bind to addCharacter({object,body,movement}),
registerMovement, or a TrainingVehicleInstance {object,spec}. The raw profile
uses normal Three and implements its own movement, physics and observation.

Use these layers as needed:
1. Reuse the supplied humanoid/helper or an existing movement/vehicle binding.
2. Read character-actions capability cards for inputs, eligibility, scene conditions,
   parameters, completion and source entry points. Animation clips are not commands.
3. Adjust public profile and extension parameters.
4. Call creator_materialize_runtime, edit sdk/three-world/src or
   sdk/camera-collision/src, then world_validate. This builds the workspace runtime
   with locked dependencies; its source and identity ship with delivery. Keep one
   clock, physics world, animation owner and camera writer. Host tools and evidence
   validators remain outside the authored runtime.

Read the shared controlBindings in the schema. WASD moves, Shift runs/accelerates,
Space jumps/traverses/rises, C or Ctrl crouches, Shift plus a new C/Ctrl press slides,
Z goes prone, Q rolls, E interacts, G puts down, F mounts/dismounts. Mouse/arrow keys
control the camera. A slide also needs actual speed >= 2.5 m/s, grounded empty hands,
run-up and body clearance; a tunnel is optional. Standing exits need headroom.
Climbing needs a declared climb surface attached to a real collider. Swimming needs
a declared water volume and pool floor/shore collision at appropriate depths.
Pickup and sitting require reachable interaction anchors. Show the current target
and explain failed conditions. Use world snapshots and operation completion to
verify actions. Never infer successful movement from an accepted request alone.

Compare actual world_preview images to the reference. Correct composition,
silhouettes and spatial structure before final recording. Use short real episodes
and world_inspect to check movement, actions, collisions, camera and reset. Water
feedback reports measured contact/depth/immersion for scene diagnosis. Inspect
walking/running from the side for natural joint motion, foot contact and strides
matching travel speed. Check jump and landing transitions.

Verify connected areas supporting five minutes of meaningful exploration. Repeated
laps, spawn-reached targets or oversized tolerances do not establish exploration.
Repair and retest the same world. After the final source change, inspect a fresh
opening preview, then record a full 180–300-second episode with at least 180 seconds
of active play and complete object three-views. Paused/loading/reset time is excluded.
Long tools return operation IDs: poll the same operation through operations_get.

Run world_playtest and world_submit in the same MCP service session. Delivery
technical success is separate from visual and task review. Preserve external goals,
compare evidence yourself, and report unsupported or failed goals accurately. Do
not write delivery artifacts or evidence manually. Submit through world_submit,
poll until complete, and retain the resulting creator-result.json and archive.
