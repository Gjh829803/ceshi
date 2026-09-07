import { describe, expect, it } from 'vitest';
import { LocomotionAnimation } from './locomotion-animation.js';
import type { PhysicsEntityState } from './engine-contracts.js';

function sample(y = 1, grounded = true, speed = 1.65): PhysicsEntityState {
  return { id: 'traveler', positionMetersXYZ: [0, y, 0], velocityMetersPerSecondXYZ: [0, grounded ? 0 : -1, -speed], isGrounded: grounded, collisionEntityIds: [] };
}
const input = { deltaSeconds: 1 / 60, desiredSpeedMetersPerSecond: 1.65, heightMeters: 1.8, run: false, jumped: false };

describe('locomotion presentation history', () => {
  it('keeps a slow small descent in walk without modifying physical support', () => {
    const animation = new LocomotionAnimation();
    expect(animation.update(sample(), input)).toBe('walk');
    for (let i = 1; i <= 18; i++) {
      const physical = sample(1 - .2 * i / 18, false);
      expect(animation.update(physical, input)).toBe('walk');
      expect(physical.isGrounded).toBe(false);
    }
    expect(animation.update(sample(.8), input)).toBe('walk');
  });

  it.each([30, 60, 120, 240])('confirms real descent using seconds at %i Hz', hz => {
    const animation = new LocomotionAnimation();
    const settings = { ...input, deltaSeconds: 1 / hz };
    animation.update(sample(), settings);
    let firstFallSeconds = 0;
    for (let i = 1; i <= hz / 2; i++) {
      const seconds = i / hz;
      const action = animation.update(sample(1 - 4.905 * seconds * seconds, false), settings);
      if (action === 'fall' && !firstFallSeconds) firstFallSeconds = seconds;
    }
    expect(firstFallSeconds).toBeGreaterThanOrEqual(.23);
    expect(firstFallSeconds).toBeLessThan(.28);
    // A temporary small upward correction does not toggle a confirmed fall.
    expect(animation.update(sample(.9, false), settings)).toBe('fall');
    expect(animation.update(sample(.9), settings)).toBe('walk');
  });

  it('bounds grace for unsupported spawn or sustained hovering', () => {
    const animation = new LocomotionAnimation();
    let action: string = '';
    for (let i = 0; i < 30; i++) action = animation.update(sample(10, false, 0), { ...input, desiredSpeedMetersPerSecond: 0 });
    expect(action).toBe('fall');
  });

  it('never delays an accepted jump', () => {
    const animation = new LocomotionAnimation();
    animation.update(sample(), input);
    expect(animation.update(sample(1.08, false), { ...input, jumped: true })).toBe('jump');
  });

  it('absorbs a single low-speed tick but stops on release and sustained blocking', () => {
    const animation = new LocomotionAnimation();
    animation.update(sample(), input);
    expect(animation.update(sample(1, true, .09), input)).toBe('walk');
    expect(animation.update(sample(), input)).toBe('walk');
    expect(animation.update(sample(1, true, 0), { ...input, desiredSpeedMetersPerSecond: 0 })).toBe('idle');
    animation.update(sample(), input);
    let action: string = '';
    for (let i = 0; i < 6; i++) action = animation.update(sample(1, true, 0), input);
    expect(action).toBe('idle');
  });

  it('keeps independent support heights, clocks and run intent per actor', () => {
    const first = new LocomotionAnimation(), second = new LocomotionAnimation();
    first.update(sample(10), input); second.update(sample(1), input);
    for (let i = 0; i < 20; i++) {
      first.update(sample(9, false), input);
      expect(second.update(sample(.9, false), { ...input, run: true })).toBe('run');
    }
    expect(first.update(sample(9, false), input)).toBe('fall');
  });
});
