import type {
  GameplayCommandV1,
  GameplayDiagnosticV1,
} from "@whitebox-world/gameplay-contracts";
import { parseGameplayDiagnosticV1 } from "@whitebox-world/gameplay-contracts";
import { isNil } from "lodash-es";

import type { GameplayModeV1 } from "./gameplay-mode";
import type { GameplayModeCommandDecisionV1 } from "./gameplay-mode";
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

function snapshotDataRecord(
  input: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (typeof input !== "object" || isNil(input)) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(input);
    if (prototype !== Object.prototype && !isNil(prototype)) return undefined;
    const record = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return undefined;
  }
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actualKeys = Reflect.ownKeys(record);
  return actualKeys.length === keys.length && actualKeys.every(
    (key) => typeof key === "string" && keys.includes(key),
  );
}

function snapshotDiagnostic(
  input: unknown,
  errorCode: string,
): GameplayDiagnosticV1 {
  const diagnostic = parseGameplayDiagnosticV1(input);
  if (isNil(diagnostic)) {
    throw new Error(`${errorCode}: diagnostic must be canonical plain data.`);
  }
  return Object.freeze({ ...diagnostic });
}

function snapshotModeDecision(input: unknown): GameplayModeCommandDecisionV1 {
  const record = snapshotDataRecord(input);
  if (isNil(record)) {
    throw new Error(
      "GAMEPLAY_MODE_RESULT_INVALID: Mode decision must be a plain data object.",
    );
  }
  if (record.status === "accepted" && hasExactKeys(record, ["status"])) {
    return Object.freeze({ status: "accepted" });
  }
  if (record.status === "rejected" && hasExactKeys(record, ["status", "diagnostic"])) {
    return Object.freeze({
      status: "rejected",
      diagnostic: snapshotDiagnostic(
        record.diagnostic,
        "GAMEPLAY_MODE_RESULT_INVALID",
      ),
    });
  }
  throw new Error(
    "GAMEPLAY_MODE_RESULT_INVALID: Mode decision has an invalid closed shape.",
  );
}

function snapshotHandlerResult(input: unknown): GameplayStatePlanResultV1 {
  const record = snapshotDataRecord(input);
  if (isNil(record)) {
    throw new Error(
      "GAMEPLAY_HANDLER_RESULT_INVALID: Handler result must be a plain data object.",
    );
  }
  if (record.status === "planned" && hasExactKeys(record, ["status", "transitionPlan"])) {
    return Object.freeze({
      status: "planned",
      transitionPlan: record.transitionPlan as Extract<
        GameplayStatePlanResultV1,
        { status: "planned" }
      >["transitionPlan"],
    });
  }
  if (record.status === "rejected" && hasExactKeys(record, ["status", "diagnostic"])) {
    return Object.freeze({
      status: "rejected",
      diagnostic: snapshotDiagnostic(
        record.diagnostic,
        "GAMEPLAY_HANDLER_RESULT_INVALID",
      ),
    });
  }
  throw new Error(
    "GAMEPLAY_HANDLER_RESULT_INVALID: Handler result has an invalid closed shape.",
  );
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
    if (isNil(handler)) {
      return rejected(
        "COMMAND_NOT_SUPPORTED",
        `No Gameplay command Handler is registered for '${input.command.type}'.`,
      );
    }
    const decision = snapshotModeDecision(input.gameplayMode.evaluateCommand({
      command: input.command,
      state: input.state,
      simulationTick: input.simulationTick,
    }));
    if (decision.status === "rejected") return decision;
    const typedHandler = handler as Readonly<{
      plan(context: GameplayCommandHandlerContextV1): GameplayStatePlanResultV1;
    }>;
    const result = snapshotHandlerResult(typedHandler.plan({
      command: input.command,
      state: input.state,
      simulationTick: input.simulationTick,
    }));
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
