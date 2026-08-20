export type GroundHumanoidActionIdV1 =
  | "idle"
  | "idle.gaming"
  | "walk"
  | "walk.step"
  | "run"
  | "jump"
  | "fall"
  | "land.hard"
  | "land.hard.alt"
  | "fly"
  | "float"
  | "swim.surface"
  | "swim.tread"
  | "swim.exit"
  | "sit"
  | "sit.idle"
  | "sit.ground.idle"
  | "sit.toStand"
  | "stand"
  | "lay.idle"
  | "roll.toRun"
  | "fight.enter"
  | "emote.salute"
  | "emote.angry"
  | "dance.rumba";

export interface GroundHumanoidActionInputV1 {
  movementMedium: "ground" | "air" | "water";
  horizontalSpeedMetersPerSecond: number;
  runRequested: boolean;
}
