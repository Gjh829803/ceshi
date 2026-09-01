import {
  hashFormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import { describe, expect, it, vi } from "vitest";

import {
  startHostedFormalCaptureFrameV1,
  type FormalCaptureOnlyRuntimeEntryPortV1,
} from "./hosted-formal-capture-frame.js";
import {
  formalCaptureRequestFixtureV1,
  formalHostedPayloadFixtureV1,
} from "./hosted-formal-capture-test-fixture.js";

const shellOrigin = "http://127.0.0.1:5174";
const runtimeSessionId = "runtime.formal-capture.frame.001";
const sessionNonce = "nonce.formal-capture.frame.001";
const request = formalCaptureRequestFixtureV1();
const formalRequestHash = hashFormalWorldCaptureRequestV1(request);
const protocolBudget = {
  maximumInboundMessageBytes: 2_000_000,
  maximumOutboundMessageBytes: 10_000_000,
  maximumPngBytesPerArtifact: 1_000_000,
} as const;

function harness(options: Readonly<{
  execute?: FormalCaptureOnlyRuntimeEntryPortV1["executeFormalCapture"];
}> = {}) {
  const runtimeWindow = new EventTarget();
  const parent = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperties(runtimeWindow, {
    parent: { value: parent },
  });
  vi.stubGlobal("window", runtimeWindow);
  const entry = {
    executeFormalCapture: vi.fn(options.execute ?? (async () =>
      formalHostedPayloadFixtureV1({ request, runtimeSessionId }))),
    dispose: vi.fn(async () => undefined),
  };
  const frame = startHostedFormalCaptureFrameV1({
    entry,
    shellOrigin,
    runtimeSessionId,
    sessionNonce,
    formalRequestId: request.id,
    formalRequestHash,
    protocolBudget,
  });
  const shellPort = new MessageChannel();
  const transfer = (overrides: Record<string, unknown> = {}) => {
    const event = new Event("message") as MessageEvent;
    Object.defineProperties(event, {
      origin: { value: shellOrigin },
      source: { value: parent },
      ports: { value: [shellPort.port2] },
      data: { value: {
        kind: "worldkit-hosted-formal-capture-port-transfer",
        schemaVersion: 1,
        runtimeSessionId,
        sessionNonce,
        formalRequestId: request.id,
        formalRequestHash,
        messageSequence: 1,
        ...overrides,
      } },
    });
    runtimeWindow.dispatchEvent(event);
    shellPort.port1.start();
  };
  return { frame, entry, parent, shellPort, transfer };
}

function nextMessage(port: MessagePort): Promise<unknown> {
  return new Promise((resolve) => {
    port.addEventListener("message", (event) => resolve(event.data), {
      once: true,
    });
  });
}

describe("capture-only Hosted Runtime frame", () => {
  it("accepts one exact transfer and delegates only one parsed formal request", async () => {
    const h = harness();
    h.transfer();
    await expect(nextMessage(h.shellPort.port1)).resolves.toMatchObject({
      kind: "worldkit-hosted-formal-capture-port-ready",
      messageSequence: 1,
    });
    const result = nextMessage(h.shellPort.port1);
    h.shellPort.port1.postMessage({
      kind: "worldkit-hosted-formal-capture-request",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 1,
      payload: request,
    });
    await expect(result).resolves.toMatchObject({
      kind: "worldkit-hosted-formal-capture-result",
      messageSequence: 2,
    });
    expect(h.entry.executeFormalCapture).toHaveBeenCalledOnce();
    expect(h.entry.executeFormalCapture).toHaveBeenCalledWith(request);
    expect(Object.keys(h.entry)).toEqual([
      "executeFormalCapture",
      "dispose",
    ]);
    await h.frame.dispose();
  });

  it.each([
    ["origin", {}, "http://127.0.0.1:5999"],
    ["nonce", { sessionNonce: "nonce.wrong" }, shellOrigin],
    ["sequence", { messageSequence: 2 }, shellOrigin],
    ["kind", { kind: "worldkit-hosted-runtime-port-transfer" }, shellOrigin],
    ["extra key", { extra: true }, shellOrigin],
  ])("rejects a transfer with wrong %s", async (_label, mutation, origin) => {
    const h = harness();
    const event = new Event("message") as MessageEvent;
    Object.defineProperties(event, {
      origin: { value: origin },
      source: { value: h.parent },
      ports: { value: [h.shellPort.port2] },
      data: { value: {
        kind: "worldkit-hosted-formal-capture-port-transfer",
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
    await vi.waitFor(() => expect(h.entry.dispose).toHaveBeenCalledOnce());
    expect(h.frame.isDisposed()).toBe(true);
  });

  it.each([
    ["wrong direction", {
      kind: "worldkit-hosted-formal-capture-result",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 1,
      payload: {},
    }],
    ["wrong nonce", {
      kind: "worldkit-hosted-formal-capture-request",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce: "nonce.wrong",
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 1,
      payload: request,
    }],
    ["wrong sequence", {
      kind: "worldkit-hosted-formal-capture-request",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 2,
      payload: request,
    }],
    ["oversize request", { extra: "x".repeat(2_000_000) }],
  ])("fails closed for an inbound %s", async (_label, message) => {
    const h = harness();
    h.transfer();
    await nextMessage(h.shellPort.port1);
    h.shellPort.port1.postMessage(message);
    await vi.waitFor(() => expect(h.entry.dispose).toHaveBeenCalledOnce());
    expect(h.entry.executeFormalCapture).not.toHaveBeenCalled();
  });

  it("rejects duplicate requests and provider rejection without a result", async () => {
    let release!: () => void;
    const provider = new Promise<never>((_resolve, reject) => {
      release = () => reject(new Error("private provider failure"));
    });
    const h = harness({ execute: async () => provider });
    h.transfer();
    await nextMessage(h.shellPort.port1);
    const envelope = {
      kind: "worldkit-hosted-formal-capture-request",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 1,
      payload: request,
    } as const;
    h.shellPort.port1.postMessage(envelope);
    h.shellPort.port1.postMessage(envelope);
    await vi.waitFor(() => expect(h.frame.isDisposed()).toBe(true));
    expect(h.entry.executeFormalCapture).toHaveBeenCalledOnce();
    release();

    const rejected = harness({
      execute: async () => {
        throw new Error("private provider failure");
      },
    });
    rejected.transfer();
    await nextMessage(rejected.shellPort.port1);
    const failure = nextMessage(rejected.shellPort.port1);
    rejected.shellPort.port1.postMessage(envelope);
    await expect(failure).resolves.toEqual({
      kind: "worldkit-hosted-formal-capture-failure",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 2,
      diagnosticCode: "WORLDKIT_HOSTED_FORMAL_CAPTURE_PROVIDER_REJECTED",
    });
  });

  it.each([
    "openingPng",
    "worldSidePng",
    "worldTopDownPng",
    "colliderOverlayPng",
  ] as const)("rejects an oversized %s", async (pngField) => {
    const h = harness({
      execute: async () => ({
        ...formalHostedPayloadFixtureV1({
          request,
          runtimeSessionId,
        }),
        [pngField]: new Uint8Array(
          protocolBudget.maximumPngBytesPerArtifact + 1,
        ),
      }),
    });
    h.transfer();
    await nextMessage(h.shellPort.port1);
    h.shellPort.port1.postMessage({
      kind: "worldkit-hosted-formal-capture-request",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 1,
      payload: request,
    });
    await vi.waitFor(() => expect(h.entry.dispose).toHaveBeenCalledOnce());
    expect(h.frame.isDisposed()).toBe(true);
  });

  it("rejects a total outbound message over budget", async () => {
    const base = formalHostedPayloadFixtureV1({
      request,
      runtimeSessionId,
    });
    const h = harness({
      execute: async () => ({
        ...base,
        openingObservation: {
          ...base.openingObservation,
          padding: "x".repeat(
            protocolBudget.maximumOutboundMessageBytes,
          ),
        },
      }),
    });
    h.transfer();
    await nextMessage(h.shellPort.port1);
    h.shellPort.port1.postMessage({
      kind: "worldkit-hosted-formal-capture-request",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      formalRequestId: request.id,
      formalRequestHash,
      messageSequence: 1,
      payload: request,
    });
    await vi.waitFor(() => expect(h.entry.dispose).toHaveBeenCalledOnce());
    expect(h.frame.isDisposed()).toBe(true);
  });
});
