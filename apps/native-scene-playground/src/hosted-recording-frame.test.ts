import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveRuntimeSessionEventIdV1, deriveRuntimeSessionReceiptIdV1, WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1 } from "@whitebox-world/runtime-contracts";
import { createHostedRecordingClient } from "./hosted-recording.js";
import { startHostedRuntimeFrameV1 } from "./hosted-runtime-frame.js";

afterEach(() => vi.unstubAllGlobals());
function recordingFrame() {
  const runtimeSessionId = "native-recording-test";
  const sessionNonce = "native-recording-nonce";
  const shellOrigin = "http://127.0.0.1:5174";
  const parent = { postMessage: vi.fn() };
  const frameWindow = Object.assign(new EventTarget(), { parent });
  vi.stubGlobal("window", frameWindow);
  const order: string[] = [];
  const recorder = { start: vi.fn(), stop: vi.fn(async () => ({
    blob: new Blob(["actual-recording-result"], { type: "video/webm" }),
    extension: "webm" as const, mimeType: "video/webm", durationMs: 1250,
  })), dispose: vi.fn(() => { order.push("media"); }) };
  const createRecorder = vi.fn(() => recorder);
  const entry = { runtimeSessionId,
    dispose: vi.fn(async () => { order.push("runtime"); }),
    submit: vi.fn(async (request: { id: string }) => {
      const body = { kind: "worldkit-runtime-session-receipt", schemaVersion: 1,
        requestId: request.id, requestHash: `sha256:${"c".repeat(64)}`,
        runtimeSessionId, worldSessionId: "world.recording-test", requestType: "session.close", status: "succeeded",
        closeResult: { mode: "closed" } } as const;
      return { ...body, id: deriveRuntimeSessionReceiptIdV1(body) };
    }),
  };
  const body = { kind: "worldkit-runtime-session-event", schemaVersion: 1, protocolVersion: 1,
    sequence: 1, runtimeSessionId, worldSessionId: "world.recording-test", type: "ready",
    runtimeSessionUri: `worldkit://runtime-session/${runtimeSessionId}`,
    worldPackageRef: `package://world-package/sha256/${"a".repeat(64)}`,
    worldPackageRootHash: `sha256:${"a".repeat(64)}`, worldBuildIdentityHash: `sha256:${"b".repeat(64)}`,
    fixedInputControllerEntityId: "controller", supportedRequestTypes: WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1 } as const;
  const frame = startHostedRuntimeFrameV1({ runtimeSessionId, sessionNonce, shellOrigin,
    entry: entry as unknown as Parameters<typeof startHostedRuntimeFrameV1>[0]["entry"],
    readyEvent: { ...body, id: deriveRuntimeSessionEventIdV1(body) }, createRecorder,
    protocolBudget: { maximumInboundMessageBytes: 100_000, maximumOutboundMessageBytes: 100_000,
      maximumReceiptBytes: 100_000, maximumDiagnosticCount: 10, maximumLogBytes: 100_000 },
  });
  const runtimeChannel = new MessageChannel(); const mediaChannel = new MessageChannel();
  const client = createHostedRecordingClient(mediaChannel.port1);
  function transfer(mutation = "none") {
    const event = new Event("message");
    Object.defineProperties(event, {
      origin: { value: mutation === "origin" ? "http://127.0.0.1:9" : shellOrigin },
      source: { value: mutation === "source" ? {} : parent },
      ports: { value: mutation === "missing-media" ? [runtimeChannel.port2] : [runtimeChannel.port2, mediaChannel.port2] },
      data: { value: { kind: "worldkit-hosted-runtime-port-transfer", schemaVersion: 1, runtimeSessionId,
        sessionNonce: mutation === "nonce" ? "wrong" : sessionNonce, messageSequence: 1 } },
    });
    frameWindow.dispatchEvent(event);
  }
  return { frame, client, recorder, createRecorder, entry, order, transfer, runtimeChannel,
    runtimeSessionId, sessionNonce,
    async dispose() { client.dispose(); await frame.dispose(); runtimeChannel.port1.close(); runtimeChannel.port2.close(); mediaChannel.port2.close(); },
  };
}

describe("Hosted frame recording installation", () => {
  it.each(["origin", "source", "nonce", "missing-media"])("rejects %s before creating a recorder", async mutation => {
    const f = recordingFrame();
    try {
      f.transfer(mutation);
      await vi.waitFor(() => expect(f.entry.dispose).toHaveBeenCalledOnce());
      expect(f.createRecorder).not.toHaveBeenCalled();
      expect(f.frame.isDisposed()).toBe(true);
    } finally { await f.dispose(); }
  });
  it("keeps Runtime requests on their original port and disposes recording before Runtime", async () => {
    const f = recordingFrame();
    try {
      f.transfer();
      await f.client.start();
      expect(await (await f.client.stop()).blob.text()).toBe("actual-recording-result");
      await f.client.start();
      f.runtimeChannel.port1.postMessage({ kind: "native-isolation-transport-envelope", schemaVersion: 1,
        runtimeSessionId: f.runtimeSessionId, sessionNonce: f.sessionNonce, messageSequence: 1,
        payload: { kind: "worldkit-runtime-session-request", schemaVersion: 1,
          id: "close-recording-runtime", runtimeSessionId: f.runtimeSessionId, type: "session.close" } });
      await vi.waitFor(() => expect(f.entry.dispose).toHaveBeenCalledOnce());
      expect(f.entry.submit).toHaveBeenCalledOnce();
      expect(f.order).toEqual(["media", "runtime"]);
      await vi.waitFor(() => expect(f.client.state).toBe("disposed"));
    } finally { await f.dispose(); }
  });
});
