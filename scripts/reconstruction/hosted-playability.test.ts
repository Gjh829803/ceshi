import {
  deriveRuntimeSessionEventIdV1,
  deriveRuntimeSessionReceiptIdV1,
  hashRuntimeSessionRequestV1,
  WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
  type RuntimeSessionEventV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
  type RuntimeSessionSubjectSupportV1,
  type WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import { describe, expect, it, vi } from "vitest";

import {
  createHostedNativePlayabilityLaunchPortV1,
  startHostedNativePlayabilitySessionV1,
} from "./hosted-playability.js";

const ROOT_HASH = `sha256:${"a".repeat(64)}` as const;
const BUILD_HASH = `sha256:${"b".repeat(64)}` as const;
const OTHER_HASH = `sha256:${"c".repeat(64)}` as const;
const WORLD_PACKAGE_REF =
  `package://world-package/sha256/${"a".repeat(64)}` as const;
const RUNTIME_SESSION_ID =
  "runtime.native-block-reconstruction.playability.playability-001";
const INITIAL_WORLD_SESSION_ID = `${RUNTIME_SESSION_ID}.world.1`;

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

function snapshotFixture(
  worldSessionId: string,
  simulationTick: number,
): WorldRuntimeSnapshotV4 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId,
    world: {
      publicationEpoch: 0,
      simulationTick,
      worldStateRef: `worldkit://world-state/${worldSessionId}/${simulationTick}`,
      worldStateHash: ROOT_HASH,
      subjectStatesByEntityId: {},
      gameplayInspection: {
        kind: "worldkit-gameplay-inspection-snapshot",
        schemaVersion: 1,
        projection: "inspection",
        id: `gameplay-inspection:${worldSessionId}:${simulationTick}`,
        runtimeSessionId: RUNTIME_SESSION_ID,
        worldSessionId,
        gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
        phase: "ready",
        simulationTick,
        participantStatesById: {},
        controllerStatesById: {},
        relationshipStatesById: {},
        activeActionStatesById: {},
        activatedGameplayFeatureRefs: [],
        lastEventSequence: 0,
      },
    },
    view: { viewStateRevision: simulationTick, camera: { mode: "unbound" } },
    runtime: {
      phase: "ready",
      isPaused: false,
      fixedTimeStepSeconds: 1 / 60,
    },
    resources: {
      phase: "ready",
      meshCount: 1,
      physicsBodyCount: 1,
      terrainSampleCount: 0,
    },
  };
}

function readyEvent(
  overrides: Readonly<Record<string, unknown>> = {},
): RuntimeSessionEventV1 {
  const body = {
    kind: "worldkit-runtime-session-event" as const,
    schemaVersion: 1 as const,
    protocolVersion: 1 as const,
    sequence: 1,
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId: INITIAL_WORLD_SESSION_ID,
    type: "ready" as const,
    runtimeSessionUri:
      `worldkit://runtime-session/${encodeURIComponent(RUNTIME_SESSION_ID)}` as const,
    worldPackageRef: WORLD_PACKAGE_REF,
    worldPackageRootHash: ROOT_HASH,
    worldBuildIdentityHash: BUILD_HASH,
    fixedInputControllerEntityId: "native-isolation-controller",
    supportedRequestTypes: WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
    ...overrides,
  };
  return {
    id: deriveRuntimeSessionEventIdV1(body),
    ...body,
  } as RuntimeSessionEventV1;
}

function supportFixture(
  worldSessionId: string,
  subjectEntityId: string,
  simulationTick: number,
): RuntimeSessionSubjectSupportV1 {
  return {
    kind: "worldkit-runtime-session-subject-support",
    schemaVersion: 1,
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId,
    subjectEntityId,
    simulationTick,
    mode: "supported",
    sampledControllerCenterMetersXYZ: [0, 1, 0],
    sampledFootPointMetersXYZ: [0, 0, 0],
    pointMetersXYZ: [0, 0, 0],
    normalXYZ: [0, 1, 0],
    distanceMeters: 0,
    colliderId: "spawn-ground",
    colliderSubshapeId: "spawn-ground.shape",
    logicalSubshapeId: "spawn-ground.logical",
    traversalSurfaceId: "spawn-ground.surface",
    surfaceEntityId: "spawn-ground.entity",
    traversalSurfaceProfileRef:
      "worldkit://traversal-surface-profile/ground.static@1",
  };
}

