import {
  hashRuntimeSessionRequestV1,
  parseRuntimeSessionEventV1,
  parseRuntimeSessionReceiptV1,
  parseWorldRuntimeSnapshotV4,
  type FixedInputV1,
  type RuntimeSessionEventV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
  type RuntimeSessionRequestTypeV1,
  type RuntimeSessionSubjectSupportV1,
  type WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";
import type { Browser, BrowserContext, Frame, Page } from "playwright";

import { launchChromiumWithSystemFallback } from
  "../lib/playwright-browser-launch.js";
import {
  startWorldkitServer,
  type StartWorldkitServerOptions,
  type WorldkitServerHandle,
} from "../lib/worldkit-server.js";
import type {
  NativeBlockReconstructionPlayabilityLaunchPortV1,
  NativeBlockReconstructionPlayabilitySessionPortV1,
} from "../verification/verify-native-block-reconstruction-e2e.js";

const DEFAULT_READY_TIMEOUT_MILLISECONDS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const REQUIRED_REQUEST_TYPES = Object.freeze([
  "fixed-input.run",
  "snapshot.get",
  "session.reset",
  "subject-support.get",
  "session.close",
] as const satisfies readonly RuntimeSessionRequestTypeV1[]);

type ServerPortV1 = Pick<
  WorldkitServerHandle,
  "url" | "port" | "sceneSourceKind" | "worldPackageRootHash" | "stop" |
    "waitForExit"
>;

export interface HostedNativePlayabilityPortsV1 {
  readonly startServer: (
    options: StartWorldkitServerOptions,
  ) => Promise<ServerPortV1>;
  readonly launchBrowser: () => Promise<Browser>;
}

export interface StartHostedNativePlayabilitySessionInputV1 {
  readonly packageDirectoryPath: string;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: `sha256:${string}`;
  readonly worldBuildIdentityHash: `sha256:${string}`;
  readonly port?: number;
  readonly readyTimeoutMilliseconds?: number;
  readonly requestTimeoutMilliseconds?: number;
}

export interface HostedNativePlayabilityLaunchOptionsV1 {
  readonly port?: number;
  readonly readyTimeoutMilliseconds?: number;
  readonly requestTimeoutMilliseconds?: number;
}

const defaultPorts = Object.freeze({
  startServer: startWorldkitServer,
  launchBrowser: launchChromiumWithSystemFallback,
}) satisfies HostedNativePlayabilityPortsV1;

function playabilityError(reason: string): Error {
  return new Error(`WORLDKIT_NBR_HOSTED_PLAYABILITY_${reason}`);
}

function routeUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  if (
    url.origin !== `http://127.0.0.1:${url.port}` ||
    url.username !== "" ||
    url.password !== ""
  ) throw playabilityError("SHELL_ORIGIN_INVALID");
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("hosted", "1");
  return url.href;
}

