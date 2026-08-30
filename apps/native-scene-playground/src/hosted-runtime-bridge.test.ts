import { describe, expect, it, vi } from "vitest";

import {
  deriveRuntimeSessionEventIdV1,
  type RuntimeSessionEventV1,
} from "@whitebox-world/runtime-contracts";

import { createHostedRuntimeBridgeV1 } from "./hosted-runtime-bridge";

const runtimeOrigin = "http://127.0.0.1:5175";
const runtimeSessionId = "runtime.hosted.browser.001";
const sessionNonce = "nonce.hosted.browser.001";
const protocolBudget = {
  maximumInboundMessageBytes: 100_000,
  maximumOutboundMessageBytes: 100_000,
  maximumReceiptBytes: 100_000,
  maximumDiagnosticCount: 10,
  maximumLogBytes: 100_000,
} as const;

function readyEvent(): RuntimeSessionEventV1 {
  const body = {
    kind: "worldkit-runtime-session-event",
    schemaVersion: 1,
    protocolVersion: 1,
    sequence: 1,
    runtimeSessionId,
    worldSessionId: `${runtimeSessionId}.world.1`,
    type: "ready",
    runtimeSessionUri: `worldkit://runtime-session/${runtimeSessionId}`,
    worldPackageRef: `package://world-package/sha256/${"a".repeat(64)}`,
    worldPackageRootHash: `sha256:${"a".repeat(64)}`,
    worldBuildIdentityHash: `sha256:${"b".repeat(64)}`,
    fixedInputControllerEntityId: "controller.001",
    supportedRequestTypes: [
      "gameplay-command.execute",
      "fixed-input.run",
      "snapshot.get",
      "events.get",
      "session.close",
    ],
  } as const;
  return { ...body, id: deriveRuntimeSessionEventIdV1(body) };
}

function harness() {
  const shellWindow = new EventTarget();
  vi.stubGlobal("window", shellWindow);
  const postMessage = vi.fn();
  const contentWindow = { postMessage } as unknown as Window;
  const remove = vi.fn();
  const attributes = new Map<string, string>();
  const frameEvents = new EventTarget();
  const frame = {
    contentWindow,
    isConnected: true,
    credentialless: false,
    remove,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    addEventListener: frameEvents.addEventListener.bind(frameEvents),
    removeEventListener: frameEvents.removeEventListener.bind(frameEvents),
    dispatchEvent: frameEvents.dispatchEvent.bind(frameEvents),
  } as unknown as HTMLIFrameElement;
  const bridge = createHostedRuntimeBridgeV1({
    frame,
    runtimeOrigin,
    runtimeSessionId,
    sessionNonce,
    protocolBudget,
  });
  const messageEvent = (
    origin: string,
    source: Window,
    data: unknown,
  ): MessageEvent => {
    const event = new Event("message") as MessageEvent;
    Object.defineProperties(event, {
      origin: { value: origin },
      source: { value: source },
      data: { value: data },
    });
    return event;
  };
  const bootstrap = (overrides: Record<string, unknown> = {}) => {
    shellWindow.dispatchEvent(messageEvent(
      runtimeOrigin,
      contentWindow,
      {
        kind: "worldkit-hosted-runtime-frame-ready",
        schemaVersion: 1,
        runtimeSessionId,
        sessionNonce,
        messageSequence: 1,
        ...overrides,
      },
    ));
  };
  return {
    bridge,
    bootstrap,
    postMessage,
    frame,
    remove,
    contentWindow,
    messageEvent,
  };
}