function receipt(
  request: RuntimeSessionRequestV1,
  worldSessionId: string,
  result: Readonly<Record<string, unknown>>,
): RuntimeSessionReceiptV1 {
  const body = {
    kind: "worldkit-runtime-session-receipt" as const,
    schemaVersion: 1 as const,
    requestId: request.id,
    requestHash: hashRuntimeSessionRequestV1(request),
    runtimeSessionId: request.runtimeSessionId,
    worldSessionId,
    requestType: request.type,
    status: "succeeded" as const,
    ...result,
  };
  return {
    id: deriveRuntimeSessionReceiptIdV1(body),
    ...body,
  } as RuntimeSessionReceiptV1;
}

function rejectedSupportReceipt(
  request: Extract<RuntimeSessionRequestV1, { type: "subject-support.get" }>,
  worldSessionId: string,
): RuntimeSessionReceiptV1 {
  const body = {
    kind: "worldkit-runtime-session-receipt" as const,
    schemaVersion: 1 as const,
    requestId: request.id,
    requestHash: hashRuntimeSessionRequestV1(request),
    runtimeSessionId: request.runtimeSessionId,
    worldSessionId,
    requestType: request.type,
    status: "rejected" as const,
    diagnostic: {
      code: "RUNTIME_SESSION_REQUEST_REJECTED" as const,
      message:
        "Committed Subject support is stale, missing, ambiguous, or unregistered.",
    },
  };
  return {
    id: deriveRuntimeSessionReceiptIdV1(body),
    ...body,
  };
}

type HarnessOptions = Readonly<{
  readyEventPending?: boolean;
  readyPending?: boolean;
  readyValue?: unknown;
  supportRejected?: boolean;
  requestPending?: boolean;
  serverRootHash?: `sha256:${string}`;
  closeFailure?: "page" | "context" | "browser" | "server";
  mutateReceipt?: (
    value: RuntimeSessionReceiptV1,
    request: RuntimeSessionRequestV1,
  ) => unknown;
}>;

function harness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const requests: RuntimeSessionRequestV1[] = [];
  const serverExit = deferred<number | null>();
  const browser = new FakeEmitter() as FakeEmitter & Record<string, unknown>;
  const page = new FakeEmitter() as FakeEmitter & Record<string, unknown>;
  const mainFrame = { id: "main-frame" };
  let worldSessionIndex = 1;
  let simulationTick = 0;
  let activeWorldSessionId = INITIAL_WORLD_SESSION_ID;

  const execute = async (request: RuntimeSessionRequestV1): Promise<unknown> => {
    requests.push(request);
    events.push(`runtime.${request.type}`);
    if (options.requestPending === true && request.type === "fixed-input.run") {
      await new Promise(() => undefined);
    }
    let value: RuntimeSessionReceiptV1;
    if (request.type === "snapshot.get") {
      value = receipt(request, activeWorldSessionId, {
        snapshot: snapshotFixture(activeWorldSessionId, simulationTick),
      });
    } else if (request.type === "fixed-input.run") {
      simulationTick += request.input.ticks;
      value = receipt(request, activeWorldSessionId, {
        snapshot: snapshotFixture(activeWorldSessionId, simulationTick),
      });
    } else if (request.type === "session.reset") {
      worldSessionIndex += 1;
      activeWorldSessionId = `${RUNTIME_SESSION_ID}.world.${worldSessionIndex}`;
      simulationTick = 0;
      value = receipt(request, activeWorldSessionId, {
        snapshot: snapshotFixture(activeWorldSessionId, simulationTick),
      });
    } else if (request.type === "subject-support.get") {
      value = options.supportRejected === true
        ? rejectedSupportReceipt(request, activeWorldSessionId)
        : receipt(request, activeWorldSessionId, {
            subjectSupport: supportFixture(
              activeWorldSessionId,
              request.subjectEntityId,
              request.expectedSimulationTick,
            ),
          });
    } else if (request.type === "session.close") {
      value = receipt(request, activeWorldSessionId, {
        closeResult: { mode: "closed" },
      });
    } else {
      throw new Error(`unexpected request ${request.type}`);
    }
    return options.mutateReceipt?.(value, request) ?? value;
  };

  Object.assign(page, {
    mainFrame: () => mainFrame,
    async goto(url: string) {
      events.push(`page.goto:${url}`);
    },
    async waitForFunction() {
      events.push("page.ready");
      if (options.readyPending === true) await new Promise(() => undefined);
    },
    async evaluate(
      _callback: unknown,
      argument: Readonly<{
        operation: "ready-event" | "runtime-request";
        request?: RuntimeSessionRequestV1;
      }>,
    ) {
      if (argument.operation === "ready-event") {
        events.push("runtime.ready-event");
        if (options.readyEventPending === true) {
          await new Promise(() => undefined);
        }
        return options.readyValue ?? readyEvent();
      }
      if (argument.request === undefined) throw new Error("missing request");
      return execute(argument.request);
    },
    async close() {
      events.push("page.close");
      if (options.closeFailure === "page") throw new Error("page close");
    },
  });

  const context = {
    async newPage() {
      events.push("page.create");
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
      return context;
    },
    async close() {
      events.push("browser.close");
      if (options.closeFailure === "browser") throw new Error("browser close");
    },
  });
  const server = {
    url: "http://127.0.0.1:5174/?hosted=1",
    port: 5174,
    sceneSourceKind: "babylon-native-scene" as const,
    worldPackageRootHash: options.serverRootHash ?? ROOT_HASH,
    waitForExit: () => serverExit.promise,
    async stop() {
      events.push("server.stop");
      serverExit.resolve(null);
      if (options.closeFailure === "server") throw new Error("server stop");
    },
  };
  const ports = {
    randomUUID: vi.fn()
      .mockReturnValueOnce("playability-001")
      .mockReturnValueOnce("playability-nonce-001"),
    startServer: vi.fn(async () => server),
    launchBrowser: vi.fn(async () => {
      events.push("browser.launch");
      return browser;
    }),
  };
  return {
    events,
    requests,
    serverExit,
    server,
    browser,
    page,
    mainFrame,
    ports,
  };
}

