# Vehicles

This category provides handling configurations and binding contracts. Author the
vehicle Mesh/Group from the reference; do not load supplied or external vehicle
models. Keep the supplied human as its own reusable instance; its initial state
may already be mounted. Follow [initial state and camera](../../programming.md#initial-state-and-camera).
Inspect the actual SDK configuration
before choosing vehicle dimensions, wheel layout, collision shape and seat anchors.

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

For a custom HUD, read `world.getKeyBindings()`, the mounted vehicle's
`mode`/`aircraftSubtype`, and `humanoid.activeControlActions(...)`; render only
actions active for that exact runtime context. `spec.hint` is descriptive
legacy metadata, not the authoritative keyboard contract.

creator_get_examples({topic:'custom-vehicle',variant:'car'}) or variant:'motorcycle' / variant:'plane'
shows how to prepare the instance's object/spec for the vehicles option at world
creation. The action and control interfaces operate on that same world.
