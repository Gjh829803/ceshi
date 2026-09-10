/** STK Arcade reference radius curve, metres at m/s. A wider parking radius
 * accommodates these full-size hulls. Multipliers are asset-specific. */
export function roadYawRate(speed: number, multiplier: number) {
  const v = Math.abs(speed);
  const radius = v < 10 ? 3.4 + (8.625 - 3.4) * v / 10
    : v < 25 ? 8.625 + (17.25 - 8.625) * (v - 10) / 15
    : 17.25 + (34.5 - 17.25) * (v - 25) / 20;
  return speed / radius * multiplier;
}

export function coastSpeed(speed: number, deceleration: number, dt: number) {
  return Math.sign(speed) * Math.max(0, Math.abs(speed) - deceleration * dt);
}
