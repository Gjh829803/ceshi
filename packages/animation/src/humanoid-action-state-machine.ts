import type { HumanoidActionId } from "../../contracts/src/index.js";
import type { ActionPlayer } from "./action-registry.js";

export interface HumanoidActionStateInput {
  grounded: boolean;
  horizontalSpeed: number;
  runRequested: boolean;
}

export interface HumanoidActionStateMachineOptions {
  idleSpeedThreshold?: number;
  runSpeedThreshold?: number;
}

/** Locomotion-only state selection; gameplay one-shots can use ActionRegistry directly. */
export class HumanoidActionStateMachine {
  private readonly idleSpeedThreshold: number;
  private readonly runSpeedThreshold: number;
  private state: HumanoidActionId | null = null;

  constructor(
    private readonly player: ActionPlayer,
    options: HumanoidActionStateMachineOptions = {},
  ) {
    this.idleSpeedThreshold = options.idleSpeedThreshold ?? 0.08;
    this.runSpeedThreshold = options.runSpeedThreshold ?? 3.2;
  }

  get currentState(): HumanoidActionId | null {
    return this.state;
  }

  update(input: HumanoidActionStateInput): HumanoidActionId | null {
    const desired = this.resolve(input);
    if (desired === this.state) return this.state;
    if (!this.player.play(desired)) return this.state;
    this.state = desired;
    return this.state;
  }

  private resolve(input: HumanoidActionStateInput): HumanoidActionId {
    if (!input.grounded && this.player.has("jump")) return "jump";
    if (input.horizontalSpeed <= this.idleSpeedThreshold) return "idle";
    if (
      input.runRequested &&
      input.horizontalSpeed >= this.runSpeedThreshold &&
      this.player.has("run")
    ) {
      return "run";
    }
    return "walk";
  }
}
