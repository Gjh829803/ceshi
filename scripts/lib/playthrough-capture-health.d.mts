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
  "runtime-and-continuous-motion-health-v1";

export function validatePlaythroughCaptureHealth(input: {
  readonly telemetrySamples?: unknown[];
  readonly consoleErrors?: unknown[];
}): PlaythroughCaptureHealthResult;
