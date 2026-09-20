# Vehicles

This category provides handling configurations and binding contracts. Author the
vehicle Mesh/Group from the reference; do not load supplied or external vehicle
models. Keep the supplied human as its own reusable instance; its initial state
may already be mounted. Follow [initial state and camera](../../programming.md#initial-state-and-camera).
Inspect the actual SDK configuration
before choosing vehicle dimensions, wheel layout, collision shape and seat anchors.

An explicitly allowed registered vehicle is the narrow exception: select its ID
in `project.json`, load its verified visual with `world.assets.load(asset.id)`,
attach that object to the `VehicleInstance`, and clone the composed
`asset.vehicle.spec` so measured seats and envelopes stay intact. The public
aircraft factory is `humanoid.createAircraftSpec('plane')`; helicopter mechanics
come from `spec.aircraftSubtype = 'helicopter'`. Follow the selected asset's
`integrationMetadata.visual` node bindings for mechanical animation, using
`humanoid.onVisualUpdate` rather than a second simulation or animation clock.
Resolve each declared source node name with
`node.userData.name ?? node.name`: `GLTFLoader` may suffix duplicate runtime
names. Preserve the node's authored parent orientation and apply the declared
phase only on its local rotation axis. For `vehicle.helicopter`, traversal finds
`aircraft-rotor` and `aircraft-rotor_1`, both with original name
`aircraft-rotor`; map them in traversal order to rotor phases 0 and 1 on local Y.
`rotorPhases` is empty before the first simulation update and after reset. Treat a
missing or non-finite phase as zero before assigning the rotation, matching the
SDK preset shell: `const phase =
sample.vehicles[vehicleIndex]?.aircraft?.rotorPhases[index] ?? 0;
pivot.rotation.y = Number.isFinite(phase) ? phase : 0`. This keeps initial and
reset matrices finite and leaves both blades visible.

| Layer | Details |
| --- | --- |
| Type/configuration | topic:'humanoid', sections:['humanoid']; car/motorcycle use humanoid.createRoadVehicleSpec; the supported custom aircraft factory is humanoid.createAircraftSpec('plane'), which is a fixed-wing aircraft. Read actual contracts for other types |
| Visual binding | VehicleInstance object/spec: match root, colliders, wheel groups, mechanical animation and seat dimensions |
| Driving behavior | Current inputGuide, parameters and state: supported acceleration, steering, braking and other family-specific channels |
| Rider/control/camera | topic:'mounted-interaction' plus current vehicle declarations; approach/boarding eligibility, seat fit, enter/exit, control transfer and authored camera continuity |

The seat anchor locates the rider pelvis; fit the same supplied person before
adjusting camera offsets. Accepted boarding is not completion. Inspect mounted
instance, actual position/motion and rider pose; verify exit and requested controls.
Use current configuration/source data and reset behavior, not visual appearance,
to establish supported driving capabilities.

The visual name does not select handling. A broom-shaped mesh bound to
`createAircraftSpec('plane')` is still a fixed-wing aircraft: W/S changes
throttle, Q/E controls pitch, A/D turns, Ctrl reduces throttle/brakes on the
ground, Shift assists throttle and Space brakes on the ground. Z/X is not a
fixed-wing binding. A balloon-shaped mesh does not become a steerable balloon;
the runtime balloon subtype uses Q/E heat/vent and drifts with the declared
airflow. Do not promise controls from the mesh, asset name or an old `spec.hint`.

For a custom HUD, read `world.getControlHints()` and render its `controls` and
`system` rows. The SDK derives those rows from effective bindings, the mounted
vehicle's exact runtime context, and the active camera document; empty or
disabled bindings are omitted. Re-read the result after `setKeyBindings`,
boarding, leaving a vehicle, or changing the camera document. `spec.hint` is
descriptive legacy metadata, not the authoritative keyboard contract.

### Flying sword using the spacecraft matrix

If a custom flying sword is intended to follow the spacecraft/飞船 row in the
keyboard matrix, declare it as `mode: 'spacecraft'` and
`archetype: 'spacecraft'`, and give it `spaceFlight` (for example,
`humanoid.SPACE_FLIGHT_PRESETS.shuttle` or `saucer`). Do not use `mode:
'mount'` just because the rider stands on the sword, and do not copy the
aircraft or character labels into a handwritten HUD. `world.getControlHints()`
then produces the matching rows, including `Space / C` for pitch, `Q / E` for
lift, `Z / X` for roll, `Ctrl` for counter-thrust, `F` for enter/exit and `V`
for camera view when those bindings are enabled.

creator_get_examples({topic:'custom-vehicle',variant:'car'}) or variant:'motorcycle' / variant:'plane'
shows how to prepare the instance's object/spec for the vehicles option at world
creation. The action and control interfaces operate on that same world.
