import {
  hashFormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import { describe, expect, it, vi } from "vitest";

import {
  createHostedFormalCaptureBridgeV1,
} from "./hosted-formal-capture-bridge.js";
import {
  formalCaptureRequestFixtureV1,
  formalHostedPayloadFixtureV1,
} from "@whitebox-world/runtime-babylon/testing";

const runtimeOrigin = "http://127.0.0.1:5175";
const runtimeSessionId = "runtime.formal-capture.001";
const sessionNonce = "nonce.formal-capture.001";
const request = formalCaptureRequestFixtureV1();
const formalRequestHash = hashFormalWorldCaptureRequestV1(request);
const protocolBudget = {
  maximumInboundMessageBytes: 2_000_000,
  maximumOutboundMessageBytes: 10_000_000,
  maximumPngBytesPerArtifact: 1_000_000,
} as const;

function harness() {
  const shellWindow = new EventTarget();
  vi.stubGlobal("window", shellWindow);
  vi.stubGlobal("location", { origin: "http://127.0.0.1:5174" });
  const postMessage = vi.fn();
  const contentWindow = { postMessage } as unknown as Window;
  const frameEvents = new EventTarget();
  const frameRecord = {
    contentWindow,
    isConnected: true,
    credentialless: false,
    remove: vi.fn(),
    setAttribute: vi.fn(),
    addEventListener: frameEvents.addEventListener.bind(frameEvents),
    removeEventListener: frameEvents.removeEventListener.bind(frameEvents),
    dispatchEvent: frameEvents.dispatchEvent.bind(frameEvents),
  } as unknown as HTMLIFrameElement;
  const bridge = createHostedFormalCaptureBridgeV1({
    frame: frameRecord,
    runtimeOrigin,
    runtimeSessionId,
    sessionNonce,
    formalRequestId: request.id,
    formalRequestHash,
    protocolBudget,
  });
  const bootstrap = (overrides: Record<string, unknown> = {}) => {
    const event = new Event("message") as MessageEvent;
    Object.defineProperties(event, {
      origin: { value: runtimeOrigin },
      source: { value: contentWindow },
      data: { value: {
        kind: "worldkit-hosted-formal-capture-frame-ready",
        schemaVersion: 1,
        runtimeSessionId,
        sessionNonce,
        formalRequestId: request.id,
        formalRequestHash,
        messageSequence: 1,
        ...overrides,
      } },
    });
    shellWindow.dispatchEvent(event);
  };
  return { bridge, bootstrap, postMessage, frame: frameRecord };
}

async function connect(h: ReturnType<typeof harness>): Promise<MessagePort> {
  h.bootstrap();
  const runtimePort = h.postMessage.mock.calls[0]?.[2]?.[0] as MessagePort;
  runtimePort.postMessage({
    kind: "worldkit-hosted-formal-capture-port-ready",
    schemaVersion: 1,
    runtimeSessionId,
    sessionNonce,
    formalRequestId: request.id,
    formalRequestHash,
    messageSequence: 1,
  });
  await expect(h.bridge.waitUntilReady()).resolves.toBeUndefined();
  return runtimePort;
}

describe("capture-only Hosted shell bridge", () => {
  it("uses one credentialless cross-origin iframe and exact bootstrap identity", () => {
    const h = harness();
    h.bootstrap();
    expect(Reflect.get(h.frame, "credentialless")).toBe(true);
    expect(h.frame.setAttribute).toHaveBeenCalledWith(
      "sandbox",
      "allow-scripts allow-same-origin",
    );
    expect(h.postMessage.mock.calls[0]?.[1]).toBe(runtimeOrigin);
    h.bridge.dispose();
  });

  it.each([
    ["origin", {}, "http://127.0.0.1:5999"],
    ["session", { runtimeSessionId: "runtime.wrong" }, runtimeOrigin],
    ["nonce", { sessionNonce: "nonce.wrong" }, runtimeOrigin],
    ["sequence", { messageSequence: 2 }, runtimeOrigin],
    ["kind", { kind: "worldkit-runtime-session-event" }, runtimeOrigin],
    ["additional key", { extra: true }, runtimeOrigin],
  ])("fails closed for wrong %s", (_label, mutation, origin) => {
    const h = harness();
    const event = new Event("message") as MessageEvent;
    Object.defineProperties(event, {
      origin: { value: origin },
      source: { value: h.frame.contentWindow },
      data: { value: {
        kind: "worldkit-hosted-formal-capture-frame-ready",
        schemaVersion: 1,
        runtimeSessionId,
        sessionNonce,
        formalRequestId: request.id,
        formalRequestHash,
        messageSequence: 1,
        ...mutation,
      } },
    });
    window.dispatchEvent(event);
    expect(h.bridge.phase()).toBe("terminated");
    expect(h.frame.remove).toHaveBeenCalledOnce();
  });

  it("sends one parsed request and accepts one exact structural result", async () => {
    const h = harness();
    const runtimePort = await connect(h);
    const result = h.bridge.executeFormalCapture(request);
    runtimePort.postMessage({
      kind: "worldkit-hosted-formal-capture-result",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 2,
      payload: formalHostedPayloadFixtureV1({ request, runtimeSessionId }),
    });
    await expect(result).resolves.toMatchObject({ receiptWithoutCleanup: {
      runtimeSessionId,
      formalRequestHash,
    } });
    await expect(h.bridge.executeFormalCapture(request)).rejects.toThrow(
      "DUPLICATE_REQUEST",
    );
    runtimePort.postMessage({
      kind: "worldkit-hosted-formal-capture-result",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 3,
      payload: formalHostedPayloadFixtureV1({ request, runtimeSessionId }),
    });
    await vi.waitFor(() => expect(h.bridge.phase()).toBe("terminated"));
  });

  it.each([
    ["oversize message", { extra: "x".repeat(10_000_000) }],
    ["wrong direction", {
      kind: "worldkit-hosted-formal-capture-request",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 2,
      payload: request,
    }],
    ["wrong sequence", {
      kind: "worldkit-hosted-formal-capture-failure",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 9,
      diagnosticCode: "WORLDKIT_HOSTED_FORMAL_CAPTURE_PROVIDER_REJECTED",
    }],
  ])("terminates an inbound %s", async (_label, message) => {
    const h = harness();
    const runtimePort = await connect(h);
    const pending = h.bridge.executeFormalCapture(request);
    runtimePort.postMessage(message);
    await expect(pending).rejects.toThrow();
    expect(h.bridge.phase()).toBe("terminated");
  });

  it("rejects each oversized PNG and frame navigation/removal", async () => {
    const h = harness();
    const runtimePort = await connect(h);
    const pending = h.bridge.executeFormalCapture(request);
    runtimePort.postMessage({
      kind: "worldkit-hosted-formal-capture-result",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 2,
      payload: formalHostedPayloadFixtureV1({
        request,
        runtimeSessionId,
        pngBytes: protocolBudget.maximumPngBytesPerArtifact + 1,
      }),
    });
    await expect(pending).rejects.toThrow("PNG_BUDGET_EXCEEDED");

    const navigated = harness();
    navigated.frame.dispatchEvent(new Event("load"));
    navigated.frame.dispatchEvent(new Event("load"));
    expect(navigated.bridge.phase()).toBe("terminated");

    const removed = harness();
    Reflect.set(removed.frame, "isConnected", false);
    await expect(removed.bridge.waitUntilReady()).rejects.toThrow(
      "FRAME_REMOVED",
    );
  });
});
