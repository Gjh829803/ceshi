import { describe, expect, it } from "vitest";

import {
  initialCaptureStartupWatchdogV1,
  isTransientCaptureNavigationError,
  observeCaptureStartupV1,
} from "./worldkit-capture-startup";

describe("WorldKit capture startup watchdog", () => {
  it("keeps a slow Runtime alive while startup stages continue advancing", () => {
    let state = initialCaptureStartupWatchdogV1(0);
    for (const [now, revision, stage] of [
      [30_000, 1, "runtime:havok"],
      [60_000, 2, "runtime:terrain"],
      [90_000, 3, "runtime:subjects"],
    ] as const) {
      const decision = observeCaptureStartupV1(state, {
        hasBrowserApi: true,
        phase: "loading",
        revision,
        stage,
      }, now);
      expect(decision.status).toBe("waiting");
      state = decision.state;
    }
    expect(observeCaptureStartupV1(state, {
      hasBrowserApi: true,
      phase: "ready",
      revision: 4,
      stage: "page-setup",
    }, 100_000).status).toBe("ready");
  });

  it("fails a genuinely stalled stage and reports the exact phase", () => {
    let state = initialCaptureStartupWatchdogV1(0);
    state = observeCaptureStartupV1(state, {
      hasBrowserApi: false,
      phase: "loading",
      revision: 1,
      stage: "runtime:havok",
    }, 1_000).state;
    const decision = observeCaptureStartupV1(state, {
      hasBrowserApi: false,
      phase: "loading",
      revision: 1,
      stage: "runtime:havok",
    }, 46_001);
    expect(decision.status).toBe("stalled");
    expect(decision.message).toContain("runtime:havok");
  });

  it("classifies navigation destruction as retryable without hiding Runtime errors", () => {
    expect(isTransientCaptureNavigationError(
      new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation"),
    )).toBe(true);
    expect(isTransientCaptureNavigationError(new Error("Havok initialization failed"))).toBe(false);
  });
});
