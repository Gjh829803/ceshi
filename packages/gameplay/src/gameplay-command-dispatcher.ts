import type {
  GameplayCommandV1,
  GameplayDiagnosticV1,
} from "@whitebox-world/gameplay-contracts";

import type { GameplayModeV1 } from "./gameplay-mode";
import type {
  GameplayCommandPlanAuthorityV1,
  GameplayPlanningStateV1,
  GameplayStatePlanResultV1,
} from "./gameplay-state";

type GameplayCommandTypeV1 = GameplayCommandV1["type"];

export interface GameplayCommandHandlerContextV1<
  Command extends GameplayCommandV1 = GameplayCommandV1,
> {
  readonly command: Command;
  readonly state: GameplayPlanningStateV1;
  readonly simulationTick: number;
}

export type GameplayCommandHandlerV1 = {
  [Type in GameplayCommandTypeV1]: Readonly<{
    type: Type;
    plan(
      context: GameplayCommandHandlerContextV1<
        Extract<GameplayCommandV1, { type: Type }>
      >,
    ): GameplayStatePlanResultV1;
  }>;
}[GameplayCommandTypeV1];

export interface GameplayDispatchInputV1 {
  readonly command: GameplayCommandV1;
  readonly state: GameplayPlanningStateV1;
  readonly commandPlanAuthority: GameplayCommandPlanAuthorityV1;
  readonly simulationTick: number;
  readonly gameplayMode: GameplayModeV1;
}

function rejected(
  code: GameplayDiagnosticV1["code"],
  message: string,
): GameplayStatePlanResultV1 {
  return Object.freeze({
    status: "rejected",
    diagnostic: Object.freeze({ code, message }),
  });
}

export class GameplayCommandDispatcher {
  private readonly handlersByType = new Map<
    GameplayCommandTypeV1,
    GameplayCommandHandlerV1
  >();

  constructor(handlers: readonly GameplayCommandHandlerV1[]) {
    for (const handler of handlers) {
      if (this.handlersByType.has(handler.type)) {
        throw new Error(
          `Duplicate Gameplay command Handler for type '${handler.type}'.`,
        );
      }
      this.handlersByType.set(handler.type, handler);
    }
  }

  dispatch(input: GameplayDispatchInputV1): GameplayStatePlanResultV1 {
    const handler = this.handlersByType.get(input.command.type);
    if (handler === undefined) {
      return rejected(
        "COMMAND_NOT_SUPPORTED",
        `No Gameplay command Handler is registered for '${input.command.type}'.`,
      );
    }
    const decision = input.gameplayMode.evaluateCommand({
      command: input.command,
      state: input.state,
      simulationTick: input.simulationTick,
    });
    if (decision.status === "rejected") return decision;
    const typedHandler = handler as Readonly<{
      plan(context: GameplayCommandHandlerContextV1): GameplayStatePlanResultV1;
    }>;
    const result = typedHandler.plan({
      command: input.command,
      state: input.state,
      simulationTick: input.simulationTick,
    });
    if (result.status === "planned") {
      input.commandPlanAuthority.authorizeCommandPlan({
        transitionPlan: result.transitionPlan,
        command: input.command,
        simulationTick: input.simulationTick,
      });
    }
    return result;
  }
}
