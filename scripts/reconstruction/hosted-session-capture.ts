import { randomUUID } from "node:crypto";

import {
  hashFormalWorldCaptureRequestV1,
  parseFormalWorldCaptureRequestV1,
  type FormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import type {
  Browser,
  BrowserContext,
  Frame,
  Page,
} from "playwright";

import {
  HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1,
  parseHostedFormalCapturePayloadV1,
} from "../../apps/native-scene-playground/src/hosted-formal-capture-protocol.js";
import { launchChromiumWithSystemFallback } from
  "../lib/playwright-browser-launch.js";
import {
  startWorldkitServer,
  type StartWorldkitServerOptions,
  type WorldkitServerHandle,
} from "../lib/worldkit-server.js";
import type {
  FormalHostedWorldCapturePayloadV1,
} from "./formal-capture.js";

const DEFAULT_READY_TIMEOUT_MILLISECONDS = 30_000;

export interface CaptureOnlyHostedTransportV1<Payload, Request = unknown> {
  executeFormalCapture(request: Request): Promise<Payload>;
  /** Resolves only after session, Browser, server, and temporary resources close. */
  dispose(): Promise<void>;
}

export type StartCaptureOnlyHostedTransportV1<Payload, Request = unknown> = (
  request: Request,
) => Promise<CaptureOnlyHostedTransportV1<Payload, Request>>;

export interface RunCaptureOnlyHostedSessionInputV1<Payload, Request = unknown> {
  readonly request: Request;
  /** A rejected start must clean every partially-created owned resource first. */
  readonly startTransport: StartCaptureOnlyHostedTransportV1<Payload, Request>;
}

export interface StartConcreteCaptureOnlyHostedTransportInputV1 {
  readonly packageDirectoryPath: string;
  readonly request: FormalWorldCaptureRequestV1;
  readonly port?: number;
  readonly readyTimeoutMilliseconds?: number;
}

type ServerPortV1 = Pick<
  WorldkitServerHandle,
  "url" | "port" | "sceneSourceKind" | "worldPackageRootHash" |
  "stop" | "waitForExit"
>;

export interface CaptureOnlyHostedTransportPortsV1 {
  readonly randomUUID: () => string;
  readonly startServer: (
    options: StartWorldkitServerOptions,
  ) => Promise<ServerPortV1>;
  readonly launchBrowser: () => Promise<Browser>;
}

const defaultPorts: CaptureOnlyHostedTransportPortsV1 = Object.freeze({
  randomUUID,
  startServer: startWorldkitServer,
  launchBrowser: launchChromiumWithSystemFallback,
});

function transportError(reason: string): Error {
  return new Error(`WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_${reason}`);
}

async function cleanupOwnedResources(input: Readonly<{
  page?: Pick<Page, "close">;
  context?: Pick<BrowserContext, "close">;
  browser?: Pick<Browser, "close">;
  server?: Pick<ServerPortV1, "stop">;
}>): Promise<void> {
  let firstFailure: unknown;
  for (const close of [
    input.page === undefined ? undefined : () => input.page!.close(),
    input.context === undefined ? undefined : () => input.context!.close(),
    input.browser === undefined ? undefined : () => input.browser!.close(),
    input.server === undefined ? undefined : () => input.server!.stop(),
  ]) {
    if (close === undefined) continue;
    try {
      await close();
    } catch (error) {
      firstFailure ??= error;
    }
  }
  if (firstFailure !== undefined) throw firstFailure;
}

function captureRouteUrl(input: Readonly<{
  serverUrl: string;
  runtimeSessionId: string;
  sessionNonce: string;
  formalRequestId: string;
  formalRequestHash: `sha256:${string}`;
}>): string {
  const url = new URL(input.serverUrl);
  if (
    url.origin !== `http://127.0.0.1:${url.port}` ||
    url.username !== "" ||
    url.password !== ""
  ) throw transportError("SHELL_ORIGIN_INVALID");
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("hosted-formal-capture", "1");
  url.searchParams.set("runtimeSessionId", input.runtimeSessionId);
  url.searchParams.set("sessionNonce", input.sessionNonce);
  url.searchParams.set("formalRequestId", input.formalRequestId);
  url.searchParams.set("formalRequestHash", input.formalRequestHash);
  return url.href;
}

export async function startCaptureOnlyHostedTransportV1(
  input: StartConcreteCaptureOnlyHostedTransportInputV1,
  ports: CaptureOnlyHostedTransportPortsV1 = defaultPorts,
): Promise<CaptureOnlyHostedTransportV1<
  FormalHostedWorldCapturePayloadV1,
  FormalWorldCaptureRequestV1
>> {
  const request = parseFormalWorldCaptureRequestV1(input.request);
  const formalRequestHash = hashFormalWorldCaptureRequestV1(request);
  const runtimeSessionId = `runtime.formal-capture.${ports.randomUUID()}`;
  const sessionNonce = `nonce.formal-capture.${ports.randomUUID()}`;
  let server: ServerPortV1 | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let isDisposing = false;
  let disposePromise: Promise<void> | undefined;
  let hasExecuted = false;
  let fatalError: Error | undefined;
  let signalFatal!: () => void;
  const fatalSignal = new Promise<void>((resolve) => {
    signalFatal = resolve;
  });
  const fail = (reason: string): void => {
    if (isDisposing || fatalError !== undefined) return;
    fatalError = transportError(reason);
    signalFatal();
  };
  const onBrowserDisconnected = () => fail("BROWSER_EXITED");
  const onPageClosed = () => fail("PAGE_CLOSED");
  const onFrameDetached = (frame: Frame) => {
    if (page !== undefined && frame !== page.mainFrame()) fail("FRAME_REMOVED");
  };
  const onFrameNavigated = (frame: Frame) => {
    if (page !== undefined && frame !== page.mainFrame()) fail("FRAME_NAVIGATED");
  };
  const cleanup = (): Promise<void> => {
    if (disposePromise !== undefined) return disposePromise;
    isDisposing = true;
    browser?.off("disconnected", onBrowserDisconnected);
    page?.off("close", onPageClosed);
    page?.off("framedetached", onFrameDetached);
    page?.off("framenavigated", onFrameNavigated);
    disposePromise = cleanupOwnedResources({
      ...(page === undefined ? {} : { page }),
      ...(context === undefined ? {} : { context }),
      ...(browser === undefined ? {} : { browser }),
      ...(server === undefined ? {} : { server }),
    });
    return disposePromise;
  };

  try {
    server = await ports.startServer({
      source: {
        kind: "world-package",
        packageDirectoryPath: input.packageDirectoryPath,
      },
      ...(input.port === undefined ? {} : { port: input.port }),
      forwardOutput: false,
    });
    if (
      server.sceneSourceKind !== "babylon-native-scene" ||
      server.worldPackageRootHash !== request.worldPackageRootHash
    ) throw transportError("SERVER_PACKAGE_IDENTITY_MISMATCH");
    void server.waitForExit().then(() => fail("SERVER_EXITED"));

    browser = await ports.launchBrowser();
    browser.on("disconnected", onBrowserDisconnected);
    context = await browser.newContext({ serviceWorkers: "block" });
    page = await context.newPage();
    page.on("close", onPageClosed);
    await page.goto(captureRouteUrl({
      serverUrl: server.url,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
    }), { waitUntil: "domcontentloaded" });
    await Promise.race([
      page.waitForFunction(() => {
        const capture = (globalThis as unknown as Readonly<{
          __WORLDKIT_HOSTED_FORMAL_CAPTURE__?: Readonly<{
            phase(): string;
          }>;
        }>).__WORLDKIT_HOSTED_FORMAL_CAPTURE__;
        return capture?.phase() === "ready";
      }, undefined, {
        timeout: input.readyTimeoutMilliseconds ??
          DEFAULT_READY_TIMEOUT_MILLISECONDS,
      }),
      fatalSignal.then(() => {
        throw fatalError ?? transportError("TERMINATED");
      }),
    ]);
    page.on("framedetached", onFrameDetached);
    page.on("framenavigated", onFrameNavigated);
    if (fatalError !== undefined) throw fatalError;
  } catch (error) {
    try {
      await cleanup();
    } catch {
      // Startup failure remains primary; every later owner was still attempted.
    }
    throw error;
  }

  return Object.freeze({
    async executeFormalCapture(value: FormalWorldCaptureRequestV1) {
      if (hasExecuted) throw transportError("DUPLICATE_REQUEST");
      await Promise.resolve();
      if (isDisposing || fatalError !== undefined || page === undefined) {
        throw fatalError ?? transportError("NOT_ACTIVE");
      }
      const parsed = parseFormalWorldCaptureRequestV1(value);
      if (
        parsed.id !== request.id ||
        hashFormalWorldCaptureRequestV1(parsed) !== formalRequestHash
      ) throw transportError("REQUEST_IDENTITY_MISMATCH");
      hasExecuted = true;
      const browserCapture = page.evaluate(async ({ request }) => {
        const capture = (globalThis as unknown as Readonly<{
          __WORLDKIT_HOSTED_FORMAL_CAPTURE__?: Readonly<{
            executeFormalCapture(value: unknown): Promise<unknown>;
          }>;
        }>).__WORLDKIT_HOSTED_FORMAL_CAPTURE__;
        if (capture === undefined) {
          throw new Error("WORLDKIT_HOSTED_FORMAL_CAPTURE_ROUTE_UNAVAILABLE");
        }
        return capture.executeFormalCapture(request);
      }, { request: parsed });
      const payload = await Promise.race([
        browserCapture,
        fatalSignal.then(() => {
          throw fatalError ?? transportError("TERMINATED");
        }),
      ]);
      return parseHostedFormalCapturePayloadV1({
        value: payload,
        runtimeSessionId,
        request,
        formalRequestHash,
        protocolBudget: HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1,
      });
    },
    dispose: cleanup,
  });
}

export function createCaptureOnlyHostedTransportStarterV1(
  input: Readonly<{
    packageDirectoryPath: string;
    port?: number;
    readyTimeoutMilliseconds?: number;
  }>,
  ports: CaptureOnlyHostedTransportPortsV1 = defaultPorts,
): StartCaptureOnlyHostedTransportV1<
  FormalHostedWorldCapturePayloadV1,
  FormalWorldCaptureRequestV1
> {
  return (request) => startCaptureOnlyHostedTransportV1({
    ...input,
    request,
  }, ports);
}

export async function runCaptureOnlyHostedSessionV1<Payload, Request = unknown>(
  input: RunCaptureOnlyHostedSessionInputV1<Payload, Request>,
): Promise<Payload> {
  const transport = await input.startTransport(input.request);
  let payload: Payload | undefined;
  let captureFailure: unknown;
  try {
    payload = await transport.executeFormalCapture(input.request);
  } catch (error) {
    captureFailure = error;
  }

  try {
    await transport.dispose();
  } catch (cleanupFailure) {
    if (captureFailure === undefined) throw cleanupFailure;
  }

  if (captureFailure !== undefined) throw captureFailure;
  return payload as Payload;
}