function startInput() {
  return {
    packageDirectoryPath: "/tmp/verified-native-package",
    worldPackageRef: WORLD_PACKAGE_REF,
    worldPackageRootHash: ROOT_HASH,
    worldBuildIdentityHash: BUILD_HASH,
    readyTimeoutMilliseconds: 500,
    requestTimeoutMilliseconds: 500,
  } as const;
}

function rebuildReceipt(
  value: RuntimeSessionReceiptV1,
  mutation: Readonly<Record<string, unknown>>,
): RuntimeSessionReceiptV1 {
  const body = { ...value, ...mutation } as Record<string, unknown>;
  delete body.id;
  return {
    id: deriveRuntimeSessionReceiptIdV1(body),
    ...body,
  } as RuntimeSessionReceiptV1;
}

describe("Hosted Native playability adapter", () => {
  it("joins Package identity and forwards ready, input, support, reset, and close through RuntimeSessionProtocolV1", async () => {
    const h = harness();
    const launch = createHostedNativePlayabilityLaunchPortV1({}, h.ports as never);
    const session = await launch.launch(startInput());

    await expect(session.awaitReady()).resolves.toMatchObject({
      runtimeSessionId: RUNTIME_SESSION_ID,
      worldSessionId: INITIAL_WORLD_SESSION_ID,
      world: { simulationTick: 0 },
    });
    await expect(session.runFixedInput({
      actions: ["move-forward"],
      ticks: 2,
    })).resolves.toMatchObject({ world: { simulationTick: 2 } });
    await expect(session.readCommittedSubjectSupport("player", 2)).resolves
      .toMatchObject({
        mode: "supported",
        colliderId: "spawn-ground",
        worldSessionId: INITIAL_WORLD_SESSION_ID,
      });
    await expect(session.resetWithInitialControlBinding()).resolves
      .toMatchObject({
        worldSessionId: `${RUNTIME_SESSION_ID}.world.2`,
        world: { simulationTick: 0 },
      });
    await expect(session.dispose()).resolves.toEqual({ outcome: "completed" });
    await expect(session.dispose()).resolves.toEqual({ outcome: "completed" });

    expect(h.ports.startServer).toHaveBeenCalledWith(expect.objectContaining({
      source: {
        kind: "world-package",
        packageDirectoryPath: "/tmp/verified-native-package",
      },
      forwardOutput: false,
    }));
    expect(h.events.find((event) => event.startsWith("page.goto:")))
      .toContain("hosted=1");
    expect(h.requests.map(({ type }) => type)).toEqual([
      "snapshot.get",
      "fixed-input.run",
      "subject-support.get",
      "session.reset",
      "session.close",
    ]);
    expect(h.events.slice(-5)).toEqual([
      "runtime.session.close",
      "page.close",
      "context.close",
      "browser.close",
      "server.stop",
    ]);
  });

  it.each([
    ["server root", { serverRootHash: OTHER_HASH }],
    ["ready Package Ref", {
      readyValue: readyEvent({
        worldPackageRef:
          `package://world-package/sha256/${"c".repeat(64)}`,
        worldPackageRootHash: OTHER_HASH,
      }),
    }],
    ["ready build", {
      readyValue: readyEvent({ worldBuildIdentityHash: OTHER_HASH }),
    }],
  ])("fails closed for %s identity mismatch and cleans every owner", async (
    _label,
    options,
  ) => {
    const h = harness(options);
    await expect(startHostedNativePlayabilitySessionV1(
      startInput(),
      h.ports as never,
    )).rejects.toThrow("IDENTITY_MISMATCH");
    expect(h.events.at(-1)).toBe("server.stop");
  });

  it("rejects a ready event missing any required Runtime request type", async () => {
    const missingSupport = {
      ...readyEvent(),
      supportedRequestTypes: WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1.filter(
        (type) => type !== "subject-support.get",
      ),
    };
    const h = harness({ readyValue: missingSupport });
    await expect(startHostedNativePlayabilitySessionV1(
      startInput(),
      h.ports as never,
    )).rejects.toThrow("REQUIRED_REQUEST_TYPES_MISSING");
    expect(h.events.at(-1)).toBe("server.stop");
  });

  it.each([
    ["receipt id", (value: RuntimeSessionReceiptV1) => ({
      ...value,
      id: "runtime-session-receipt:wrong",
    })],
    ["request id", (value: RuntimeSessionReceiptV1) =>
      rebuildReceipt(value, { requestId: "request.wrong" })],
    ["request hash", (value: RuntimeSessionReceiptV1) =>
      rebuildReceipt(value, { requestHash: OTHER_HASH })],
    ["request type", (value: RuntimeSessionReceiptV1) =>
      rebuildReceipt(value, { requestType: "fixed-input.run" })],
    ["runtime session", (value: RuntimeSessionReceiptV1) => ({
      ...value,
      runtimeSessionId: "runtime.wrong",
    })],
    ["world session", (value: RuntimeSessionReceiptV1) => ({
      ...value,
      worldSessionId: "world.wrong",
    })],
  ])("rejects %s mismatch before exposing Runtime state", async (
    _label,
    mutate,
  ) => {
    const h = harness({
      mutateReceipt: (value, request) =>
        request.type === "snapshot.get" ? mutate(value) : value,
    });
    await expect(startHostedNativePlayabilitySessionV1(
      startInput(),
      h.ports as never,
    )).rejects.toThrow("RECEIPT");
    expect(h.events.at(-1)).toBe("server.stop");
  });

  it("permanently fences a post-ready Receipt identity violation", async () => {
    let hasCorruptedReceipt = false;
    const h = harness({
      mutateReceipt: (value, request) => {
        if (request.type !== "fixed-input.run" || hasCorruptedReceipt) {
          return value;
        }
        hasCorruptedReceipt = true;
        return rebuildReceipt(value, { requestHash: OTHER_HASH });
      },
    });
    const session = await startHostedNativePlayabilitySessionV1(
      startInput(),
      h.ports as never,
    );
    await expect(session.runFixedInput({ actions: [], ticks: 1 })).rejects
      .toThrow("RECEIPT_IDENTITY_MISMATCH");
    await expect(session.runFixedInput({ actions: [], ticks: 1 })).rejects
      .toThrow("RECEIPT_IDENTITY_MISMATCH");
    expect(h.requests.map(({ type }) => type)).toEqual([
      "snapshot.get",
      "fixed-input.run",
    ]);
    await expect(session.dispose()).resolves.toEqual({ outcome: "failed" });
  });

  it.each(["stale", "missing", "ambiguous", "unregistered"])(
    "does not synthesize %s committed support after Runtime rejection",
    async () => {
      const h = harness({ supportRejected: true });
      const session = await startHostedNativePlayabilitySessionV1(
        startInput(),
        h.ports as never,
      );
      await expect(session.readCommittedSubjectSupport("player", 0)).resolves
        .toBeUndefined();
      await session.dispose();
    },
  );

  it.each([
    ["subject", { subjectEntityId: "other-player" }],
    ["tick", { simulationTick: 9 }],
  ])("rejects committed support bound to another %s", async (
    _label,
    mutation,
  ) => {
    const h = harness({
      mutateReceipt: (value, request) => {
        if (
          request.type !== "subject-support.get" ||
          value.status !== "succeeded" ||
          value.requestType !== "subject-support.get"
        ) return value;
        return rebuildReceipt(value, {
          subjectSupport: { ...value.subjectSupport, ...mutation },
        });
      },
    });
    const session = await startHostedNativePlayabilitySessionV1(
      startInput(),
      h.ports as never,
    );
    await expect(session.readCommittedSubjectSupport("player", 0)).rejects
      .toThrow("SUBJECT_SUPPORT_IDENTITY_MISMATCH");
    await session.dispose();
  });

  it.each(["browser", "server", "frame"] as const)(
    "interrupts pending Browser readiness on early %s exit and cleans every owner",
    async (owner) => {
      const h = harness({ readyPending: true });
      const started = startHostedNativePlayabilitySessionV1(
        startInput(),
        h.ports as never,
      );
      await vi.waitFor(() => expect(h.events).toContain("page.ready"));
      if (owner === "browser") h.browser.emit("disconnected");
      if (owner === "server") h.serverExit.resolve(1);
      if (owner === "frame") h.page.emit("framedetached", { id: "child-frame" });
      await expect(Promise.race([
        started,
        new Promise((_, reject) => setTimeout(
          () => reject(new Error("early exit did not interrupt readiness")),
          100,
        )),
      ])).rejects.not.toThrow("early exit did not interrupt readiness");
      expect(h.events.at(-1)).toBe("server.stop");
    },
  );

  it("interrupts the ready identity join when the Runtime frame navigates", async () => {
    const h = harness({ readyEventPending: true });
    const started = startHostedNativePlayabilitySessionV1(
      startInput(),
      h.ports as never,
    );
    await vi.waitFor(() => expect(h.events).toContain("runtime.ready-event"));
    h.page.emit("framenavigated", { id: "child-frame" });
    await expect(Promise.race([
      started,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("ready join ignored frame navigation")),
        100,
      )),
    ])).rejects.not.toThrow("ready join ignored frame navigation");
    expect(h.events.at(-1)).toBe("server.stop");
  });

  it("interrupts a pending Runtime request after frame navigation", async () => {
    const h = harness({ requestPending: true });
    const session = await startHostedNativePlayabilitySessionV1(
      startInput(),
      h.ports as never,
    );
    const request = session.runFixedInput({ actions: [], ticks: 1 });
    await vi.waitFor(() => expect(h.events).toContain("runtime.fixed-input.run"));
    h.page.emit("framenavigated", { id: "child-frame" });
    await expect(Promise.race([
      request,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("frame exit did not interrupt request")),
        100,
      )),
    ])).rejects.not.toThrow("frame exit did not interrupt request");
    await session.dispose();
    expect(h.events.at(-1)).toBe("server.stop");
  });

  it.each(["page", "context", "browser", "server"] as const)(
    "continues reverse cleanup and reports failed after %s close throws",
    async (owner) => {
      const h = harness({ closeFailure: owner });
      const session = await startHostedNativePlayabilitySessionV1(
        startInput(),
        h.ports as never,
      );
      await expect(session.dispose()).resolves.toEqual({ outcome: "failed" });
      await expect(session.dispose()).resolves.toEqual({ outcome: "failed" });
      expect(h.events.slice(-5)).toEqual([
        "runtime.session.close",
        "page.close",
        "context.close",
        "browser.close",
        "server.stop",
      ]);
    },
  );

  it("closes admission synchronously when dispose starts", async () => {
    const h = harness();
    const session = await startHostedNativePlayabilitySessionV1(
      startInput(),
      h.ports as never,
    );
    const disposal = session.dispose();
    await expect(session.runFixedInput({ actions: [], ticks: 1 })).rejects
      .toThrow("NOT_ACTIVE");
    await expect(disposal).resolves.toEqual({ outcome: "completed" });
    expect(h.requests.map(({ type }) => type)).toEqual([
      "snapshot.get",
      "session.close",
    ]);
  });

  it("drains an operation admitted before dispose and then closes the Session", async () => {
    const h = harness();
    const session = await startHostedNativePlayabilitySessionV1(
      startInput(),
      h.ports as never,
    );
    const reset = session.resetWithInitialControlBinding();
    const disposal = session.dispose();
    await expect(reset).resolves.toMatchObject({
      worldSessionId: `${RUNTIME_SESSION_ID}.world.2`,
    });
    await expect(disposal).resolves.toEqual({ outcome: "completed" });
    expect(h.requests.map(({ type }) => type)).toEqual([
      "snapshot.get",
      "session.reset",
      "session.close",
    ]);
  });
});
