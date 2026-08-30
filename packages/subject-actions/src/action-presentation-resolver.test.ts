import { describe, expect, it } from "vitest";

import {
  hashRootMotionSourceV1,
  type RootMotionSourceBodyV1,
} from "@whitebox-world/character-movement";
import type {
  ActiveLocomotionCapabilityStateV2,
  GameplayActionStateV1,
} from "@whitebox-world/gameplay-contracts";

import {
  createActionPresentationRegistryV1,
  hashActionPresentationBindingV1,
  type ActionPresentationBindingBodyV1,
} from "./action-presentation-registry.js";
import {
  parseResolvedActionPresentationV1,
  resolveActionPresentationV1,
  type ActionPresentationResolveInputV1,
  verifyResolvedActionPresentationV1,
} from "./action-presentation-resolver.js";

const ACTION_HASH = `sha256:${"1".repeat(64)}` as const;
const rootMotionBody = {
  schemaVersion: 1,
  resourceRef: "worldkit://root-motion/vault@1",
  fixedDeltaSeconds: 1 / 60,
  samples: [
    { translationDeltaMetersXYZ: [0, 0, 0.1], facingYawDeltaRadians: 0 },
    { translationDeltaMetersXYZ: [0, 0, 0.2], facingYawDeltaRadians: 0.05 },
    { translationDeltaMetersXYZ: [0, 0, 0.3], facingYawDeltaRadians: 0.1 },
  ],
} as const satisfies RootMotionSourceBodyV1;
const ROOT_HASH = hashRootMotionSourceV1(rootMotionBody);
const bindingBody = {
  kind: "action-presentation-binding",
  schemaVersion: 1,
  resourceRef: "worldkit://action-presentation/vault@1",
  presentationKey: "action.vault",
  semanticActionRef: "worldkit://semantic-action/vault@1",
  semanticActionHash: ACTION_HASH,
  isInterruptible: true,
  clip: {
    sourceClipName: "Vault",
    loopMode: "once",
    playbackSpeedRatio: 1,
    blendDurationTicks: 3,
  },
  rootMotion: {
    mode: "locked",
    rootMotionSourceRef: rootMotionBody.resourceRef,
    rootMotionSourceHash: ROOT_HASH,
    priority: 100,
  },
} as const satisfies ActionPresentationBindingBodyV1;
const binding = {
  ...bindingBody,
  contentHash: hashActionPresentationBindingV1(bindingBody),
};
const registry = createActionPresentationRegistryV1({
  schemaVersion: 1,
  bindings: [binding],
  rootMotionSources: [{ ...rootMotionBody, contentHash: ROOT_HASH }],
});

function locomotion(
  tick: number,
  overrides: Partial<ActiveLocomotionCapabilityStateV2> = {},
): ActiveLocomotionCapabilityStateV2 {
  return {
    schemaVersion: 2,
    status: "active",
    mobilityMode: "grounded",
    gait: "idle",
    verticalPhase: "none",
    supportMode: "supported",
    movementMedium: "ground",
    facingYawRadians: 0,
    linearVelocity: { x: 0, y: 0, z: 0 },
    horizontalSpeedMetersPerSecond: 0,
    committedTick: tick,
    phaseEnteredTick: 0,
    transitionSequence: 0,
    ...overrides,
  };
}

function action(
  startedTick: number,
  mode: GameplayActionStateV1["mode"] = "active",
  transitionTick = startedTick,
): GameplayActionStateV1 {
  return {
    id: "action-execution:vault-1",
    kind: "action-state",
    semanticActionRef: bindingBody.semanticActionRef,
    semanticActionHash: ACTION_HASH,
    actorEntityId: "player",
    mode,
    startedSimulationTick: startedTick,
    lastTransitionSimulationTick: transitionTick,
  };
}

function input(
  tick: number,
  overrides: Partial<ActionPresentationResolveInputV1> = {},
): ActionPresentationResolveInputV1 {
  return {
    schemaVersion: 1,
    committedTick: tick,
    fixedDeltaSeconds: 1 / 60,
    locomotion: locomotion(tick),
    ...overrides,
  };
}

