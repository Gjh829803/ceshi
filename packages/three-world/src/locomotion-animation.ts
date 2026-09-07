import type { PhysicsEntityState } from './engine-contracts.js';

type GroundAction = 'idle' | 'walk' | 'run';
export type LocomotionAction = GroundAction | 'jump' | 'fall';

const MINIMUM_FALL_SECONDS = 0.12;
const MAXIMUM_AIRBORNE_GRACE_SECONDS = 0.45;
const BLOCKED_MOVEMENT_GRACE_SECONDS = 0.075;

/** Presentation history only: never changes support, gravity or jump eligibility. */
export class LocomotionAnimation {
  private supportHeightMeters: number | undefined;
  private airborneSeconds = 0;
  private blockedSeconds = 0;
  private falling = false;
  private groundAction: GroundAction = 'idle';

  update(state: PhysicsEntityState, input: {
    deltaSeconds: number;
    desiredSpeedMetersPerSecond: number;
    heightMeters: number;
    run: boolean;
    jumped: boolean;
  }): LocomotionAction {
    const speed = Math.hypot(state.velocityMetersPerSecondXYZ[0], state.velocityMetersPerSecondXYZ[2]);
    const moving = speed > 0.1;
    this.blockedSeconds = moving ? 0 : this.blockedSeconds + input.deltaSeconds;
    // A released control stops immediately; a persistent wall contact still stops
    // after a bounded interval. A one-tick contact fluctuation retains clip time.
    const retainMovement = input.desiredSpeedMetersPerSecond > 0.1 && this.groundAction !== 'idle'
      && this.blockedSeconds < BLOCKED_MOVEMENT_GRACE_SECONDS;
    this.groundAction = moving || retainMovement ? (input.run ? 'run' : 'walk') : 'idle';

    if (state.isGrounded) {
      this.supportHeightMeters = state.positionMetersXYZ[1];
      this.airborneSeconds = 0;
      this.falling = false;
      return this.groundAction;
    }

    this.supportHeightMeters ??= state.positionMetersXYZ[1];
    this.airborneSeconds += input.deltaSeconds;
    if (input.jumped) return 'jump';

    const descentMeters = this.supportHeightMeters - state.positionMetersXYZ[1];
    // Scale with the physical body: 0.27 m for the default 1.8 m humanoid.
    // Combining distance and time avoids treating a slow small step as a fall.
    const significantDescent = descentMeters > input.heightMeters * 0.15;
    this.falling ||= (this.airborneSeconds >= MINIMUM_FALL_SECONDS && significantDescent)
      || this.airborneSeconds >= MAXIMUM_AIRBORNE_GRACE_SECONDS;
    return this.falling ? 'fall' : this.groundAction;
  }
}
