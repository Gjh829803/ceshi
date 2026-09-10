# Self-drawn fixed wing

Select `humanoid.createAircraftSpec('plane')`, build metre-scale Three geometry from
its `airframe` boxes and wheels, and bind `object/spec` through `createHumanoidWorld`.
The same supplied person boards, pilots and dismounts. `spec.seat` is a pelvis anchor.

The existing solver owns thrust, lift/drag, stall, coordinated attitude control and
three-wheel landing gear. `airframe` describes its fixed calibration; modifying this
reference or scaling the root does not reconfigure physics. Per-instance movement
parameters remain configurable. Rotorcraft and VTOL are unavailable. Engine RPM,
propeller dynamics and automatic aerial navigation are not supplied by this preset.

Wheel spin, steering and suspension use `onVisualUpdate` and `updateVehicleWheels`.
Visual animation never moves the physics root or owns another clock. The optional
HUD lives in Presentation DOM, excluded from recorded world pixels.

Use `world_inspect` with `sections:['vehicles']`, `entityIds:['custom-plane']` and
optionally `vehicleDetail:'wheels'`. Null wheel fields mean the solver does not
measure that quantity. Landing flags describe the last landing; they are not a
new failure on every observation. Inspect boarding through `sections:['description']`.
