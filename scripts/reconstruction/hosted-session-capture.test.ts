import { describe, expect, it, vi } from "vitest";
import { CaptureStartupErrorV1 } from "./capture-startup-watchdog.js";
import type { RuntimeFlightReportV1 } from "@whitebox-world/runtime-babylon";
import {
  FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1,
  hashFormalWorldCaptureRequestV1,
  type FormalWorldCaptureSdkOwnerIdentityV1,
} from "@whitebox-world/runtime-contracts";

import {
  CaptureOnlyHostedExecutionContextDestroyedErrorV1,
  createCaptureOnlyHostedTransportStarterV1,
  runCaptureOnlyHostedSessionV1,
  startCaptureOnlyHostedTransportV1,
  type CaptureOnlyHostedTransportV1,
} from "./hosted-session-capture.js";
import {
  formalCaptureRequestFixtureV1,
  formalHostedPayloadFixtureV1,
} from "@whitebox-world/runtime-babylon/testing";

class FakeEmitter {
  readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(name: string, listener: (...args: unknown[]) => void): this {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
    return this;
  }

  off(name: string, listener: (...args: unknown[]) => void): this {
    this.listeners.get(name)?.delete(listener);
    return this;
  }

  emit(name: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(name) ?? []) listener(...args);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function concreteHarness(options: Readonly<{
  readyFailure?: Error;
  readyPending?: boolean;
  captureFailure?: Error;
  capturePending?: boolean;
  launchFailure?: Error;
  contextFailure?: Error;
  pageFailure?: Error;
  closeFailure?: "page" | "context" | "browser" | "server";
}> = {}) {
  const events: string[] = [];
  const serverExit = deferred<number | null>();
  const browser = new FakeEmitter() as FakeEmitter & Record<string, unknown>;
  const page = new FakeEmitter() as FakeEmitter & Record<string, unknown>;
  const context = {
    async newPage() {
      events.push("page.create");
      if (options.pageFailure !== undefined) throw options.pageFailure;
      return page;
    },
    async close() {
      events.push("context.close");
      if (options.closeFailure === "context") throw new Error("context close");
    },
  };
  Object.assign(browser, {
    async newContext() {
      events.push("context.create");
      if (options.contextFailure !== undefined) throw options.contextFailure;
      return context;
    },
    async close() {
      events.push("browser.close");
      if (options.closeFailure === "browser") throw new Error("browser close");
    },
  });
  const request = formalCaptureRequestFixtureV1();
  const implementationRefByOwnerId = {
    action: "worldkit://sdk-owner/subject-actions@1",
    camera: "worldkit://sdk-owner/camera@1",
    input: "worldkit://sdk-owner/control-capture@1",
    physics: "worldkit://sdk-owner/character-movement@1",
    subject: "worldkit://sdk-owner/subject-contracts@1",
  } as const;
  const sdkOwnerIdentities = Object.freeze(
    FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1.map((ownerId, index) =>
      Object.freeze({
        ownerId,
        implementationRef: implementationRefByOwnerId[ownerId],
        implementationHash:
          `sha256:${String(index + 1).repeat(64)}` as const,
      })) satisfies readonly FormalWorldCaptureSdkOwnerIdentityV1[],
  );
  const runtimeSessionId = "runtime.formal-capture.capture-transport.001";
  Object.assign(page, {
    mainFrame: () => ({ id: "main-frame" }),
    async goto(url: string) {
      events.push(`page.goto:${url}`);
    },
    frames: () => [],
    async evaluate(_callback: unknown, argument?: Readonly<{ request: unknown }>) {
      if (argument === undefined) {
        events.push("page.ready");
        if (options.readyFailure !== undefined) throw options.readyFailure;
        if (options.readyPending === true) await new Promise(() => undefined);
        return "ready";
      }
      events.push("page.capture");
      if (options.captureFailure !== undefined) throw options.captureFailure;
      if (options.capturePending === true) await new Promise(() => undefined);
      return formalHostedPayloadFixtureV1({
        request: argument.request as typeof request,
        runtimeSessionId,
      });
    },
    async close() {
      events.push("page.close");
      if (options.closeFailure === "page") throw new Error("page close");
    },
  });
  const server = {
    url: "http://127.0.0.1:5174/?hosted=1",
    port: 5174,
    sceneSourceKind: "babylon-native-scene" as const,
    worldPackageRootHash: request.worldPackageRootHash,
    waitForExit: () => serverExit.promise,
    async stop() {
      events.push("server.stop");
      serverExit.resolve(null);
      if (options.closeFailure === "server") throw new Error("server stop");
    },
  };
  const ports = {
    randomUUID: vi.fn()
      .mockReturnValueOnce("capture-transport.001")
      .mockReturnValueOnce("capture-transport-nonce-001"),
    resolveSdkOwnerIdentities: vi.fn(async () => sdkOwnerIdentities),
    startServer: vi.fn(async () => server),
    launchBrowser: vi.fn(async () => {
      events.push("browser.launch");
      if (options.launchFailure !== undefined) throw options.launchFailure;
      return browser;
    }),
  };
  return {
    request,
    runtimeSessionId,
    sdkOwnerIdentities,
    events,
    serverExit,
    server,
    browser,
    page,
    ports,
  };
}

describe("capture-only Hosted session transaction", () => {
  it("executes one formal Capture request and waits for transport cleanup", async () => {
    const events: string[] = [];
    const payload = Object.freeze({ id: "payload.001" });
    const transport: CaptureOnlyHostedTransportV1<typeof payload> = {
      executeFormalCapture: vi.fn(async () => {
        events.push("capture");
        return payload;
      }),
      dispose: vi.fn(async () => {
        events.push("cleanup");
        return {
          hostedBrowserSession: "completed" as const,
          viteServer: "completed" as const,
        };
      }),
    };

    await expect(runCaptureOnlyHostedSessionV1({
      request: Object.freeze({ id: "request.001" }),
      startTransport: async () => {
        events.push("start");
        return transport;
      },
    })).resolves.toBe(payload);

    expect(events).toEqual(["start", "capture", "cleanup"]);
    expect(transport.executeFormalCapture).toHaveBeenCalledOnce();
    expect(transport.dispose).toHaveBeenCalledOnce();
  });

  it("cleans up after Capture rejection and preserves the Capture failure", async () => {
    const captureFailure = new Error("capture failed");
    const dispose = vi.fn(async () => ({
      hostedBrowserSession: "completed" as const,
      viteServer: "completed" as const,
    }));

    await expect(runCaptureOnlyHostedSessionV1({
      request: Object.freeze({ id: "request.002" }),
      startTransport: async () => ({
        executeFormalCapture: async () => {
          throw captureFailure;
        },
        dispose,
      }),
    })).rejects.toMatchObject({
      name: "CaptureOnlyHostedSessionClosedErrorV1",
      cleanupOutcomes: {
        hostedBrowserSession: "completed",
        viteServer: "completed",
      },
      cause: captureFailure,
    });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("rejects a successful Capture when complete Hosted cleanup fails", async () => {
    const cleanupFailure = new Error("browser/server/session cleanup failed");

    await expect(runCaptureOnlyHostedSessionV1({
      request: Object.freeze({ id: "request.003" }),
      startTransport: async () => ({
        executeFormalCapture: async () => Object.freeze({ id: "payload.003" }),
        dispose: async () => {
          throw cleanupFailure;
        },
      }),
    })).rejects.toMatchObject({
      name: "CaptureOnlyHostedSessionClosedErrorV1",
      cleanupOutcomes: {
        hostedBrowserSession: "failed",
        viteServer: "failed",
      },
      cause: cleanupFailure,
    });
  });

  it("retains the primary Capture failure when cleanup also fails", async () => {
    const captureFailure = new Error("capture failed first");

    await expect(runCaptureOnlyHostedSessionV1({
      request: Object.freeze({ id: "request.004" }),
      startTransport: async () => ({
        executeFormalCapture: async () => {
          throw captureFailure;
        },
        dispose: async () => {
          throw new Error("cleanup also failed");
        },
      }),
    })).rejects.toMatchObject({
      name: "CaptureOnlyHostedSessionClosedErrorV1",
      cleanupOutcomes: {
        hostedBrowserSession: "failed",
        viteServer: "failed",
      },
      cause: captureFailure,
    });
  });

  it("retries one admitted Capture after the typed execution-context-destroyed failure", async () => {
    const events: string[] = [];
    const request = Object.freeze({ id: "request.retry.001" });
    const payload = Object.freeze({ id: "payload.retry.001" });
    let attempt = 0;
    const startTransport = vi.fn(async () => {
      attempt += 1;
      const currentAttempt = attempt;
      events.push(`start.${currentAttempt}`);
      return {
        executeFormalCapture: async (received: typeof request) => {
          events.push(`capture.${currentAttempt}`);
          expect(received).toBe(request);
          if (currentAttempt === 1) {
            throw new CaptureOnlyHostedExecutionContextDestroyedErrorV1(
              new Error(
                "page.evaluate: Execution context was destroyed, most likely because of a navigation",
              ),
            );
          }
          return payload;
        },
        dispose: async () => {
          events.push(`cleanup.${currentAttempt}`);
          return {
            hostedBrowserSession: "completed" as const,
            viteServer: "completed" as const,
          };
        },
      };
    });

    await expect(runCaptureOnlyHostedSessionV1({
      request,
      startTransport,
    })).resolves.toBe(payload);
    expect(startTransport).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      "start.1",
      "capture.1",
      "cleanup.1",
      "start.2",
      "capture.2",
      "cleanup.2",
    ]);
  });

  it.each([
    new Error(
      "page.evaluate: Execution context was destroyed, most likely because of a navigation",
    ),
    new Error("WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_REQUEST_IDENTITY_MISMATCH"),
    new Error("FORMAL_CAPTURE_OPENING_COMPOSITION_GATE_FAILED"),
  ])("never retries an untyped, identity, or semantic Capture failure", async (
    failure,
  ) => {
    const startTransport = vi.fn(async () => ({
      executeFormalCapture: async () => {
        throw failure;
      },
      dispose: async () => ({
        hostedBrowserSession: "completed" as const,
        viteServer: "completed" as const,
      }),
    }));

    await expect(runCaptureOnlyHostedSessionV1({
      request: Object.freeze({ id: "request.no-retry.001" }),
      startTransport,
    })).rejects.toMatchObject({ cause: failure });
    expect(startTransport).toHaveBeenCalledOnce();
  });

  it("never retries a transport-start failure even when it carries the transient code", async () => {
    const failure = new CaptureOnlyHostedExecutionContextDestroyedErrorV1(
      new Error("page.goto: Execution context was destroyed"),
    );
    const startTransport = vi.fn(async () => {
      throw failure;
    });

    await expect(runCaptureOnlyHostedSessionV1({
      request: Object.freeze({ id: "request.start-failed.001" }),
      startTransport,
    })).rejects.toMatchObject({ cause: failure });
    expect(startTransport).toHaveBeenCalledOnce();
  });

  it("retries at most once when the replacement Capture loses its context too", async () => {
    const startTransport = vi.fn(async () => ({
      executeFormalCapture: async () => {
        throw new CaptureOnlyHostedExecutionContextDestroyedErrorV1(
          new Error("page.evaluate: Execution context was destroyed"),
        );
      },
      dispose: async () => ({
        hostedBrowserSession: "completed" as const,
        viteServer: "completed" as const,
      }),
    }));

    await expect(runCaptureOnlyHostedSessionV1({
      request: Object.freeze({ id: "request.retry-limit.001" }),
      startTransport,
    })).rejects.toMatchObject({
      name: "CaptureOnlyHostedSessionClosedErrorV1",
      cause: {
        name: "CaptureOnlyHostedExecutionContextDestroyedErrorV1",
      },
    });
    expect(startTransport).toHaveBeenCalledTimes(2);
  });

  it("does not retry when cleanup after the transient Capture failure is incomplete", async () => {
    const startTransport = vi.fn(async () => ({
      executeFormalCapture: async () => {
        throw new CaptureOnlyHostedExecutionContextDestroyedErrorV1(
          new Error("page.evaluate: Execution context was destroyed"),
        );
      },
      dispose: async () => ({
        hostedBrowserSession: "failed" as const,
        viteServer: "completed" as const,
      }),
    }));

    await expect(runCaptureOnlyHostedSessionV1({
      request: Object.freeze({ id: "request.cleanup-failed.001" }),
      startTransport,
    })).rejects.toMatchObject({
      cleanupOutcomes: {
        hostedBrowserSession: "failed",
        viteServer: "completed",
      },
    });
    expect(startTransport).toHaveBeenCalledOnce();
  });
});

describe("concrete capture-only Hosted transport", () => {
  it.each(["valid", "full-history", "wrong-frame", "missing-frame", "malformed", "oversized", "oversized-utf8", "read-failed", "read-hung", "read-late", "sink-failed", "sink-hung", "capture-failed"])(
    "CF-05 collects bounded runtime history before cleanup without changing Capture: %s", async (mode) => {
      vi.useFakeTimers();
      try {
        const captureFailure = new Error("original Capture error");
        const h = concreteHarness(mode === "capture-failed" ? { captureFailure } : {});
        let report: RuntimeFlightReportV1 = { kind: "runtime-flight-report", schemaVersion: 1,
          diagnosticSessionId: "00000000-0000-4000-8000-000000000001", droppedSampleCount: 0,
          samples: [{ sequence: 1, epoch: 0, elapsedMilliseconds: 0, heartbeatDelayMilliseconds: 0,
            visibilityState: "visible", health: "healthy", metrics: { frame: null, tick: 0, paused: false,
              fps: null, triangleCount: null, drawCallCount: null, progressMode: "on-demand" } }],
        };
        if (mode === "full-history") report = { ...report, samples: Array.from({ length: 300 }, (_, index) => ({
          sequence: index + 1, epoch: Number.MAX_SAFE_INTEGER, elapsedMilliseconds: Number.MAX_VALUE,
          heartbeatDelayMilliseconds: Number.MAX_VALUE, visibilityState: "visible", health: "simulation-stalled",
          metrics: { frame: Number.MAX_SAFE_INTEGER, tick: Number.MAX_SAFE_INTEGER, paused: false,
            fps: Number.MAX_VALUE, triangleCount: Number.MAX_SAFE_INTEGER, drawCallCount: Number.MAX_SAFE_INTEGER,
            progressMode: "continuous" },
        })) };
        const sink = vi.fn(async () => {
          h.events.push("diagnostic.sink");
          if (mode === "sink-failed") throw new Error("private sink failure");
          if (mode === "sink-hung") await new Promise(() => undefined);
        });
        const starting = startCaptureOnlyHostedTransportV1({ packageDirectoryPath: "/tmp/verified-world-package",
          request: h.request, onRuntimeFlightDiagnostic: sink,
        }, h.ports as never);
        await vi.advanceTimersByTimeAsync(250);
        const transport = await starting;
        const frameUrl = new URL("http://127.0.0.1:5175/?hosted-formal-capture-frame=1");
        frameUrl.searchParams.set("runtimeSessionId", h.runtimeSessionId);
        frameUrl.searchParams.set("sessionNonce", mode === "wrong-frame" ? "wrong" : "nonce.formal-capture.capture-transport-nonce-001");
        frameUrl.searchParams.set("formalRequestHash", hashFormalWorldCaptureRequestV1(h.request));
        let resolveRead: ((value: string) => void) | undefined;
        const evaluate = vi.fn(async () => {
          h.events.push("diagnostic.read");
          if (mode === "read-failed") throw new Error("private browser failure");
          if (mode === "read-hung") return new Promise(() => undefined);
          if (mode === "read-late") return new Promise<string>((resolve) => { resolveRead = resolve; });
          if (mode === "malformed") return JSON.stringify({ ...report, token: "private-secret" });
          if (mode === "oversized") return "x".repeat(256001);
          if (mode === "oversized-utf8") return "界".repeat(90000);
          return JSON.stringify(report);
        });
        Object.assign(h.page, { frames: () => mode === "missing-frame" ? [] : [{ url: () => frameUrl.href, evaluate }] });
        const payload = await transport.executeFormalCapture(h.request).catch((error) => error);
        const cleanup = transport.dispose();
        await vi.advanceTimersByTimeAsync(250);
        expect(await cleanup).toEqual({ hostedBrowserSession: "completed", viteServer: "completed" });
        if (mode === "capture-failed") expect(payload).toBe(captureFailure);
        else expect(payload).toMatchObject({ receiptWithoutCleanup: { runtimeSessionId: h.runtimeSessionId } });
        expect(h.events.filter((event) => event === "page.capture")).toHaveLength(1);
        expect(h.events.slice(-4)).toEqual(["page.close", "context.close", "browser.close", "server.stop"]);
        resolveRead?.(JSON.stringify(report));
        await Promise.resolve();
        const accepted = ["valid", "full-history", "sink-failed", "sink-hung", "capture-failed"].includes(mode);
        expect(sink).toHaveBeenCalledTimes(accepted ? 1 : 0);
        if (accepted) expect(sink).toHaveBeenCalledWith({ runtimeSessionId: h.runtimeSessionId,
          formalRequestHash: hashFormalWorldCaptureRequestV1(h.request), worldPackageRootHash: h.request.worldPackageRootHash, report });
        if (mode === "wrong-frame" || mode === "missing-frame") expect(evaluate).not.toHaveBeenCalled();
        await transport.dispose();
        expect(sink).toHaveBeenCalledTimes(accepted ? 1 : 0);
        expect(vi.getTimerCount()).toBe(0);
      } finally { vi.useRealTimers(); }
    },
  );
  it("preserves startup flight evidence through cleanup without retrying or capturing", async () => {
    const h = concreteHarness({ readyPending: true });
    const startTransport = vi.fn(() => startCaptureOnlyHostedTransportV1({
      packageDirectoryPath: "/tmp/verified-world-package", request: h.request,
      readyTimeoutMilliseconds: 100, startupStallTimeoutMilliseconds: 10,
    }, h.ports as never));
    const error = await runCaptureOnlyHostedSessionV1({ request: h.request, startTransport }).catch((e) => e);
    expect(error.cause).toBeInstanceOf(CaptureStartupErrorV1);
    expect(error.cause.trace.outcome).toBe("stalled");
    expect(error.cleanupOutcomes).toEqual({ hostedBrowserSession: "completed", viteServer: "completed" });
    expect(startTransport).toHaveBeenCalledOnce();
    expect(h.events).not.toContain("page.capture");
    expect(h.events.slice(-4)).toEqual(["page.close", "context.close", "browser.close", "server.stop"]);
  });
  it("starts the verified Package server, one credentialless route, and cleans in reverse", async () => {
    const h = concreteHarness();
    const transport = await startCaptureOnlyHostedTransportV1({
      packageDirectoryPath: "/tmp/verified-world-package",
      request: h.request,
      readyTimeoutMilliseconds: 500,
    }, h.ports as never);
    await expect(transport.executeFormalCapture(h.request)).resolves
      .toMatchObject({ receiptWithoutCleanup: {
        runtimeSessionId: h.runtimeSessionId,
      } });
    await transport.dispose();
    expect(h.ports.startServer).toHaveBeenCalledWith(expect.objectContaining({
      source: {
        kind: "world-package",
        packageDirectoryPath: "/tmp/verified-world-package",
      },
      formalCaptureSdkOwnerIdentities: h.sdkOwnerIdentities,
    }));
    expect(h.ports.resolveSdkOwnerIdentities).toHaveBeenCalledOnce();
    expect(h.events.filter((event) => event.startsWith("page.goto:"))[0])
      .toContain("hosted-formal-capture=1");
    expect(h.events.slice(-4)).toEqual([
      "page.close",
      "context.close",
      "browser.close",
      "server.stop",
    ]);
  });

  it("provides the concrete default starter shape", async () => {
    const h = concreteHarness();
    const start = createCaptureOnlyHostedTransportStarterV1({
      packageDirectoryPath: "/tmp/verified-world-package",
    }, h.ports as never);
    const transport = await start(h.request);
    await transport.dispose();
    expect(h.ports.startServer).toHaveBeenCalledOnce();
  });

  it("fails before resource construction when trusted owner resolution rejects", async () => {
    const h = concreteHarness();
    h.ports.resolveSdkOwnerIdentities.mockRejectedValueOnce(
      new Error("trusted source state unavailable"),
    );
    await expect(startCaptureOnlyHostedTransportV1({
      packageDirectoryPath: "/tmp/verified-world-package",
      request: h.request,
    }, h.ports as never)).rejects.toThrow("trusted source state unavailable");
    expect(h.ports.startServer).not.toHaveBeenCalled();
    expect(h.events).toEqual([]);
  });

  it.each([
    ["ready timeout", { readyFailure: new Error("ready timeout") }],
    ["browser launch", { launchFailure: new Error("launch failed") }],
    ["context construction", { contextFailure: new Error("context failed") }],
    ["page construction", { pageFailure: new Error("page failed") }],
  ])("cleans every start-stage resource after %s failure", async (_label, options) => {
    const h = concreteHarness(options);
    await expect(startCaptureOnlyHostedTransportV1({
      packageDirectoryPath: "/tmp/verified-world-package",
      request: h.request,
      readyTimeoutMilliseconds: 1,
    }, h.ports as never)).rejects.toThrow();
    expect(h.events.at(-1)).toBe("server.stop");
    if (!("launchFailure" in options)) {
      expect(h.events).toContain("browser.close");
    }
  });

  it.each([
    ["browser", (h: ReturnType<typeof concreteHarness>) =>
      h.browser.emit("disconnected")],
    ["server", (h: ReturnType<typeof concreteHarness>) =>
      h.serverExit.resolve(1)],
    ["page error", (h: ReturnType<typeof concreteHarness>) =>
      h.page.emit("pageerror", new Error("private provider detail"))],
    ["page crash", (h: ReturnType<typeof concreteHarness>) =>
      h.page.emit("crash")],
  ])("interrupts a pending ready wait after %s exit", async (_label, exit) => {
    const h = concreteHarness({ readyPending: true });
    const started = startCaptureOnlyHostedTransportV1({
      packageDirectoryPath: "/tmp/verified-world-package",
      request: h.request,
      readyTimeoutMilliseconds: 5_000,
    }, h.ports as never);
    await vi.waitFor(() => expect(h.events).toContain("page.ready"));
    exit(h);
    await expect(Promise.race([
      started,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("exit did not interrupt ready wait")),
        50,
      )),
    ])).rejects.not.toThrow("exit did not interrupt ready wait");
    expect(h.events.at(-1)).toBe("server.stop");
  });

  it.each([
    ["browser exit", "browser"],
    ["server exit", "server"],
    ["frame navigation", "navigation"],
    ["frame removal", "removal"],
  ])("rejects Capture after %s and leaves no surviving resources", async (
    _label,
    failure,
  ) => {
    const h = concreteHarness();
    const transport = await startCaptureOnlyHostedTransportV1({
      packageDirectoryPath: "/tmp/verified-world-package",
      request: h.request,
    }, h.ports as never);
    if (failure === "browser") h.browser.emit("disconnected");
    if (failure === "server") h.serverExit.resolve(1);
    if (failure === "navigation") {
      h.page.emit("framenavigated", { id: "capture-frame" });
    }
    if (failure === "removal") {
      h.page.emit("framedetached", { id: "capture-frame" });
    }
    await expect(transport.executeFormalCapture(h.request)).rejects.toThrow();
    await expect(transport.dispose()).resolves.toEqual({
      hostedBrowserSession: "completed",
      viteServer: "completed",
    });
    expect(h.events.at(-1)).toBe("server.stop");
  });

  it.each([
    "page",
    "context",
    "browser",
    "server",
  ] as const)("continues cleanup after a %s dispose throw", async (owner) => {
    const h = concreteHarness({ closeFailure: owner });
    const starter = createCaptureOnlyHostedTransportStarterV1({
      packageDirectoryPath: "/tmp/verified-world-package",
    }, h.ports as never);
    await expect(runCaptureOnlyHostedSessionV1({
      request: h.request,
      startTransport: starter,
    })).rejects.toMatchObject({
      cleanupOutcomes: owner === "server"
        ? { hostedBrowserSession: "completed", viteServer: "failed" }
        : { hostedBrowserSession: "failed", viteServer: "completed" },
    });
    expect(h.events.slice(-4)).toEqual([
      "page.close",
      "context.close",
      "browser.close",
      "server.stop",
    ]);
  });

  it("forces complete Hosted cleanup when the Capture provider hangs", async () => {
    const h = concreteHarness({ capturePending: true });
    const starter = createCaptureOnlyHostedTransportStarterV1({
      packageDirectoryPath: "/tmp/verified-world-package",
      captureTimeoutMilliseconds: 10,
    }, h.ports as never);

    await expect(runCaptureOnlyHostedSessionV1({
      request: h.request,
      startTransport: starter,
    })).rejects.toThrow(
      "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_CAPTURE_TIMEOUT",
    );
    expect(h.events.slice(-4)).toEqual([
      "page.close",
      "context.close",
      "browser.close",
      "server.stop",
    ]);
  });

  it("normalizes only Playwright execution-context destruction to the retryable Host code", async () => {
    const rawFailure = new Error(
      "page.evaluate: Execution context was destroyed, most likely because of a navigation",
    );
    const h = concreteHarness({ captureFailure: rawFailure });
    const transport = await startCaptureOnlyHostedTransportV1({
      packageDirectoryPath: "/tmp/verified-world-package",
      request: h.request,
    }, h.ports as never);

    await expect(transport.executeFormalCapture(h.request)).rejects
      .toMatchObject({
        name: "CaptureOnlyHostedExecutionContextDestroyedErrorV1",
        code: "WORLDKIT_CAPTURE_ONLY_HOSTED_EXECUTION_CONTEXT_DESTROYED",
        cause: rawFailure,
      });
    await transport.dispose();
  });
});
