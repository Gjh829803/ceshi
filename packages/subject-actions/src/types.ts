export type GroundHumanoidActionIdV1 = "idle" | "walk" | "run" | "jump";

export interface GroundHumanoidActionInputV1 {
  movementMedium: "ground" | "air" | "water";
  horizontalSpeedMetersPerSecond: number;
  runRequested: boolean;
}
