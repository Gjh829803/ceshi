export type CharacterSupportStateV1 = "supported" | "sliding" | "unsupported";

export interface CharacterSupportSampleV1 {
  supportState: CharacterSupportStateV1;
  supportNormalWorldXYZ: readonly [number, number, number];
}

export interface SubjectResolvedStateV1 {
  movementMedium: "ground" | "air";
  locomotionMode: "idle" | "walk" | "run" | "airborne";
  activePhysicsBodyProfileRef: string;
  activeLocomotionProfileRef: string;
  activeMotionProfileRef: string;
  activeMotionKernelRef: string;
  activeControlFeelProfileRef: string;
  activeControlProfileRef: string;
  activeMediumProfileRef: string;
  isJumpAllowed: boolean;
}

export interface ResolveCharacterStateInputV1 {
  previousState: SubjectResolvedStateV1 | undefined;
  supportSample: CharacterSupportSampleV1 | undefined;
  locked: {
    physicsBodyProfileRef: string;
    locomotionProfileRef: string;
    motionProfileRef: string;
    motionKernelRef: string;
    controlFeelProfileRef: string;
    controlProfileRef: string;
    mediumProfileRef: string;
    allowWalk: boolean;
    allowRun: boolean;
    allowJump: boolean;
    coyoteTimeSeconds: number;
  };
  requested: {
    moveRequested: boolean;
    runRequested: boolean;
  };
  coyoteRemainingSeconds: number;
}

export interface ResolveCharacterStateResultV1 {
  state: SubjectResolvedStateV1;
  diagnosticCode?: string;
}

function isNil(value: string | undefined | null): boolean {
  return value === undefined || value === null || value === "";
}

function isLockedProfileCombinationIncomplete(
  locked: ResolveCharacterStateInputV1["locked"],
): boolean {
  return (
    isNil(locked.physicsBodyProfileRef)
    || isNil(locked.locomotionProfileRef)
    || isNil(locked.motionProfileRef)
    || isNil(locked.motionKernelRef)
    || isNil(locked.controlFeelProfileRef)
    || isNil(locked.controlProfileRef)
    || isNil(locked.mediumProfileRef)
  );
}

function resolveGroundLocomotionMode(
  locked: ResolveCharacterStateInputV1["locked"],
  requested: ResolveCharacterStateInputV1["requested"],
): SubjectResolvedStateV1["locomotionMode"] {
  if (!requested.moveRequested) {
    return "idle";
  }
  if (requested.runRequested && locked.allowRun) {
    return "run";
  }
  if (requested.runRequested && !locked.allowRun && locked.allowWalk) {
    return "walk";
  }
  if (locked.allowWalk) {
    return "walk";
  }
  return "idle";
}

function resolveIsJumpAllowed(
  supportState: CharacterSupportStateV1,
  locked: ResolveCharacterStateInputV1["locked"],
  coyoteRemainingSeconds: number,
): boolean {
  if (!locked.allowJump) {
    return false;
  }
  if (supportState === "supported") {
    return true;
  }
  if (supportState === "sliding") {
    return false;
  }
  return coyoteRemainingSeconds > 0;
}

function buildActiveProfileRefs(
  locked: ResolveCharacterStateInputV1["locked"],
): Pick<
  SubjectResolvedStateV1,
  | "activePhysicsBodyProfileRef"
  | "activeLocomotionProfileRef"
  | "activeMotionProfileRef"
  | "activeMotionKernelRef"
  | "activeControlFeelProfileRef"
  | "activeControlProfileRef"
  | "activeMediumProfileRef"
> {
  return {
    activePhysicsBodyProfileRef: locked.physicsBodyProfileRef,
    activeLocomotionProfileRef: locked.locomotionProfileRef,
    activeMotionProfileRef: locked.motionProfileRef,
    activeMotionKernelRef: locked.motionKernelRef,
    activeControlFeelProfileRef: locked.controlFeelProfileRef,
    activeControlProfileRef: locked.controlProfileRef,
    activeMediumProfileRef: locked.mediumProfileRef,
  };
}

export function resolveCharacterStateV1(
  input: ResolveCharacterStateInputV1,
): ResolveCharacterStateResultV1 {
  const { previousState, supportSample, locked, requested, coyoteRemainingSeconds } = input;

  if (isLockedProfileCombinationIncomplete(locked)) {
    if (previousState === undefined) {
      throw new Error(
        "SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED: locked profile combination is incomplete.",
      );
    }
    return {
      state: previousState,
      diagnosticCode: "SUBJECT_STATE_RESOLVE_UNCHANGED",
    };
  }

  if (supportSample === undefined) {
    if (previousState === undefined) {
      throw new Error(
        "SUBJECT_SUPPORT_QUERY_MISSING: character support sample is required.",
      );
    }
    return {
      state: previousState,
      diagnosticCode: "SUBJECT_SUPPORT_QUERY_MISSING",
    };
  }

  const activeProfileRefs = buildActiveProfileRefs(locked);
  const isJumpAllowed = resolveIsJumpAllowed(
    supportSample.supportState,
    locked,
    coyoteRemainingSeconds,
  );

  if (supportSample.supportState === "unsupported") {
    return {
      state: {
        movementMedium: "air",
        locomotionMode: "airborne",
        ...activeProfileRefs,
        isJumpAllowed,
      },
    };
  }

  return {
    state: {
      movementMedium: "ground",
      locomotionMode: resolveGroundLocomotionMode(locked, requested),
      ...activeProfileRefs,
      isJumpAllowed,
    },
  };
}
