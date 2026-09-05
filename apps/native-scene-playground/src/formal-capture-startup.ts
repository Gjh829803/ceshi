import type { BabylonWorldRuntimeInitializationStageV1 } from "@whitebox-world/runtime-babylon";

export type FormalCaptureStartupStageV1 = "package" | "module" | "admission" |
  "bridge" | `runtime-${BabylonWorldRuntimeInitializationStageV1}`;
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
) {
  let state: FormalCaptureStartupDiagnosticV1 = Object.freeze({ phase: "loading", stage: "package", revision: 0 });
  const seen = new Set<FormalCaptureStartupStageV1>(["package"]);
  publish(state);
  return Object.freeze({
    progress(stage: FormalCaptureStartupStageV1) {
      if (state.phase !== "loading" || seen.has(stage)) return;
      seen.add(stage);
      state = Object.freeze({ phase: "loading", stage, revision: state.revision + 1 });
      publish(state);
    },
    finish(phase: "ready" | "error") {
      if (state.phase !== "loading") return;
      state = Object.freeze({ ...state, phase, revision: state.revision + 1 });
      publish(state);
    },
  });
}
