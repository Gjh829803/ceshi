import type { ExecutionMotionProfileV1 } from "@whitebox-world/runtime-contracts";

export type MotionModeFailureCodeV1 =
  | "MOTION_PARAMETER_INVALID"
  | "MOTION_NON_FINITE_STATE";

export interface MotionModeSnapshotV1 {
  activeProfile: ExecutionMotionProfileV1;
  fallbackActive: boolean;
  lastFailureCode?: MotionModeFailureCodeV1;
}

export class MotionModeResolverV1 {
  private readonly profilesByRef: ReadonlyMap<string, ExecutionMotionProfileV1>;
  private active: ExecutionMotionProfileV1;
  private pendingProfileRef: string | undefined;
  private fallbackActive = false;
  private lastFailureCode: MotionModeFailureCodeV1 | undefined;

  constructor(
    private readonly defaultProfile: ExecutionMotionProfileV1,
    private readonly fallbackProfile: ExecutionMotionProfileV1,
    profiles: readonly ExecutionMotionProfileV1[],
    private readonly isProfileValid: (profile: ExecutionMotionProfileV1) => boolean,
  ) {
    this.profilesByRef = new Map(
      [defaultProfile, ...profiles, fallbackProfile].map((profile) => [
        profile.resourceRef,
        profile,
      ]),
    );
    this.active = defaultProfile;
    if (!this.isProfileValid(defaultProfile)) {
      this.activateFallback("MOTION_PARAMETER_INVALID");
    }
  }

  request(profileRef: string): boolean {
    if (!this.profilesByRef.has(profileRef)) return false;
    this.pendingProfileRef = profileRef;
    return true;
  }

  commitTickBoundary(): boolean {
    const pending = this.pendingProfileRef;
    this.pendingProfileRef = undefined;
    if (pending === undefined) return false;
    const profile = this.profilesByRef.get(pending);
    if (profile === undefined || !this.isProfileValid(profile)) {
      return this.activateFallback("MOTION_PARAMETER_INVALID");
    }
    const changed = profile.resourceRef !== this.active.resourceRef;
    this.active = profile;
    this.fallbackActive = profile.resourceRef === this.fallbackProfile.resourceRef;
    this.lastFailureCode = undefined;
    return changed;
  }

  activateFallback(code: MotionModeFailureCodeV1): boolean {
    const changed = this.active.resourceRef !== this.fallbackProfile.resourceRef;
    if (this.isProfileValid(this.fallbackProfile)) {
      this.active = this.fallbackProfile;
    }
    this.fallbackActive = true;
    this.lastFailureCode = code;
    this.pendingProfileRef = undefined;
    return changed;
  }

  reset(): void {
    this.active = this.defaultProfile;
    this.pendingProfileRef = undefined;
    this.fallbackActive = false;
    this.lastFailureCode = undefined;
    if (!this.isProfileValid(this.defaultProfile)) {
      this.activateFallback("MOTION_PARAMETER_INVALID");
    }
  }

  get currentProfile(): ExecutionMotionProfileV1 {
    return this.active;
  }

  get requestedProfileRef(): string {
    return this.pendingProfileRef ?? this.active.resourceRef;
  }

  snapshot(): MotionModeSnapshotV1 {
    return {
      activeProfile: this.active,
      fallbackActive: this.fallbackActive,
      ...(this.lastFailureCode === undefined
        ? {}
        : { lastFailureCode: this.lastFailureCode }),
    };
  }
}
