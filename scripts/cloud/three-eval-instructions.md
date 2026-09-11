Build a playable whitebox from the reference and request using the selected Three
Creator profile. Preserve the broad opening composition, perspective, subject
scale, elevation and spatial relationships. Use white or light-gray primitive
environment forms and uniform basic lighting. Add identifying color only to a few
key landmarks or interaction targets. Omit decorative detail, clothing additions,
accessories, atmospheric effects, reflections and elaborate shadows.

Choose scene content and capabilities from the request and reference. SDK guides
explain available capabilities, configuration, binding and actual preconditions;
examples illustrate usage, not required scene templates or object categories.
Use creator_describe_environment and the getting-started schema to discover the
runtime and permitted assets. Read a matching example when needed to clarify
binding, then write a runnable index.html and local JS/TS. Read additional topics or SDK implementation
to resolve a concrete missing contract, explain an observed failure, or implement
a required runtime change. Native Three geometry is freely editable.
Use assets_search/assets_describe for reusable models and motions; project.json
selects permitted resources. In the three-sdk profile, for a nonhuman protagonist use createWorld with its
own visual root, body and movement; select it with setControlledEntity and follow
that subject with the camera. Read nonhuman-subject for the complete example.
In the three-raw profile, author the nonhuman subject with ordinary Three and expose
it as observer.controlledObject; this profile supplies its own movement, physics and observation.
Do not add a human, rider, or mount/dismount controls to a standalone animal.
Flight, swimming and other movement require the corresponding actual controller
and compatible animation; use the current SDK contracts and registered abilities.
All humans, including NPCs and riders, must use the
permitted preset (currently humanoid.source-101), with its visible model, rig and
motions kept together. For the SDK profile use createHumanoidWorld. Each person
keeps the same instance through walking, mounting, riding, dismounting and reset.
Never hide that person or draw a replacement rider as part of a vehicle. Vehicle
geometry is authored separately from its human. Do not load supplied or
external vehicle models. For SDK cars and motorcycles, select a model-free
humanoid.createRoadVehicleSpec configuration and draw geometry to its dimensions;
custom-vehicle and vehicle-camera illustrate binding. Other vehicle modes use
their actual SDK contracts. Reuse supplied creatures when suitable; otherwise,
if policy allows, draw simple Mesh/Group geometry
and bind it through addCharacter({object,body,movement}), registerMovement, or a
VehicleInstance {object,spec}. The raw profile uses normal Three and
implements its own movement, physics and observation.

Choose fixed or dynamic collision from how each object is supported and how the
requested gameplay should affect it. Resting on the ground does not by itself
make an object fixed. If an unattached object should react to pushes or impacts,
use the selected profile's dynamic-body capabilities. In a Humanoid world, use
the existing movable-prop `rigidGroup` contract and keep its visuals synchronized
from the current environment's `propBoxPose`; objects intended to stay fixed
retain fixed collision. Humanoid map collision is already
created through `createHumanoidWorld` options. Register a map object separately
only when it needs an observation/capture identity; for a pure visual landmark,
use `role:'decoration'` and omit `physics` rather than registering its collision
again.

Use these layers as needed:
1. Use the entry point and asset bindings appropriate to the controlled subject.
2. For humanoid actions, read character-actions capability cards for inputs, eligibility, scene conditions,
   parameters, completion and source entry points. Animation clips are not commands.
3. Adjust public profile and extension parameters.
4. Call creator_materialize_runtime, edit sdk/three-world/src or
   sdk/camera-collision/src, then world_validate. This builds the workspace runtime
   with locked dependencies; its source and identity ship with delivery. Keep one
   clock, physics world, animation owner and camera writer. Host tools and evidence
   validators remain outside the authored runtime.

Read current controlBindings and character capability conditions from the schema
or world_inspect. For Humanoid vehicle input, use the active family's inputGuide
in the world description: boost and axes have different meanings for cars,
aircraft, spacecraft and underwater vehicles. Use emptyHumanoidInput() and change
only the relevant channels. After editing sdk/, read its current definitions and
rebuilt state instead of assuming Host defaults. Use abilities only when needed
by the task; their prerequisites apply when selected. A slide needs the current
controller's actual minimum speed, grounded empty hands, run-up and body clearance;
a tunnel is optional. Standing exits need headroom.
Climbing needs a declared climb surface attached to a real collider. Swimming needs
a declared water volume with the actual boundary/support geometry appropriate to
the authored environment; eligibility follows measured depth and the controller.
Pickup and sitting require reachable interaction anchors. Show the current target
and explain failed conditions. Use world snapshots and operation completion to
verify actions. Never infer successful movement from an accepted request alone.

Check the opening preview for broad composition and readable routes. For the
current state during testing, use world_preview with view current; opening pauses
and resets the world. On a failed tool operation, use its errorDetails code,
SDK suggestedAction and host phase/candidate identity to choose the repair.
Read the same failed operation for its saved diagnosis. Use real
inputs and world_inspect to verify the task's requested outcomes. Author the
connections and physical conditions needed for those outcomes, without adding
unrequested demonstration areas or abilities. Production does not require a
separate vehicle regression, fixed boarding sequence or all-view/reset checklist.
Use characterContinuity and relevant frames when a requested outcome or observed
problem calls for them. This structural diagnostic is advisory and cannot certify
preset provenance or identify an extra human mesh by shape. Report unsupported
poses instead of substituting a primitive rider. Repair observed functional problems.
When an outcome requires an impact to move an object, verify the identified
object's actual pose before and after real contact. Proximity, a blocked character,
or `world_playtest.status:'passed'` does not establish that the object moved.
After the final source change, inspect world_preview with view opening on that
exact version, then complete an input episode covering the core actions and their
outcomes. A preview of an earlier source does not verify the final opening; the
images automatically captured by world_submit do not replace your own final
preview. Reuse an opening preview when the source has not changed. Choose its length by functional coverage; omit world_playtest
durationSeconds to execute the full plan. Use a shorter durationSeconds for a
debug run while keeping episode.json unchanged. Read targetResults.nearestSample
for measured position, time and target-minus-player XYZ offsets when tuning routes.
For a specific recorded interval, use world_read_playtest with the playtest
operationId and fromSeconds/toSeconds to read sampled motion, mounting and keys;
this reads saved evidence without another recording. Missing telemetry is unknown.
recordingReadiness describes recording prerequisites for the reported world and
episode hashes; a truncated debug run is incomplete even when status is passed.
Once a complete recording covers the requested outcomes and the world/episode
remain unchanged, proceed to world_submit. Re-record after changing either or
when observed failures or missing coverage require repair. Inspect additional
views needed to judge the requested composition and functions; world_submit
automatically captures missing current opening and object three-views.
Long tools return operation IDs; poll the same operation through operations_get.

Run world_playtest and world_submit in the same MCP service session. Delivery
technical success is separate from task review. Preserve the requested goals and
report unsupported or failed functions accurately. Do not write delivery artifacts
or evidence manually. Submit through world_submit,
poll until complete, and retain the resulting creator-result.json and archive.