describe("resolveActionPresentationV1", () => {
  it.each([
    ["idle", locomotion(8), "locomotion.idle"],
    ["walk despite zero velocity", locomotion(8, { gait: "walk" }), "locomotion.walk"],
    ["run despite zero velocity", locomotion(8, { gait: "run" }), "locomotion.run"],
    ["takeoff", locomotion(8, {
      mobilityMode: "airborne", gait: "none", verticalPhase: "takeoff",
      supportMode: "unsupported", movementMedium: "air",
      linearVelocity: { x: 0, y: 4, z: 0 }, phaseEnteredTick: 8,
    }), "locomotion.takeoff"],
    ["rising despite downward raw velocity", locomotion(8, {
      mobilityMode: "airborne", gait: "none", verticalPhase: "rising",
      supportMode: "unsupported", movementMedium: "air",
      linearVelocity: { x: 0, y: -99, z: 0 },
    }), "locomotion.rising"],
    ["apex", locomotion(8, {
      mobilityMode: "airborne", gait: "none", verticalPhase: "apex",
      supportMode: "unsupported", movementMedium: "air",
    }), "locomotion.apex"],
    ["falling", locomotion(8, {
      mobilityMode: "airborne", gait: "none", verticalPhase: "falling",
      supportMode: "unsupported", movementMedium: "air",
      linearVelocity: { x: 0, y: -4, z: 0 },
    }), "locomotion.falling"],
    ["landing", locomotion(8, { verticalPhase: "landing" }), "locomotion.landing"],
  ] as const)("uses committed %s semantics, not velocity inference", (_label, state, expected) => {
    const resolved = resolveActionPresentationV1(input(8, { locomotion: state }), registry);
    expect(resolved.presentationKey).toBe(expected);
    expect(resolved.layeredMoves).toEqual([]);
  });

  it.each([
    ["small anticipation", locomotion(8), {
      schemaVersion: 1, variant: "small", phase: "anticipating",
      startedTick: 8, anticipationStartedTick: 8, committedTick: 8,
      anticipationTicksRemaining: 4,
    }, "locomotion.small-jump.takeoff"],
    ["small airborne", locomotion(8, {
      mobilityMode: "airborne", gait: "none", verticalPhase: "falling",
      supportMode: "unsupported", movementMedium: "air",
      linearVelocity: { x: 0, y: -2, z: 0 },
    }), {
      schemaVersion: 1, variant: "small", phase: "airborne",
      startedTick: 6, anticipationStartedTick: 6, takeoffTick: 7, committedTick: 8,
    }, "locomotion.small-jump.airborne"],
    ["large anticipation", locomotion(8), {
      schemaVersion: 1, variant: "large", phase: "anticipating",
      startedTick: 8, anticipationStartedTick: 8, committedTick: 8,
      anticipationTicksRemaining: 6,
    }, "locomotion.takeoff"],
    ["large airborne", locomotion(8, {
      mobilityMode: "airborne", gait: "none", verticalPhase: "falling",
      supportMode: "unsupported", movementMedium: "air",
      linearVelocity: { x: 0, y: -2, z: 0 },
    }), {
      schemaVersion: 1, variant: "large", phase: "airborne",
      startedTick: 6, anticipationStartedTick: 6, takeoffTick: 7, committedTick: 8,
    }, "locomotion.falling"],
    ["buffered", locomotion(8, {
      mobilityMode: "airborne", gait: "none", verticalPhase: "falling",
      supportMode: "unsupported", movementMedium: "air",
      linearVelocity: { x: 0, y: -2, z: 0 },
    }), {
      schemaVersion: 1, variant: "small", phase: "buffered",
      startedTick: 8, committedTick: 8,
    }, "locomotion.falling"],
  ] as const)("maps committed %s without provider inference", (
    _label,
    committedLocomotion,
    jumpEpisode,
    expected,
  ) => {
    const resolved = resolveActionPresentationV1({
      ...input(8, { locomotion: committedLocomotion }),
      jumpEpisode,
    }, registry);
    expect(resolved.presentationKey).toBe(expected);
  });

  it("rejects forged or incoherent split jump presentation input", () => {
    const airborneEpisode = {
      schemaVersion: 1,
      variant: "small",
      phase: "airborne",
      startedTick: 6,
      anticipationStartedTick: 6,
      takeoffTick: 7,
      committedTick: 8,
    } as const;
    for (const malformed of [
      { ...input(8), jumpEpisode: { ...airborneEpisode, committedTick: 7 } },
      { ...input(8), jumpEpisode: airborneEpisode },
      { ...input(8), jumpPresentation: { variant: "small" } },
    ]) {
      expect(() => resolveActionPresentationV1(malformed, registry))
        .toThrow("3C_INPUT_INVALID");
    }
  });

  it("samples locked Root Motion into a deterministic LayeredMove without using the Clip name", () => {
    const first = resolveActionPresentationV1(input(21, {
      locomotion: locomotion(21),
      activeActionState: action(20),
    }), registry);
    const replay = resolveActionPresentationV1(structuredClone(input(21, {
      locomotion: locomotion(21),
      activeActionState: action(20),
    })), registry);

    expect(first).toEqual(replay);
    expect(first.presentationKey).toBe("action.vault");
    if (first.source !== "action") throw new Error("expected Action presentation");
    expect(first.actionBindingHash).toBe(binding.contentHash);
    expect(first.layeredMoves).toEqual([{
      schemaVersion: 1,
      kind: "root-motion",
      id: "action-root-motion:action-execution:vault-1",
      priority: 100,
      startedTick: 20,
      rootMotionSourceRef: rootMotionBody.resourceRef,
      rootMotionSourceHash: ROOT_HASH,
      translationDeltaMetersXYZ: [0, 0, 0.2],
      facingYawDeltaRadians: 0.05,
    }]);
    expect(JSON.stringify(first)).not.toContain("Vault");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.layeredMoves)).toBe(true);
    expect(parseResolvedActionPresentationV1(first)).toEqual(first);
    expect(verifyResolvedActionPresentationV1(first, registry, action(20))).toEqual(first);
    expect(() => parseResolvedActionPresentationV1({
      ...first,
      sourceClipName: "Vault",
    })).toThrow("3C_INPUT_INVALID");
    expect(() => parseResolvedActionPresentationV1({
      ...first,
      layeredMoves: [{ ...first.layeredMoves[0]!, id: "root-motion:forged" }],
    })).toThrow("3C_INPUT_INVALID");
    expect(() => parseResolvedActionPresentationV1({
      ...first,
      layeredMoves: [first.layeredMoves[0]!, first.layeredMoves[0]!],
    })).toThrow("3C_INPUT_INVALID");
  });

  it.each([
    ["binding Ref", (resolved: Record<string, unknown>) => ({
      ...resolved,
      actionBindingRef: "worldkit://action-presentation/not-vault@1",
    })],
    ["binding Hash", (resolved: Record<string, unknown>) => ({
      ...resolved,
      actionBindingHash: `sha256:${"2".repeat(64)}`,
    })],
    ["presentation owner", (resolved: Record<string, unknown>) => ({
      ...resolved,
      presentationKey: "action.not-vault",
    })],
    ["Root Motion Ref", (resolved: Record<string, unknown>) => ({
      ...resolved,
      layeredMoves: [{
        ...(resolved.layeredMoves as readonly Record<string, unknown>[])[0],
        rootMotionSourceRef: "worldkit://root-motion/not-vault@1",
      }],
    })],
    ["Root Motion Hash", (resolved: Record<string, unknown>) => ({
      ...resolved,
      layeredMoves: [{
        ...(resolved.layeredMoves as readonly Record<string, unknown>[])[0],
        rootMotionSourceHash: `sha256:${"2".repeat(64)}`,
      }],
    })],
    ["Root Motion delta", (resolved: Record<string, unknown>) => ({
      ...resolved,
      layeredMoves: [{
        ...(resolved.layeredMoves as readonly Record<string, unknown>[])[0],
        translationDeltaMetersXYZ: [0, 0, 999],
      }],
    })],
    ["Root Motion yaw", (resolved: Record<string, unknown>) => ({
      ...resolved,
      layeredMoves: [{
        ...(resolved.layeredMoves as readonly Record<string, unknown>[])[0],
        facingYawDeltaRadians: 999,
      }],
    })],
    ["Root Motion start Tick", (resolved: Record<string, unknown>) => ({
      ...resolved,
      layeredMoves: [{
        ...(resolved.layeredMoves as readonly Record<string, unknown>[])[0],
        startedTick: 19,
      }],
    })],
    ["Root Motion priority", (resolved: Record<string, unknown>) => ({
      ...resolved,
      layeredMoves: [{
        ...(resolved.layeredMoves as readonly Record<string, unknown>[])[0],
        priority: 99,
      }],
    })],
    ["missing locked Root Motion", (resolved: Record<string, unknown>) => ({
      ...resolved,
      layeredMoves: [],
    })],
  ] as const)("rejects a resolved Action with forged %s", (_label, mutate) => {
    const resolved = resolveActionPresentationV1(input(21, {
      locomotion: locomotion(21),
      activeActionState: action(20),
    }), registry);

    expect(() => verifyResolvedActionPresentationV1(
      mutate(resolved as unknown as Record<string, unknown>),
      registry,
      action(20),
    )).toThrow();
  });

  it("requires the trusted committed Action and rejects repeated-sample start-Tick forgery", () => {
    const repeatedBody = {
      ...rootMotionBody,
      resourceRef: "worldkit://root-motion/repeated-vault@1",
      samples: [
        rootMotionBody.samples[0],
        rootMotionBody.samples[0],
        rootMotionBody.samples[0],
      ],
    } as const satisfies RootMotionSourceBodyV1;
    const repeatedHash = hashRootMotionSourceV1(repeatedBody);
    const repeatedBindingBody = {
      ...bindingBody,
      resourceRef: "worldkit://action-presentation/repeated-vault@1",
      rootMotion: {
        ...bindingBody.rootMotion,
        rootMotionSourceRef: repeatedBody.resourceRef,
        rootMotionSourceHash: repeatedHash,
      },
    } as const satisfies ActionPresentationBindingBodyV1;
    const repeatedRegistry = createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [{
        ...repeatedBindingBody,
        contentHash: hashActionPresentationBindingV1(repeatedBindingBody),
      }],
      rootMotionSources: [{ ...repeatedBody, contentHash: repeatedHash }],
    });
    const committedAction = action(20);
    const resolved = resolveActionPresentationV1(input(21, {
      activeActionState: committedAction,
    }), repeatedRegistry);
    const falseStart = {
      ...resolved,
      layeredMoves: [{ ...resolved.layeredMoves[0]!, startedTick: 19 }],
    };

    expect(() => verifyResolvedActionPresentationV1(
      resolved,
      repeatedRegistry,
    )).toThrow("3C_INPUT_INVALID");
    expect(() => verifyResolvedActionPresentationV1(
      falseStart,
      repeatedRegistry,
      committedAction,
    )).toThrow("3C_INPUT_INVALID");
  });

  it("ties Action identity and lifecycle to committed state and forbids it for locomotion", () => {
    const committedAction = action(20, "active", 21);
    const resolved = resolveActionPresentationV1(input(21, {
      activeActionState: committedAction,
    }), registry);
    const locomotionResult = resolveActionPresentationV1(input(21), registry);

    for (const forgedState of [
      { ...committedAction, id: "action-execution:other" },
      {
        ...committedAction,
        semanticActionRef: "worldkit://semantic-action/other@1",
      },
      { ...committedAction, semanticActionHash: `sha256:${"2".repeat(64)}` },
      { ...committedAction, startedSimulationTick: 19 },
      { ...committedAction, lastTransitionSimulationTick: 22 },
    ]) {
      expect(() => verifyResolvedActionPresentationV1(
        resolved,
        registry,
        forgedState as GameplayActionStateV1,
      )).toThrow("3C_INPUT_INVALID");
    }
    expect(() => verifyResolvedActionPresentationV1(
      locomotionResult,
      registry,
      committedAction,
    )).toThrow("3C_INPUT_INVALID");
  });

  it("rejects Root Motion on a binding whose locked mode is none", () => {
    const noneBody = {
      ...bindingBody,
      resourceRef: "worldkit://action-presentation/wave@1",
      presentationKey: "action.wave",
      semanticActionRef: "worldkit://semantic-action/wave@1",
      semanticActionHash: `sha256:${"3".repeat(64)}`,
      rootMotion: { mode: "none" },
    } as const satisfies ActionPresentationBindingBodyV1;
    const noneBinding = {
      ...noneBody,
      contentHash: hashActionPresentationBindingV1(noneBody),
    };
    const noneRegistry = createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [noneBinding],
      rootMotionSources: [],
    });
    const resolved = resolveActionPresentationV1(input(21, {
      locomotion: locomotion(21),
      activeActionState: {
        ...action(20),
        semanticActionRef: noneBody.semanticActionRef,
        semanticActionHash: noneBody.semanticActionHash,
      },
    }), noneRegistry);
    const forged = {
      ...resolved,
      layeredMoves: [{
        ...resolveActionPresentationV1(input(21, {
          locomotion: locomotion(21),
          activeActionState: action(20),
        }), registry).layeredMoves[0]!,
      }],
    };

    expect(() => verifyResolvedActionPresentationV1(
      forged,
      noneRegistry,
      {
        ...action(20),
        semanticActionRef: noneBody.semanticActionRef,
        semanticActionHash: noneBody.semanticActionHash,
      },
    )).toThrow();
  });

  it("exits an interruptible Action from committed state absence with no stale Root Motion", () => {
    const active = resolveActionPresentationV1(input(20, {
      activeActionState: action(20),
    }), registry);
    const interrupted = resolveActionPresentationV1(input(21, {
      locomotion: locomotion(21, { gait: "walk" }),
    }), registry);
    const replay = resolveActionPresentationV1(structuredClone(input(21, {
      locomotion: locomotion(21, { gait: "walk" }),
    })), registry);

    expect(active.source).toBe("action");
    expect(interrupted).toEqual(replay);
    expect(interrupted).toMatchObject({
      source: "locomotion",
      presentationKey: "locomotion.walk",
      layeredMoves: [],
    });
  });

  it("samples starting/active/completing exactly by committed Tick and stops after removal", () => {
    const starting = resolveActionPresentationV1(input(20, {
      activeActionState: action(20, "starting", 20),
    }), registry);
    const active = resolveActionPresentationV1(input(21, {
      locomotion: locomotion(21),
      activeActionState: action(20, "active", 21),
    }), registry);
    const completing = resolveActionPresentationV1(input(22, {
      locomotion: locomotion(22),
      activeActionState: action(20, "completing", 22),
    }), registry);
    const removed = resolveActionPresentationV1(input(23, {
      locomotion: locomotion(23),
    }), registry);

    expect(starting.layeredMoves[0]).toMatchObject({
      kind: "root-motion", translationDeltaMetersXYZ: [0, 0, 0.1],
    });
    expect(active.layeredMoves[0]).toMatchObject({
      kind: "root-motion", translationDeltaMetersXYZ: [0, 0, 0.2],
    });
    expect(completing.layeredMoves[0]).toMatchObject({
      kind: "root-motion", translationDeltaMetersXYZ: [0, 0, 0.3],
    });
    expect(removed.layeredMoves).toEqual([]);
    expect(removed.source).toBe("locomotion");
  });

  it("fails closed for the wrong semantic Action hash and never falls back to Clip-name lookup", () => {
    expect(() => resolveActionPresentationV1(input(20, {
      activeActionState: {
        ...action(20),
        semanticActionHash: `sha256:${"2".repeat(64)}`,
      },
    }), registry)).toThrow("3C_LAYERED_MOVE_SOURCE_UNRESOLVED");
  });

  it.each([
    ["mismatched committed Tick", input(8, { locomotion: locomotion(7) })],
    ["extra input field", { ...input(8), clipName: "Vault" }],
    ["non-finite fixed Tick", { ...input(8), fixedDeltaSeconds: Number.NaN }],
    ["Action from the future", input(8, { activeActionState: action(9) })],
    ["non-NFC Action execution ID", input(8, {
      activeActionState: { ...action(8), id: "action-execution:va\u0061\u0301ult" },
    })],
  ] as const)("rejects %s", (_label, malformed) => {
    expect(() => resolveActionPresentationV1(malformed, registry)).toThrow("3C_INPUT_INVALID");
  });
});
