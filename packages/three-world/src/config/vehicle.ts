/** Maintainer defaults for vehicle attitude. These affect the collision hull and rider pose.
 * The first-person camera roll switch lives separately in presentation.ts. */
export const VEHICLE_ATTITUDE = Object.freeze({
  motorcycle:Object.freeze({rollRadiansPerSteeringSpeed:.02,maximumRollRadians:.5,rollResponsePerSecond:7}),
  ground:Object.freeze({rollRadiansPerSteeringSpeed:-.003,maximumRollRadians:.12,rollResponsePerSecond:7}),
  boat:Object.freeze({rollRadiansPerSteeringSpeed:.008,rollResponsePerSecond:3}),
  hover:Object.freeze({rollRadiansPerSteering:.12,rollResponsePerSecond:4}),
});
