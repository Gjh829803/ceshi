export const PLAYTHROUGH_SEGMENT_COUNT: 6;
export const PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES: readonly [0, 1, 2, 3, 4, 5];
export const PLAYTHROUGH_EVENT_SEGMENT_INDICES: readonly [0, 2, 4];
export const PLAYTHROUGH_SEGMENT_DELIVERY_SECONDS: 30;
export const PLAYTHROUGH_CAMERA_RESET_BUFFER_SECONDS: 0;
export const PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS: 30;
export const PLAYTHROUGH_DELIVERY_DURATION_SECONDS: 180;
export const PLAYTHROUGH_EXECUTION_DURATION_SECONDS: 180;
export const PLAYTHROUGH_DURATION_SECONDS: 180;
export const PLAYTHROUGH_TICK_RATE: 60;
export const PLAYTHROUGH_CAPTURE_FPS: 24;
export const PLAYTHROUGH_FRAME_COUNT: 4320;
export const PLAYTHROUGH_EXECUTION_FRAME_COUNT: 4320;
export const PLAYTHROUGH_SEGMENT_SECONDS: 30;
export const PLAYTHROUGH_SEGMENT_FRAME_COUNT: 720;
export const PLAYTHROUGH_EVENT_COUNT: 5;
export const PLAYTHROUGH_CAMERA_RESET_WINDOWS: readonly Readonly<{
  segmentIndex: number;
  startSeconds: number;
  endSeconds: number;
}>[];
export const PLAYTHROUGH_PROMPT_WINDOWS: readonly Readonly<{
  windowIndex: number;
  segmentIndex: number;
  eventIndexInSegment: number;
  segmentId: string;
  startSeconds: number;
  endSeconds: number;
  relativeSeconds: number;
}>[];
export const PLAYTHROUGH_HOST_EVENT_SLOTS: readonly Readonly<{
  id: string;
  windowIndex: number;
  segmentId: string;
  globalSeconds: number;
  segmentRelativeSeconds: number;
}>[];
export const VISUAL_EVENT_ACTION_INDEPENDENCE: string;

export interface PlaythroughPromptEventV1 {
  id: string;
  windowIndex: number;
  globalSeconds: number;
  segmentId: string;
  segmentRelativeSeconds: number;
  targetNames: string[];
  eventClass: "subject-transformation" | "ability-manifestation" | "environment-transformation" | "atmospheric-spectacle";
  magnitude: "large-scale";
  frameImpact: {
    scope: "subject-dominant" | "environment-dominant" | "sky-dominant";
    coverage: "large";
    contrast: "dramatic";
  };
  dominantChange: string;
  targetContext: string;
  beforeState: string;
  transitionDescription: string;
  afterState: string;
  actionCoupling: string;
  spatialContinuity: string;
  audioDescription: string;
  negativeConstraints: string;
  timing: {
    transitionDurationSeconds: number;
    ending: "hold" | "fade" | "settle";
    endingDurationSeconds: number;
  };
  eventPrompt: string;
}

export interface PlaythroughPlanV3 {
  kind: "worldkit-playthrough-plan";
  schemaVersion: 3;
  id: string;
  sceneId: string;
  seed: number;
  deliveryDurationSeconds: 180;
  executionDurationSeconds: 180;
  segmentCount: 6;
  segmentDeliverySeconds: 30;
  segmentExecutionSeconds: 30;
  cameraResetBufferSeconds: 0;
  simulationTickRate: 60;
  captureFrameRate: 24;
  frameCount: 4320;
  executionFrameCount: 4320;
  controlledEntityId: string;
  worldPackageRootHash: string;
  navigationEvidenceHash: `sha256:${string}`;
  motionRenderingGuidance: string;
  segmentPlans: Array<{
    segmentId: string;
    executionStartSeconds: number;
    deliveryDurationSeconds: 30;
    cameraResetBufferSeconds: 0;
    initialPositionMetersXYZ: [number, number, number];
    initialFacingYawRadians: number;
    destinationId: string;
    destinationPositionMetersXYZ: [number, number, number];
    arrivalRadiusMeters: number;
    expectedArrivalSeconds: number;
    routeBandIds: string[];
    routeWaypointsMetersXYZ: Array<[number, number, number]>;
    coverageTargetIds: string[];
    purpose: string;
  }>;
  inputIntervals: Array<{
    id: string;
    startSeconds: number;
    endSeconds: number;
    rawKeys: Array<"W" | "A" | "S" | "D" | "Shift" | "Space">;
    semanticActions: string[];
    purpose: string;
  }>;
  cameraEvents: Array<{
    id: string;
    atSeconds: number;
    yawDeltaRadians: number;
    pitchDeltaRadians: number;
    purpose: string;
  }>;
}

export interface EpisodeVisualEventPlanV1 {
  kind: "worldkit-episode-visual-events";
  schemaVersion: 1;
  sceneId: string;
  episodeId: string;
  model: string;
  events: PlaythroughPromptEventV1[];
}

export interface PlaythroughFrameTelemetryV1 {
  kind: "worldkit-episode-frame-telemetry";
  schemaVersion: 1;
  samplingMode: "nearest-runtime-sample";
  captureFrameRate: number;
  frameCount: number;
  widthPixels: number;
  heightPixels: number;
  durationSeconds: number;
  coordinateSystems: Record<string, unknown>;
  samples: Array<Record<string, unknown>>;
}

export function renderSeedancePromptEvent(event: PlaythroughPromptEventV1): string;
export function validatePlaythroughPlan(
  value: unknown,
  expected?: { sceneId?: string; navigationEvidence?: unknown },
):
  | { ok: true; value: PlaythroughPlanV3; diagnostics: [] }
  | { ok: false; diagnostics: Array<{ code: string; path: string; message: string }> };
export function validateVisualEventPlan(
  value: unknown,
  expected?: { sceneId?: string; episodeId?: string },
):
  | { ok: true; value: EpisodeVisualEventPlanV1; diagnostics: [] }
  | { ok: false; diagnostics: Array<{ code: string; path: string; message: string }> };
export function buildPlaythroughFrameTelemetry(
  rawSamples: unknown[],
  options?: {
    captureFrameRate?: number;
    frameCount?: number;
    widthPixels?: number;
    heightPixels?: number;
  },
): PlaythroughFrameTelemetryV1;
export function validatePlaythroughFrameTelemetry(value: unknown):
  | { ok: true; value: PlaythroughFrameTelemetryV1; diagnostics: [] }
  | { ok: false; diagnostics: Array<{ code: string; path: string; message: string }> };
export function validatePlaythroughExecutionQuality(input: {
  telemetrySamples?: unknown[];
  routeReports?: unknown[];
  events?: unknown[];
  consoleErrors?: unknown[];
  plan?: unknown;
  navigationEvidence?: unknown;
}):
  | { ok: true; diagnostics: []; metrics: Record<string, number> }
  | {
      ok: false;
      diagnostics: Array<{ code: string; path: string; message: string }>;
      metrics: Record<string, number>;
    };
export function stableJson(value: unknown): string;
export function sha256Canonical(value: unknown): `sha256:${string}`;
export function writeJsonAtomic(filePath: string, value: unknown): Promise<void>;
export function executionSegmentStartSeconds(segmentIndex: number): number;
export function executionSegmentForSeconds(seconds: number): number;
export function deliveryFrameExecutionTimeSeconds(frameIndex: number): number;
