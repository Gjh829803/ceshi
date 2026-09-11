# Vehicles

This category provides handling configurations and binding contracts. Author the
vehicle Mesh/Group from the reference; do not load supplied or external vehicle
models. Keep the supplied human as its own reusable instance; its initial state
may already be mounted. Follow [initial state and camera](../../programming.md#initial-state-and-camera).
Inspect the actual SDK configuration
before choosing vehicle dimensions, wheel layout, collision shape and seat anchors.

| Layer | Details |
| --- | --- |
| Type/configuration | topic:'humanoid', sections:['humanoid']; car/motorcycle use humanoid.createRoadVehicleSpec; plane uses humanoid.createAircraftSpec. Read actual contracts for other types |
| Visual binding | VehicleInstance object/spec: match root, colliders, wheel groups, mechanical animation and seat dimensions |
| Driving behavior | Current inputGuide, parameters and state: supported acceleration, steering, braking and other family-specific channels |
| Rider/control/camera | topic:'mounted-interaction' plus current vehicle declarations; approach/boarding eligibility, seat fit, enter/exit, control transfer and authored camera continuity |

The seat anchor locates the rider pelvis; fit the same supplied person before
adjusting camera offsets. Accepted boarding is not completion. Inspect mounted
instance, actual position/motion and rider pose; verify exit and requested controls.
Use current configuration/source data and reset behavior, not visual appearance,
to establish supported driving capabilities.

creator_get_examples({topic:'custom-vehicle',variant:'car'}) or variant:'motorcycle' / variant:'plane'
shows how to prepare the instance's object/spec for the vehicles option at world
creation. The action and control interfaces operate on that same world.
