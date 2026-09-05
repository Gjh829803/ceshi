import type { BabylonWorldRuntimeInitializationStageV1 } from "./babylon-world-runtime.js";

export type FormalCaptureStartupStageV1 = "package" | "module" | "admission" |
  "bridge" | "host-resolver" | "module-import" | "viewer-source-load" |
  "runtime-create" | "visual-targets-configure" | "adapter-mount" |
  "first-render" | "page-setup" | `runtime-${BabylonWorldRuntimeInitializationStageV1}`;
export interface FormalCaptureStartupDiagnosticV1 {
  readonly phase: "loading" | "ready" | "error";
  readonly stage: FormalCaptureStartupStageV1;
  readonly revision: number;
}

declare global {
  interface Window {
    __WORLDKIT_FORMAL_CAPTURE_STARTUP__?: FormalCaptureStartupDiagnosticV1;
  }
}

/** Host-owned advisory startup signal. It is never a Runtime/Capture receipt. */
export function createFormalCaptureStartupReporterV1(
  publish: (value: FormalCaptureStartupDiagnosticV1) => void,
  initialStage: FormalCaptureStartupStageV1 = "package",
) {
  let state: FormalCaptureStartupDiagnosticV1 = Object.freeze({ phase: "loading", stage: initialStage, revision: 0 });
  publish(state);
  return Object.freeze({
    progress(stage: FormalCaptureStartupStageV1) {
      if (state.phase !== "loading") return;
      state = Object.freeze({ phase: "loading", stage, revision: state.revision + 1 });
      publish(state);
    },
    finish(phase: "ready" | "error", stage: FormalCaptureStartupStageV1 = state.stage) {
      if (state.phase !== "loading") return;
      state = Object.freeze({ phase, stage, revision: state.revision + 1 });
      publish(state);
    },
  });
}
