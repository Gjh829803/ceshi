import { describe, expect, it, vi } from "vitest";

import {
  createCaptureOnlyHostedTransportStarterV1,
  runCaptureOnlyHostedSessionV1,
  startCaptureOnlyHostedTransportV1,
  type CaptureOnlyHostedTransportV1,
} from "./hosted-session-capture.js";
import {
  formalCaptureRequestFixtureV1,
  formalHostedPayloadFixtureV1,
} from "../../apps/native-scene-playground/src/hosted-formal-capture-test-fixture.js";

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
  const runtimeSessionId = "runtime.formal-capture.capture-transport.001";
  Object.assign(page, {
    mainFrame: () => ({ id: "main-frame" }),
    async goto(url: string) {
      events.push(`page.goto:${url}`);
    },
    async waitForFunction() {
      events.push("page.ready");
      if (options.readyFailure !== undefined) throw options.readyFailure;
      if (options.readyPending === true) await new Promise(() => undefined);
    },
    async evaluate(_callback: unknown, argument: Readonly<{ request: unknown }>) {
      events.push("page.capture");
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
    startServer: vi.fn(async () => server),
    launchBrowser: vi.fn(async () => {
      events.push("browser.launch");
      if (options.launchFailure !== undefined) throw options.launchFailure;
      return browser;
    }),
  };
  return { request, runtimeSessionId, events, serverExit, server, browser, page, ports };
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
    const dispose = vi.fn(async () => undefined);

    await expect(runCaptureOnlyHostedSessionV1({
      request: Object.freeze({ id: "request.002" }),
      startTransport: async () => ({
        executeFormalCapture: async () => {
          throw captureFailure;
        },
        dispose,
      }),
    })).rejects.toBe(captureFailure);
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
    })).rejects.toBe(cleanupFailure);
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
    })).rejects.toBe(captureFailure);
  });
});

describe("concrete capture-only Hosted transport", () => {
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
    }));
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
    await expect(transport.dispose()).resolves.toBeUndefined();
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
    })).rejects.toThrow(owner === "server" ? "server stop" : `${owner} close`);
    expect(h.events.slice(-4)).toEqual([
      "page.close",
      "context.close",
      "browser.close",
      "server.stop",
    ]);
  });
});
