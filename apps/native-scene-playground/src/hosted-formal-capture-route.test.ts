import { describe, expect, it, vi } from "vitest";
import { hashFormalWorldCaptureRequestV1 } from
  "@whitebox-world/runtime-contracts";

import { formalCaptureRequestFixtureV1 } from
  "@whitebox-world/runtime-babylon/testing";
import {
  createFormalCaptureCandidateCanvasV1,
  createObservedFormalCaptureEntryPortV1,
  readHostedFormalCaptureRouteIdentityV1,
} from
  "./hosted-formal-capture-route.js";

const request = formalCaptureRequestFixtureV1();
const hash = hashFormalWorldCaptureRequestV1(request);

function routeSearch(mode: "shell" | "frame"): string {
  const query = new URLSearchParams({
    [mode === "shell"
      ? "hosted-formal-capture"
      : "hosted-formal-capture-frame"]: "1",
    runtimeSessionId: "runtime.formal-capture.route.001",
    sessionNonce: "nonce.formal-capture.route.001",
    formalRequestId: request.id,
    formalRequestHash: hash,
  });
  return `?${query.toString()}`;
}

describe("capture-only Hosted route identity", () => {
  it.each(["completed", "rejected", "diagnostic-unavailable"])("CF-05 observes on-demand Capture without changing %s or adding a runtime loop", async (outcome) => {
    let tick = 0;
    let time = 0;
    let heartbeat!: () => void;
    const target: Pick<Window, "performance" | "setInterval" | "clearInterval" | "__WORLDKIT_RUNTIME_DIAGNOSTICS__"> = {
      performance: { now: () => time } as Performance,
      setInterval: vi.fn((callback: TimerHandler, milliseconds?: number) => {
        expect(milliseconds).toBe(1000); heartbeat = callback as () => void; return 1;
      }), clearInterval: vi.fn(),
    };
    if (outcome === "diagnostic-unavailable") Object.defineProperty(target, "__WORLDKIT_RUNTIME_DIAGNOSTICS__", {
      set() { throw new Error("diagnostic installation unavailable"); },
    });
    const payload = { verifiedPayload: true };
    const original = new Error("private-provider-capture-failure");
    const disposeFailure = new Error("private-dispose-failure");
    const entry = {
      initialSnapshot: vi.fn(() => ({ worldSessionId: "private-native-session",
        world: { simulationTick: tick }, runtime: { phase: "ready", isPaused: false } }) as never),
      executeFormalCapture: vi.fn(async () => {
        tick = 3;
        if (outcome === "rejected") throw original;
        return payload as never;
      }),
      dispose: vi.fn(async () => { if (outcome === "rejected") throw disposeFailure; }),
    };
    const port = createObservedFormalCaptureEntryPortV1(entry, { target, visibilityState: () => "visible",
      diagnosticSessionId: "00000000-0000-4000-8000-000000000001" });
    for (let i = 0; i < 5; i++) { time += 1000; heartbeat(); }
    if (outcome === "diagnostic-unavailable") expect(entry.initialSnapshot).not.toHaveBeenCalled();
    if (outcome !== "diagnostic-unavailable") {
      expect(target.__WORLDKIT_RUNTIME_DIAGNOSTICS__!.report().samples.at(-1)).toMatchObject({
        health: "healthy", metrics: { frame: null, tick: 0, fps: null, triangleCount: null,
          drawCallCount: null, progressMode: "on-demand" },
      });
    }
    if (outcome === "rejected") await expect(port.executeFormalCapture(request)).rejects.toBe(original);
    else await expect(port.executeFormalCapture(request)).resolves.toBe(payload);
    expect(entry.executeFormalCapture).toHaveBeenCalledExactlyOnceWith(request);
    if (outcome !== "diagnostic-unavailable") {
      const report = target.__WORLDKIT_RUNTIME_DIAGNOSTICS__!.report();
      expect(report.samples.at(-1)).toMatchObject({ health: outcome === "rejected" ? "runtime-failed" : "healthy",
        metrics: { tick: 3 } });
      expect(JSON.stringify(report)).not.toMatch(/private-native-session|private-provider|private-dispose/);
    }
    if (outcome === "rejected") await expect(port.dispose()).rejects.toBe(disposeFailure);
    else await port.dispose();
    expect(entry.dispose).toHaveBeenCalledOnce();
    expect(target.clearInterval).toHaveBeenCalledExactlyOnceWith(1);
    expect(target.__WORLDKIT_RUNTIME_DIAGNOSTICS__).toBeUndefined();
  });
  it("allocates and activates one independent canvas for every Candidate", () => {
    const first = {
      setAttribute: vi.fn(),
    } as unknown as HTMLCanvasElement;
    const second = {
      setAttribute: vi.fn(),
    } as unknown as HTMLCanvasElement;
    const createElement = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const replaceChildren = vi.fn();
    const viewport = {
      ownerDocument: { createElement },
      replaceChildren,
    } as unknown as HTMLElement;

    expect(createFormalCaptureCandidateCanvasV1(viewport)).toBe(first);
    expect(createFormalCaptureCandidateCanvasV1(viewport)).toBe(second);
    expect(createElement).toHaveBeenNthCalledWith(1, "canvas");
    expect(createElement).toHaveBeenNthCalledWith(2, "canvas");
    expect(replaceChildren).toHaveBeenNthCalledWith(1, first);
    expect(replaceChildren).toHaveBeenNthCalledWith(2, second);
  });

  it.each(["shell", "frame"] as const)(
    "accepts one exact %s mode",
    (mode) => {
      expect(readHostedFormalCaptureRouteIdentityV1(
        routeSearch(mode),
        mode,
      )).toEqual({
        runtimeSessionId: "runtime.formal-capture.route.001",
        sessionNonce: "nonce.formal-capture.route.001",
        formalRequestId: request.id,
        formalRequestHash: hash,
      });
    },
  );

  it.each([
    ["wrong mode value", routeSearch("shell").replace(
      "hosted-formal-capture=1",
      "hosted-formal-capture=0",
    )],
    ["both modes", `${routeSearch("shell")}&hosted-formal-capture-frame=1`],
    ["duplicate identity", `${routeSearch("shell")}&sessionNonce=again`],
    ["unexpected parameter", `${routeSearch("shell")}&hosted=1`],
  ])("rejects %s", (_label, search) => {
    expect(() => readHostedFormalCaptureRouteIdentityV1(search, "shell"))
      .toThrow("ROUTE_PARAMETERS_INVALID");
  });
});
