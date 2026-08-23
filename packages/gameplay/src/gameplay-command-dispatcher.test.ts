import { describe, expect, it, vi } from "vitest";

import type { GameplayCommandV1 } from "@whitebox-world/gameplay-contracts";

import { GameplayCommandDispatcher } from "./gameplay-command-dispatcher";

const command: GameplayCommandV1 = {
  schemaVersion: 1,
  id: "bind-a",
  type: "control.bind",
  runtimeSessionId: "runtime-a",
  worldSessionId: "world-a",
  controllerEntityId: "controller-a",
  controlledEntityId: "subject-a",
  expectedPossession: { mode: "unbound" },
};

describe("GameplayCommandDispatcher", () => {
  it("requires exactly one handler and lets GameplayMode reject before planning", () => {
    expect(() => new GameplayCommandDispatcher([
      { type: "control.bind", plan: vi.fn() },
      { type: "control.bind", plan: vi.fn() },
    ])).toThrow(/Duplicate/);
    const plan = vi.fn();
    const authorizeCommandPlan = vi.fn();
    const dispatcher = new GameplayCommandDispatcher([{ type: "control.bind", plan }]);
    const result = dispatcher.dispatch({
      command,
      state: {} as never,
      commandPlanAuthority: { authorizeCommandPlan },
      simulationTick: 1,
      gameplayMode: {
        gameplayModeRef: "worldkit://gameplay-mode/test@1",
        evaluateCommand: () => ({
          status: "rejected",
          diagnostic: { code: "GAMEPLAY_RULE_REJECTED", message: "blocked" },
        }),
      },
    });
    expect(result).toMatchObject({ status: "rejected" });
    expect(plan).not.toHaveBeenCalled();
    expect(authorizeCommandPlan).not.toHaveBeenCalled();
  });

  it("returns COMMAND_NOT_SUPPORTED without a fallback handler", () => {
    const dispatcher = new GameplayCommandDispatcher([]);
    expect(dispatcher.dispatch({
      command,
      state: {} as never,
      commandPlanAuthority: { authorizeCommandPlan: vi.fn() },
      simulationTick: 1,
      gameplayMode: {
        gameplayModeRef: "worldkit://gameplay-mode/test@1",
        evaluateCommand: () => ({ status: "accepted" }),
      },
    })).toMatchObject({
      status: "rejected",
      diagnostic: { code: "COMMAND_NOT_SUPPORTED" },
    });
  });

  it("does not authorize a rejected Handler result", () => {
    const authorizeCommandPlan = vi.fn();
    const dispatcher = new GameplayCommandDispatcher([{
      type: "control.bind",
      plan: () => ({
        status: "rejected",
        diagnostic: {
          code: "GAMEPLAY_RULE_REJECTED",
          message: "rejected by Handler",
        },
      }),
    }]);

    expect(dispatcher.dispatch({
      command,
      state: {} as never,
      commandPlanAuthority: { authorizeCommandPlan },
      simulationTick: 1,
      gameplayMode: {
        gameplayModeRef: "worldkit://gameplay-mode/test@1",
        evaluateCommand: () => ({ status: "accepted" }),
      },
    })).toMatchObject({
      status: "rejected",
      diagnostic: { code: "GAMEPLAY_RULE_REJECTED" },
    });
    expect(authorizeCommandPlan).not.toHaveBeenCalled();
  });
});
