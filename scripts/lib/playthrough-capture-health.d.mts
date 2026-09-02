export interface PlaythroughCaptureHealthResult {
  readonly ok: boolean;
  readonly diagnostics: Array<{
    code: string;
    path: string;
    message: string;
  }>;
  readonly metrics: Record<string, number>;
}

export const PLAYTHROUGH_CAPTURE_HEALTH_POLICY:
  "runtime-and-continuous-motion-health-v2";

export function validatePlaythroughCaptureHealth(input: {
  readonly telemetrySamples?: unknown[];
  readonly consoleErrors?: unknown[];
}): PlaythroughCaptureHealthResult;

export function buildPlaythroughRepairEvidence(input: {
  readonly sceneId: string;
  readonly planHash: string;
  readonly captures: ReadonlyArray<{
    readonly telemetrySamples?: unknown[];
  }>;
  readonly segmentQualities: ReadonlyArray<{
    readonly segmentId: string;
    readonly passed: boolean;
    readonly diagnostics: PlaythroughCaptureHealthResult["diagnostics"];
    readonly metrics: Record<string, number>;
  }>;
}): unknown;
