import { describe, expect, it, vi } from "vitest";

import {
  runCaptureOnlyHostedSessionV1,
  type CaptureOnlyHostedTransportV1,
} from "./hosted-session-capture.js";

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
