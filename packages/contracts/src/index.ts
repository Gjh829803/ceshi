export type EntityId = string;
export type FeatureId = string;
export type ResourceId = string;

export type Vec2Tuple = readonly [x: number, y: number];
export type Vec3Tuple = readonly [x: number, y: number, z: number];
export type EulerTuple = readonly [x: number, y: number, z: number];

export interface TransformSpec {
  position?: Vec3Tuple;
  rotation?: EulerTuple;
  scale?: Vec3Tuple;
}

export interface AppearanceBinding {
  semantic: string;
  prompt?: string;
  reference?: string;
  identityPersistent?: boolean;
  preserveSilhouette?: boolean;
}

export interface FrameContext {
  deltaSeconds: number;
  elapsedSeconds: number;
  tick: number;
  /** Fractional progress from the previous fixed state to the current one. */
  interpolationAlpha?: number;
}

/** Shared humanoid traversal contract used by physics and scene validation. */
export const DEFAULT_HUMANOID_TRAVERSAL = Object.freeze({
  maxSlopeClimbDegrees: 42,
  minSlopeSlideDegrees: 48,
  autostepHeight: 0.35,
  snapToGroundDistance: 0.3,
});

export interface Disposable {
  dispose(): void;
}

export interface RuntimeSystem extends Disposable {
  readonly id: string;
  fixedUpdate?(context: FrameContext): void;
  update?(context: FrameContext): void;
}

export type MovementReference = "camera" | "body" | "vehicle" | "world";

export interface MovementIntent {
  forward: number;
  right: number;
  run: boolean;
  jump: boolean;
}

export interface Diagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  featureId?: FeatureId;
  entityId?: EntityId;
  suggestions?: string[];
}

export interface ResourceBudget {
  maxVertices?: number;
  maxTriangles?: number;
  maxColliders?: number;
  maxBuildTimeMs?: number;
}