function hasRequiredRequestTypes(value: unknown): boolean {
  if (typeof value !== "object" || isNil(value) || Array.isArray(value)) {
    return false;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const supportedRequestTypes = record.supportedRequestTypes;
  if (record.type !== "ready" || !Array.isArray(supportedRequestTypes)) {
    return false;
  }
  return REQUIRED_REQUEST_TYPES.every((type) =>
    supportedRequestTypes.includes(type)
  );
}

function parseReadyEvent(
  value: unknown,
  expected: Pick<
    StartHostedNativePlayabilitySessionInputV1,
    "worldPackageRef" | "worldPackageRootHash" | "worldBuildIdentityHash"
  >,
): Extract<RuntimeSessionEventV1, { type: "ready" }> {
  if (!hasRequiredRequestTypes(value)) {
    throw playabilityError("REQUIRED_REQUEST_TYPES_MISSING");
  }
  let event: RuntimeSessionEventV1;
  try {
    event = parseRuntimeSessionEventV1(value);
  } catch {
    throw playabilityError("READY_EVENT_INVALID");
  }
  if (
    event.type !== "ready" ||
    event.worldPackageRef !== expected.worldPackageRef ||
    event.worldPackageRootHash !== expected.worldPackageRootHash ||
    event.worldBuildIdentityHash !== expected.worldBuildIdentityHash
  ) throw playabilityError("READY_IDENTITY_MISMATCH");
  return event;
}

async function cleanupOwnedResources(input: Readonly<{
  page?: Pick<Page, "close">;
  context?: Pick<BrowserContext, "close">;
  browser?: Pick<Browser, "close">;
  server?: Pick<ServerPortV1, "stop">;
}>): Promise<boolean> {
  let failed = false;
  for (const close of [
    isNil(input.page) ? undefined : () => input.page!.close(),
    isNil(input.context) ? undefined : () => input.context!.close(),
    isNil(input.browser) ? undefined : () => input.browser!.close(),
    isNil(input.server) ? undefined : () => input.server!.stop(),
  ]) {
    if (isNil(close)) continue;
    try {
      await close();
    } catch {
      failed = true;
    }
  }
  return failed;
}

function evaluateHostedRuntime(
  page: Page,
  input:
    | Readonly<{ operation: "ready-event" }>
    | Readonly<{
      operation: "runtime-request";
      request: RuntimeSessionRequestV1;
    }>,
): Promise<unknown> {
  return page.evaluate(async (argument) => {
    const runtime = (globalThis as unknown as Readonly<{
      __WORLDKIT_HOSTED_RUNTIME__?: Readonly<{
        waitUntilReady(): Promise<unknown>;
        submit(request: unknown): Promise<unknown>;
      }>;
    }>).__WORLDKIT_HOSTED_RUNTIME__;
    if (runtime === undefined) {
      throw new Error("WORLDKIT_HOSTED_RUNTIME_ROUTE_UNAVAILABLE");
    }
    return argument.operation === "ready-event"
      ? runtime.waitUntilReady()
      : runtime.submit(argument.request);
  }, input);
}

export async function startHostedNativePlayabilitySessionV1(
  input: StartHostedNativePlayabilitySessionInputV1,
  ports: HostedNativePlayabilityPortsV1 = defaultPorts,
): Promise<NativeBlockReconstructionPlayabilitySessionPortV1> {
  let server: ServerPortV1 | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let isDisposing = false;
  let fatalError: Error | undefined;
  let signalFatal!: () => void;
  const fatalSignal = new Promise<void>((resolve) => {
    signalFatal = resolve;
  });
  const fail = (reason: string): void => {
    if (isDisposing || !isNil(fatalError)) return;
    fatalError = playabilityError(reason);
    signalFatal();
  };
  const onBrowserDisconnected = () => fail("BROWSER_EXITED");
  const onPageClosed = () => fail("PAGE_CLOSED");
  const onFrameDetached = (frame: Frame) => {
    if (!isNil(page) && frame !== page.mainFrame()) fail("FRAME_REMOVED");
  };
  const onFrameNavigated = (frame: Frame) => {
    if (!isNil(page) && frame !== page.mainFrame()) fail("FRAME_NAVIGATED");
  };

  const cleanupWithoutRuntimeClose = async (): Promise<boolean> => {
    isDisposing = true;
    browser?.off("disconnected", onBrowserDisconnected);
    page?.off("close", onPageClosed);
    page?.off("framedetached", onFrameDetached);
    page?.off("framenavigated", onFrameNavigated);
    return cleanupOwnedResources({
      ...(isNil(page) ? {} : { page }),
      ...(isNil(context) ? {} : { context }),
      ...(isNil(browser) ? {} : { browser }),
      ...(isNil(server) ? {} : { server }),
    });
  };

  try {
    server = await ports.startServer({
      source: {
        kind: "world-package",
        packageDirectoryPath: input.packageDirectoryPath,
      },
      ...(isNil(input.port) ? {} : { port: input.port }),
      forwardOutput: false,
    });
    if (
      server.sceneSourceKind !== "babylon-native-scene" ||
      server.worldPackageRootHash !== input.worldPackageRootHash
    ) throw playabilityError("SERVER_IDENTITY_MISMATCH");
    void server.waitForExit().then(() => fail("SERVER_EXITED"));

    browser = await ports.launchBrowser();
    browser.on("disconnected", onBrowserDisconnected);
    context = await browser.newContext({ serviceWorkers: "block" });
    page = await context.newPage();
    page.on("close", onPageClosed);
    page.on("framedetached", onFrameDetached);
    await page.goto(routeUrl(server.url), { waitUntil: "domcontentloaded" });
    await Promise.race([
      page.waitForFunction(() => {
        const runtime = (globalThis as unknown as Readonly<{
          __WORLDKIT_HOSTED_RUNTIME__?: Readonly<{ phase(): string }>;
        }>).__WORLDKIT_HOSTED_RUNTIME__;
        return runtime?.phase() === "ready";
      }, undefined, {
        timeout: input.readyTimeoutMilliseconds ??
          DEFAULT_READY_TIMEOUT_MILLISECONDS,
      }),
      fatalSignal.then(() => {
        throw fatalError ?? playabilityError("TERMINATED");
      }),
    ]);
    if (!isNil(fatalError)) throw fatalError;
    page.on("framenavigated", onFrameNavigated);
    const ready = parseReadyEvent(
      await Promise.race([
        evaluateHostedRuntime(page, { operation: "ready-event" }),
        fatalSignal.then(() => {
          throw fatalError ?? playabilityError("TERMINATED");
        }),
      ]),
      input,
    );

    let requestSequence = 0;
    let currentWorldSessionId = ready.worldSessionId;
    let initialSnapshot: WorldRuntimeSnapshotV4 | undefined;
    let disposePromise:
      Promise<Readonly<{ outcome: "completed" | "failed" }>> | undefined;
    let operationTail = Promise.resolve();

    const request = async (
      requestInput: RuntimeSessionRequestV1,
      options: Readonly<{
        allowSupportRejection?: boolean;
      }> = {},
    ): Promise<RuntimeSessionReceiptV1 | undefined> => {
      if (!isNil(fatalError)) throw fatalError;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          const error = playabilityError("REQUEST_TIMEOUT");
          fail("REQUEST_TIMEOUT");
          reject(error);
        }, input.requestTimeoutMilliseconds ??
          DEFAULT_REQUEST_TIMEOUT_MILLISECONDS);
        timeoutHandle.unref?.();
      });
      let raw: unknown;
      try {
        raw = await Promise.race([
          evaluateHostedRuntime(page!, {
            operation: "runtime-request",
            request: requestInput,
          }),
          fatalSignal.then(() => {
            throw fatalError ?? playabilityError("TERMINATED");
          }),
          timeout,
        ]);
      } finally {
        if (!isNil(timeoutHandle)) clearTimeout(timeoutHandle);
      }
      let receipt: RuntimeSessionReceiptV1;
      try {
        receipt = parseRuntimeSessionReceiptV1(raw);
      } catch {
        fail("RECEIPT_INVALID");
        throw fatalError ?? playabilityError("RECEIPT_INVALID");
      }
      if (
        receipt.requestId !== requestInput.id ||
        receipt.requestHash !== hashRuntimeSessionRequestV1(requestInput) ||
        receipt.requestType !== requestInput.type ||
        receipt.runtimeSessionId !== ready.runtimeSessionId
      ) {
        fail("RECEIPT_IDENTITY_MISMATCH");
        throw fatalError ?? playabilityError("RECEIPT_IDENTITY_MISMATCH");
      }
      if (receipt.status === "rejected") {
        if (
          options.allowSupportRejection === true &&
          receipt.requestType === "subject-support.get" &&
          receipt.diagnostic.code === "RUNTIME_SESSION_REQUEST_REJECTED" &&
          receipt.worldSessionId === currentWorldSessionId
        ) return undefined;
        const reason = `RUNTIME_REQUEST_REJECTED_${receipt.diagnostic.code}`;
        fail(reason);
        throw fatalError ?? playabilityError(reason);
      }
      if (receipt.requestType === "session.reset") {
        if (
          receipt.worldSessionId === currentWorldSessionId ||
          receipt.snapshot.worldSessionId !== receipt.worldSessionId
        ) {
          fail("RESET_WORLD_SESSION_INVALID");
          throw fatalError ?? playabilityError("RESET_WORLD_SESSION_INVALID");
        }
        currentWorldSessionId = receipt.worldSessionId;
      } else if (receipt.worldSessionId !== currentWorldSessionId) {
        fail("RECEIPT_WORLD_SESSION_MISMATCH");
        throw fatalError ?? playabilityError("RECEIPT_WORLD_SESSION_MISMATCH");
      }
      return receipt;
    };

    const enqueue = <Result>(operation: () => Promise<Result>): Promise<Result> => {
      if (isDisposing) return Promise.reject(playabilityError("NOT_ACTIVE"));
      const result = operationTail.then(operation);
      operationTail = result.then(() => undefined, () => undefined);
      return result;
    };
    const nextRequest = <Type extends RuntimeSessionRequestTypeV1>(
      type: Type,
      body: Readonly<Record<string, unknown>> = {},
    ): RuntimeSessionRequestV1 => ({
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: `request.nbr-hosted-playability.${++requestSequence}`,
      runtimeSessionId: ready.runtimeSessionId,
      type,
      ...body,
    }) as RuntimeSessionRequestV1;

    const session = Object.freeze({
      async awaitReady(): Promise<WorldRuntimeSnapshotV4> {
        if (isDisposing) throw playabilityError("NOT_ACTIVE");
        if (isNil(initialSnapshot)) throw playabilityError("NOT_READY");
        return initialSnapshot;
      },
      resetWithInitialControlBinding(): Promise<WorldRuntimeSnapshotV4> {
        return enqueue(async () => {
          const result = await request(nextRequest("session.reset"));
          if (
            isNil(result) || result.status !== "succeeded" ||
            result.requestType !== "session.reset"
          ) throw playabilityError("RESET_RECEIPT_INVALID");
          return parseWorldRuntimeSnapshotV4(result.snapshot);
        });
      },
      runFixedInput(fixedInput: FixedInputV1): Promise<WorldRuntimeSnapshotV4> {
        return enqueue(async () => {
          const result = await request(nextRequest("fixed-input.run", {
            input: fixedInput,
          }));
          if (
            isNil(result) || result.status !== "succeeded" ||
            result.requestType !== "fixed-input.run"
          ) throw playabilityError("FIXED_INPUT_RECEIPT_INVALID");
          return parseWorldRuntimeSnapshotV4(result.snapshot);
        });
      },
      readCommittedSubjectSupport(
        subjectEntityId: string,
        expectedSimulationTick: number,
      ): Promise<RuntimeSessionSubjectSupportV1 | undefined> {
        return enqueue(async () => {
          const result = await request(nextRequest("subject-support.get", {
            subjectEntityId,
            expectedSimulationTick,
          }), { allowSupportRejection: true });
          if (isNil(result)) return undefined;
          if (
            result.status !== "succeeded" ||
            result.requestType !== "subject-support.get"
          ) throw playabilityError("SUBJECT_SUPPORT_RECEIPT_INVALID");
          if (
            result.subjectSupport.subjectEntityId !== subjectEntityId ||
            result.subjectSupport.simulationTick !== expectedSimulationTick
          ) {
            fail("SUBJECT_SUPPORT_IDENTITY_MISMATCH");
            throw fatalError ??
              playabilityError("SUBJECT_SUPPORT_IDENTITY_MISMATCH");
          }
          return result.subjectSupport;
        });
      },
      dispose(): Promise<Readonly<{ outcome: "completed" | "failed" }>> {
        if (!isNil(disposePromise)) return disposePromise;
        isDisposing = true;
        disposePromise = (async () => {
          let failed = false;
          await operationTail;
          if (isNil(fatalError)) {
            try {
              const result = await request(nextRequest("session.close"));
              if (
                isNil(result) || result.status !== "succeeded" ||
                result.requestType !== "session.close"
              ) failed = true;
            } catch {
              failed = true;
            }
          } else {
            failed = true;
          }
          failed = (await cleanupWithoutRuntimeClose()) || failed;
          return Object.freeze({ outcome: failed ? "failed" : "completed" });
        })();
        return disposePromise;
      },
    }) satisfies NativeBlockReconstructionPlayabilitySessionPortV1;

    try {
      const result = await request(nextRequest("snapshot.get"));
      if (
        isNil(result) || result.status !== "succeeded" ||
        result.requestType !== "snapshot.get"
      ) throw playabilityError("SNAPSHOT_RECEIPT_INVALID");
      initialSnapshot = parseWorldRuntimeSnapshotV4(result.snapshot);
      if (
        initialSnapshot.runtimeSessionId !== ready.runtimeSessionId ||
        initialSnapshot.worldSessionId !== ready.worldSessionId
      ) throw playabilityError("SNAPSHOT_IDENTITY_MISMATCH");
    } catch (error) {
      await session.dispose();
      throw error;
    }
    return session;
  } catch (error) {
    if (!isDisposing) await cleanupWithoutRuntimeClose();
    throw error;
  }
}

export function createHostedNativePlayabilityLaunchPortV1(
  options: HostedNativePlayabilityLaunchOptionsV1 = {},
  ports: HostedNativePlayabilityPortsV1 = defaultPorts,
): NativeBlockReconstructionPlayabilityLaunchPortV1 {
  return Object.freeze({
    launch: (
      input: Parameters<NativeBlockReconstructionPlayabilityLaunchPortV1["launch"]>[0],
    ) => startHostedNativePlayabilitySessionV1({
      ...input,
      ...options,
    }, ports),
  });
}
