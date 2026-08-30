export const PLAYTHROUGH_DURATION_SECONDS: 90;
export const PLAYTHROUGH_TICK_RATE: 60;
export const PLAYTHROUGH_CAPTURE_FPS: 24;
export const PLAYTHROUGH_FRAME_COUNT: 2160;
export const PLAYTHROUGH_SEGMENT_SECONDS: 30;
export const PLAYTHROUGH_SEGMENT_FRAME_COUNT: 720;
export const PLAYTHROUGH_PROMPT_WINDOWS: readonly Readonly<{
  windowIndex: number;
  startSeconds: number;
  endSeconds: number;
}>[];

export interface PlaythroughPromptEventV1 {
  id: string;
  windowIndex: number;
  globalSeconds: number;
  segmentId: string;
  segmentRelativeSeconds: number;
  targetNames: string[];
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

export interface PlaythroughPlanV1 {
  kind: "worldkit-playthrough-plan";
  schemaVersion: 1;
  id: string;
  sceneId: string;
  seed: number;
  durationSeconds: 90;
  simulationTickRate: 60;
  captureFrameRate: 24;
  frameCount: 2160;
  controlledEntityId: string;
  worldPackageRootHash: string;
  explorationTargets: Array<{ id: string; description: string; priority: "required" | "opportunistic" }>;
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
  seedancePromptEvents: PlaythroughPromptEventV1[];
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
  expected?: { sceneId?: string },
):
  | { ok: true; value: PlaythroughPlanV1; diagnostics: [] }
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
export function stableJson(value: unknown): string;
export function sha256Canonical(value: unknown): `sha256:${string}`;
export function writeJsonAtomic(filePath: string, value: unknown): Promise<void>;
