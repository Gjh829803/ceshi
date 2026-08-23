import { describe, expect, it, vi } from "vitest";

import type { GameplayCommandV1 } from "@whitebox-world/gameplay-contracts";

import { GameplayCommandDispatcher } from "./gameplay-command-dispatcher";
import type { GameplayCommandTransitionPlanV1 } from "./gameplay-state";

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

  it("rejects an alternating Handler accessor before authorization", () => {
    const firstPlan = Object.freeze({ id: "first" }) as unknown as
      GameplayCommandTransitionPlanV1;
    const substitutedPlan = Object.freeze({ id: "substituted" }) as unknown as
      GameplayCommandTransitionPlanV1;
    let transitionPlanReads = 0;
    const hostileResult = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(hostileResult, {
      status: { enumerable: true, value: "planned" },
      transitionPlan: {
        enumerable: true,
        get: () => {
          transitionPlanReads += 1;
          return transitionPlanReads === 1 ? firstPlan : substitutedPlan;
        },
      },
    });
    const authorizeCommandPlan = vi.fn();
    const dispatcher = new GameplayCommandDispatcher([{
      type: "control.bind",
      plan: () => hostileResult as never,
    }]);

    expect(() => dispatcher.dispatch({
      command,
      state: {} as never,
      commandPlanAuthority: { authorizeCommandPlan },
      simulationTick: 1,
      gameplayMode: {
        gameplayModeRef: "worldkit://gameplay-mode/test@1",
        evaluateCommand: () => ({ status: "accepted" }),
      },
    })).toThrow(/GAMEPLAY_HANDLER_RESULT_INVALID/);
    expect(authorizeCommandPlan).not.toHaveBeenCalled();
    expect(transitionPlanReads).toBe(0);
  });

  it("returns its own frozen planned result with the exact authorized Plan reference", () => {
    const transitionPlan = Object.freeze({ id: "exact" }) as unknown as
      GameplayCommandTransitionPlanV1;
    const handlerOwnedResult = {
      status: "planned" as const,
      transitionPlan,
    };
    const authorizeCommandPlan = vi.fn();
    const dispatcher = new GameplayCommandDispatcher([{
      type: "control.bind",
      plan: () => handlerOwnedResult,
    }]);

    const result = dispatcher.dispatch({
      command,
      state: {} as never,
      commandPlanAuthority: { authorizeCommandPlan },
      simulationTick: 1,
      gameplayMode: {
        gameplayModeRef: "worldkit://gameplay-mode/test@1",
        evaluateCommand: () => ({ status: "accepted" }),
      },
    });
    expect(result).not.toBe(handlerOwnedResult);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).toEqual({ status: "planned", transitionPlan });
    expect(authorizeCommandPlan).toHaveBeenCalledWith({
      transitionPlan,
      command,
      simulationTick: 1,
    });
  });

  it("rejects an accessor-backed Handler diagnostic without invoking it", () => {
    const hostileResult = Object.create(null) as Record<string, unknown>;
    const diagnosticGetter = vi.fn(() => ({
      code: "GAMEPLAY_RULE_REJECTED",
      message: "hidden",
    }));
    Object.defineProperties(hostileResult, {
      status: { enumerable: true, value: "rejected" },
      diagnostic: { enumerable: true, get: diagnosticGetter },
    });
    const dispatcher = new GameplayCommandDispatcher([{
      type: "control.bind",
      plan: () => hostileResult as never,
    }]);

    expect(() => dispatcher.dispatch({
      command,
      state: {} as never,
      commandPlanAuthority: { authorizeCommandPlan: vi.fn() },
      simulationTick: 1,
      gameplayMode: {
        gameplayModeRef: "worldkit://gameplay-mode/test@1",
        evaluateCommand: () => ({ status: "accepted" }),
      },
    })).toThrow(/GAMEPLAY_HANDLER_RESULT_INVALID/);
    expect(diagnosticGetter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed Mode and diagnostic results before planning", () => {
    const plan = vi.fn();
    const dispatcher = new GameplayCommandDispatcher([{
      type: "control.bind",
      plan,
    }]);
    const hostileDecision = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hostileDecision, "status", {
      enumerable: true,
      get: () => "accepted",
    });

    expect(() => dispatcher.dispatch({
      command,
      state: {} as never,
      commandPlanAuthority: { authorizeCommandPlan: vi.fn() },
      simulationTick: 1,
      gameplayMode: {
        gameplayModeRef: "worldkit://gameplay-mode/test@1",
        evaluateCommand: () => hostileDecision as never,
      },
    })).toThrow(/GAMEPLAY_MODE_RESULT_INVALID/);
    expect(plan).not.toHaveBeenCalled();
  });
});
