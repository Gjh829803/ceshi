import type { GroundHumanoidActionIdV1 } from "@whitebox-world/subject-contracts";

export const AUTOMATIC_GROUND_HUMANOID_ACTION_IDS_V1 = Object.freeze([
  "idle",
  "walk",
  "run",
  "jump",
] as const satisfies readonly GroundHumanoidActionIdV1[]);

export type AutomaticGroundHumanoidActionIdV1 =
  typeof AUTOMATIC_GROUND_HUMANOID_ACTION_IDS_V1[number];

export interface GroundHumanoidActionInputV1 {
  movementMedium: "ground" | "air";
  horizontalSpeedMetersPerSecond: number;
  runRequested: boolean;
}
