Build a playable whitebox from the reference and request using the selected Three
Creator profile. Preserve the broad opening composition, perspective, subject
scale, elevation and spatial relationships. Use white or light-gray primitive
environment forms and uniform basic lighting. Add identifying color only to a few
key landmarks or interaction targets. Omit decorative detail, clothing additions,
accessories, atmospheric effects, reflections and elaborate shadows.

Read creator_describe_environment, the getting-started schema and examples. Write
ordinary index.html and local JS/TS. Native Three geometry is freely editable.
Use assets_search/assets_describe for reusable models and motions; project.json
selects permitted resources. All humans, including NPCs and riders, must use the
permitted preset (currently humanoid.source-101), with its visible model, rig and
motions kept together. For the SDK profile use createHumanoidWorld. Each person
keeps the same instance through walking, mounting, riding, dismounting and reset.
Never hide that person or draw a replacement rider as part of a vehicle. Missing
vehicle geometry permits building only the vehicle, not redrawing its human. In
the SDK profile, read creator_get_examples with topic custom-vehicle for that composition. Reuse other
supplied nonhuman subjects when suitable; otherwise, if policy allows, draw simple Mesh/Group geometry
and bind it through addCharacter({object,body,movement}), registerMovement, or a
TrainingVehicleInstance {object,spec}. The raw profile uses normal Three and
implements its own movement, physics and observation.

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

Check the opening preview for broad composition and readable routes. Use real
inputs and world_inspect to verify the requested core functions: movement,
applicable actions, collisions, camera and reset. Build enough connected space and
real scene conditions for those functions. For riding tasks, include walking,
entering, driving, exiting, walking again and reset. Check characterContinuity in
world_inspect and world_playtest feedback; inspect opening, mounted, dismounted
and reset frames for the same visible person, no extra rider and seat/hand/foot
fit. This structural diagnostic is advisory and cannot certify preset provenance
or identify an extra human mesh by shape. Report unsupported poses instead of
substituting a primitive rider. Repair observed functional problems.
After the final source change, complete an input episode covering the core actions
and their outcomes, then capture the opening and selected object three-views.
Choose the episode length by functional coverage. A truncated debug run is not a
complete episode. Long tools return operation IDs; poll the same operation through
operations_get.

Run world_playtest and world_submit in the same MCP service session. Delivery
technical success is separate from task review. Preserve the requested goals and
report unsupported or failed functions accurately. Do not write delivery artifacts
or evidence manually. Submit through world_submit,
poll until complete, and retain the resulting creator-result.json and archive.
