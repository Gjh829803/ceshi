import {
  resolveGroundHumanoidAction,
  type GroundHumanoidActionIdV1,
  type GroundHumanoidActionInputV1,
} from "@whitebox-world/subject-actions";
import type { ActionPlayer } from "./action-registry.js";

export interface HumanoidActionStateInput {
  grounded: boolean;
  horizontalSpeed: number;
  runRequested: boolean;
}

export interface HumanoidActionStateMachineOptions {
  runSpeedThreshold?: number;
}

/** Locomotion-only state selection; gameplay one-shots can use ActionRegistry directly. */
export class HumanoidActionStateMachine {
  private readonly runSpeedThreshold: number;
  private state: GroundHumanoidActionIdV1 | null = null;

  constructor(
    private readonly player: ActionPlayer,
    options: HumanoidActionStateMachineOptions = {},
  ) {
    this.runSpeedThreshold = options.runSpeedThreshold ?? 3.2;
  }

  get currentState(): GroundHumanoidActionIdV1 | null {
    return this.state;
  }

  update(input: HumanoidActionStateInput): GroundHumanoidActionIdV1 | null {
    const desired = this.resolve(input);
    if (desired === this.state) return this.state;
    if (!this.player.play(desired)) return this.state;
    this.state = desired;
    return this.state;
  }

  private resolve(input: HumanoidActionStateInput): GroundHumanoidActionIdV1 {
    const actionInput: GroundHumanoidActionInputV1 = {
      movementMedium: input.grounded ? "ground" : "air",
      horizontalSpeedMetersPerSecond: input.horizontalSpeed,
      runRequested:
        input.runRequested && input.horizontalSpeed >= this.runSpeedThreshold,
    };
    let desired = resolveGroundHumanoidAction(actionInput);

    if (desired === "jump" && !this.player.has("jump")) {
      desired = resolveGroundHumanoidAction({
        ...actionInput,
        movementMedium: "ground",
      });
    }
    if (desired === "run" && !this.player.has("run")) return "walk";
    return desired;
  }
}