describe("Hosted Runtime browser bridge", () => {
  it("uses an exact cross-origin sandbox and transfers one MessagePort to an exact targetOrigin", () => {
    const { bridge, bootstrap, postMessage, frame } = harness();
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(Reflect.get(frame, "credentialless")).toBe(true);
    bootstrap();
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0]?.[1]).toBe(runtimeOrigin);
    expect(postMessage.mock.calls[0]?.[2]).toHaveLength(1);
    expect(postMessage.mock.calls[0]?.[2]?.[0]).toBeInstanceOf(MessagePort);
    bridge.dispose();
  });

  it.each([
    ["wrong origin", { origin: "http://127.0.0.1:5999" }],
    ["wrong source", { source: {} as Window }],
    ["wrong nonce", { data: { sessionNonce: "nonce.wrong" } }],
    ["additional key", { data: { unexpected: true } }],
  ])("fails closed for %s", (_label, rawMutation) => {
    const mutation = rawMutation as Readonly<{
      origin?: string;
      source?: Window;
      data?: Readonly<Record<string, unknown>>;
    }>;
    const { bridge, remove, contentWindow, messageEvent } = harness();
    const data = {
      kind: "worldkit-hosted-runtime-frame-ready",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      messageSequence: 1,
      ...(mutation.data ?? {}),
    };
    window.dispatchEvent(messageEvent(
      mutation.origin ?? runtimeOrigin,
      mutation.source ?? contentWindow,
      data,
    ));
    expect(bridge.phase()).toBe("terminated");
    expect(remove).toHaveBeenCalledOnce();
  });

  it("terminates duplicate ready and frame navigation", async () => {
    const first = harness();
    first.bootstrap();
    const transferred = first.postMessage.mock.calls[0]?.[2]?.[0] as MessagePort;
    for (const messageSequence of [2, 3]) {
      transferred.postMessage({
        kind: "native-isolation-transport-envelope",
        schemaVersion: 1,
        runtimeSessionId,
        sessionNonce,
        messageSequence,
        payload: readyEvent(),
      });
    }
    await vi.waitFor(() => {
      expect(first.bridge.phase()).toBe("terminated");
    });
    expect(first.remove).toHaveBeenCalledOnce();

    const second = harness();
    second.bootstrap();
    second.frame.dispatchEvent(new Event("load"));
    expect(second.bridge.phase()).toBe("bootstrapping");
    second.frame.dispatchEvent(new Event("load"));
    expect(second.bridge.phase()).toBe("terminated");
    expect(second.remove).toHaveBeenCalledOnce();
  });

  it("rejects submit before Runtime ready and after dispose", async () => {
    const { bridge } = harness();
    const request = {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "request.snapshot.001",
      runtimeSessionId,
      type: "snapshot.get",
    } as const;
    await expect(bridge.submit(request)).rejects.toThrow("NOT_READY");
    bridge.dispose();
    await expect(bridge.submit(request)).rejects.toThrow("DISPOSED");
  });

  it("fails closed when the first port envelope reuses the bootstrap sequence", async () => {
    const { bridge, bootstrap, postMessage, remove } = harness();
    bootstrap();
    const transferred = postMessage.mock.calls[0]?.[2]?.[0] as MessagePort;
    transferred.postMessage({
      kind: "native-isolation-transport-envelope",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      messageSequence: 1,
      payload: readyEvent(),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bridge.phase()).toBe("terminated");
    expect(remove).toHaveBeenCalledOnce();
  });

  it.each([
    ["oversized", { oversized: "x".repeat(200_000) }],
    ["wrong payload direction", {
      kind: "native-isolation-transport-envelope",
      schemaVersion: 1,
      runtimeSessionId,
      sessionNonce,
      messageSequence: 2,
      payload: {
        kind: "worldkit-runtime-session-request",
        schemaVersion: 1,
        id: "request.wrong-direction.001",
        runtimeSessionId,
        type: "snapshot.get",
      },
    }],
  ])("terminates a %s port message", async (_label, message) => {
    const { bridge, bootstrap, postMessage, remove } = harness();
    bootstrap();
    const transferred = postMessage.mock.calls[0]?.[2]?.[0] as MessagePort;
    transferred.postMessage(message);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bridge.phase()).toBe("terminated");
    expect(remove).toHaveBeenCalledOnce();
  });
});
