import { describe, expect, it } from "vitest";
import {
  resolveCharacterStateV1,
  type SubjectResolvedStateV1,
} from "./character-state-resolver.js";

const MEDIUM_LOCK = {
  physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
  locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
  motionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
  motionKernelRef: "worldkit://motion-kernel/free-ground@1",
  controlFeelProfileRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
  controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
  mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
  allowWalk: true,
  allowRun: true,
  allowJump: true,
  coyoteTimeSeconds: 0.1,
} as const;

const GROUND_IDLE: SubjectResolvedStateV1 = {
  movementMedium: "ground",
  locomotionMode: "idle",
  activePhysicsBodyProfileRef: MEDIUM_LOCK.physicsBodyProfileRef,
  activeLocomotionProfileRef: MEDIUM_LOCK.locomotionProfileRef,
  activeMotionProfileRef: MEDIUM_LOCK.motionProfileRef,
  activeMotionKernelRef: MEDIUM_LOCK.motionKernelRef,
  activeControlFeelProfileRef: MEDIUM_LOCK.controlFeelProfileRef,
  activeControlProfileRef: MEDIUM_LOCK.controlProfileRef,
  activeMediumProfileRef: MEDIUM_LOCK.mediumProfileRef,
  isJumpAllowed: false,
};

describe("resolveCharacterStateV1", () => {
  it("maps unsupported to air and does not publish water", () => {
    const result = resolveCharacterStateV1({
      previousState: undefined,
      supportSample: {
        supportState: "unsupported",
        supportNormalWorldXYZ: [0, 1, 0],
      },
      locked: MEDIUM_LOCK,
      requested: { moveRequested: false, runRequested: false },
      coyoteRemainingSeconds: 0,
    });
    expect(result.state.movementMedium).toBe("air");
    expect(result.state.locomotionMode).toBe("airborne");
    expect(result.state.isJumpAllowed).toBe(false);
  });

  it("maps sliding to ground but does not arm jump or coyote", () => {
    const result = resolveCharacterStateV1({
      previousState: GROUND_IDLE,
      supportSample: {
        supportState: "sliding",
        supportNormalWorldXYZ: [0.4, 0.9, 0],
      },
      locked: { ...MEDIUM_LOCK, allowJump: true },
      requested: { moveRequested: true, runRequested: false },
      coyoteRemainingSeconds: 0,
    });
    expect(result.state.movementMedium).toBe("ground");
    expect(result.state.locomotionMode).toBe("walk");
    expect(result.state.isJumpAllowed).toBe(false);
  });

  it("allows jump only on supported plus allowJump or remaining coyote", () => {
    expect(
      resolveCharacterStateV1({
        previousState: GROUND_IDLE,
        supportSample: { supportState: "supported", supportNormalWorldXYZ: [0, 1, 0] },
        locked: { ...MEDIUM_LOCK, allowJump: true },
        requested: { moveRequested: false, runRequested: false },
        coyoteRemainingSeconds: 0,
      }).state.isJumpAllowed,
    ).toBe(true);
    expect(
      resolveCharacterStateV1({
        previousState: GROUND_IDLE,
        supportSample: { supportState: "unsupported", supportNormalWorldXYZ: [0, 1, 0] },
        locked: { ...MEDIUM_LOCK, allowJump: true, coyoteTimeSeconds: 0.1 },
        requested: { moveRequested: false, runRequested: false },
        coyoteRemainingSeconds: 0.05,
      }).state.isJumpAllowed,
    ).toBe(true);
  });

  it("keeps the previous combination when a locked ref is missing", () => {
    const result = resolveCharacterStateV1({
      previousState: GROUND_IDLE,
      supportSample: { supportState: "supported", supportNormalWorldXYZ: [0, 1, 0] },
      locked: { ...MEDIUM_LOCK, controlFeelProfileRef: "" },
      requested: { moveRequested: false, runRequested: false },
      coyoteRemainingSeconds: 0,
    });
    expect(result.state).toEqual(GROUND_IDLE);
    expect(result.diagnosticCode).toBe("SUBJECT_STATE_RESOLVE_UNCHANGED");
  });

  it("fails when support sample is missing", () => {
    const result = resolveCharacterStateV1({
      previousState: GROUND_IDLE,
      supportSample: undefined,
      locked: MEDIUM_LOCK,
      requested: { moveRequested: false, runRequested: false },
      coyoteRemainingSeconds: 0,
    });
    expect(result.diagnosticCode).toBe("SUBJECT_SUPPORT_QUERY_MISSING");
  });

  it("throws on cold start when a locked ref is missing", () => {
    expect(() =>
      resolveCharacterStateV1({
        previousState: undefined,
        supportSample: { supportState: "supported", supportNormalWorldXYZ: [0, 1, 0] },
        locked: { ...MEDIUM_LOCK, controlFeelProfileRef: "" },
        requested: { moveRequested: false, runRequested: false },
        coyoteRemainingSeconds: 0,
      }),
    ).toThrow(/^SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED:/);
  });

  it("throws on cold start when support sample is missing", () => {
    expect(() =>
      resolveCharacterStateV1({
        previousState: undefined,
        supportSample: undefined,
        locked: MEDIUM_LOCK,
        requested: { moveRequested: false, runRequested: false },
        coyoteRemainingSeconds: 0,
      }),
    ).toThrow(/^SUBJECT_SUPPORT_QUERY_MISSING:/);
  });
});
