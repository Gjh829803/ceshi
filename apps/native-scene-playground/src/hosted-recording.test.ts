import { afterEach, describe, expect, it, vi } from "vitest";
import { attachHostedRecordingServer, createHostedRecordingClient, HOSTED_RECORDING_CHUNK_BYTES } from "./hosted-recording.js";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
function fixture(size = HOSTED_RECORDING_CHUNK_BYTES * 2 + 17) {
  const bytes = Uint8Array.from({ length: size }, (_, i) => i % 251);
  const result = { blob: new Blob([bytes], { type: "video/webm;codecs=vp9" }),
    mimeType: "video/webm;codecs=vp9", extension: "webm" as const, durationMs: 1256.5 };
  const recorder = { start: vi.fn(), stop: vi.fn(async () => result), dispose: vi.fn() };
  const create = vi.fn(() => recorder);
  const channel = new MessageChannel();
  const server = attachHostedRecordingServer(channel.port2, create);
  const client = createHostedRecordingClient(channel.port1);
  cleanups.push(() => { client.dispose(); server.dispose(); });
  return { client, server, recorder, create, bytes, result };
}

describe("Native hosted recording media port", () => {
  it.each([1, HOSTED_RECORDING_CHUNK_BYTES, HOSTED_RECORDING_CHUNK_BYTES * 2 + 17])(
    "delivers all %i original bytes and duration without changing encoding", async size => {
      const { client, recorder, create, bytes, result } = fixture(size);
      expect(create).not.toHaveBeenCalled();
      await client.start();
      expect(client.state).toBe("recording");
      const received = await client.stop();
      expect(new Uint8Array(await received.blob.arrayBuffer())).toEqual(bytes);
      expect(received).toMatchObject({ durationMs: result.durationMs, mimeType: result.mimeType, extension: "webm" });
      expect(client.state).toBe("idle");
      await client.start(); await client.stop();
      expect(create).toHaveBeenCalledOnce();
      expect(recorder.start).toHaveBeenCalledTimes(2);
    },
  );
  it("does not issue duplicate start or stop commands while one is pending", async () => {
    const { client, recorder } = fixture();
    const starting = client.start();
    await expect(client.start()).rejects.toThrow("STATE_CONFLICT");
    await starting;
    const stopping = client.stop();
    await expect(client.stop()).rejects.toThrow("STATE_CONFLICT");
    await stopping;
    expect(recorder.start).toHaveBeenCalledOnce();
    expect(recorder.stop).toHaveBeenCalledOnce();
  });
  it.each(["start", "stop"] as const)("retains a failed %s and allows an explicit next recording", async failure => {
    const { client, recorder } = fixture();
    if (failure === "start") recorder.start.mockImplementationOnce(() => { throw new Error("encoder unavailable"); });
    else { await client.start(); recorder.stop.mockRejectedValueOnce(new Error("encoder unavailable")); }
    await expect(client[failure]()).rejects.toThrow("encoder unavailable");
    expect(client.state).toBe("idle");
    await client.start(); await client.stop();
    expect(recorder.dispose).toHaveBeenCalledOnce();
  });
  it("rejects a pending stop on shell disposal and never delivers late bytes", async () => {
    const { client, recorder, result } = fixture();
    let resolve!: (value: typeof result) => void;
    recorder.stop.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await client.start();
    const stopped = client.stop();
    const rejected = expect(stopped).rejects.toThrow("DISPOSED");
    await vi.waitFor(() => expect(recorder.stop).toHaveBeenCalledOnce());
    client.dispose();
    await rejected;
    await vi.waitFor(() => expect(recorder.dispose).toHaveBeenCalledOnce());
    resolve(result);
    expect(client.state).toBe("disposed");
  });
  it("frame disposal rejects a pending start and closes only the media channel", async () => {
    const { client, server, create } = fixture();
    const onDisposed = vi.fn(); client.onDisposed(onDisposed);
    const pending = client.start();
    const rejected = expect(pending).rejects.toThrow("DISPOSED");
    server.dispose();
    await rejected;
    expect(onDisposed).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });
  it("isolates two sessions and their exact output bytes", async () => {
    const a = fixture(13); const b = fixture(27);
    await Promise.all([a.client.start(), b.client.start()]);
    const [ar, br] = await Promise.all([a.client.stop(), b.client.stop()]);
    expect(ar.blob.size).toBe(13); expect(br.blob.size).toBe(27);
    a.client.dispose();
    await b.client.start(); await b.client.stop();
  });
  it.each(["request", "offset", "oversized", "extra-field"])("rejects %s corruption in a media reply", async mutation => {
    const channel = new MessageChannel();
    const client = createHostedRecordingClient(channel.port1);
    cleanups.push(() => { client.dispose(); channel.port2.close(); });
    channel.port2.addEventListener("message", event => {
      const request = event.data;
      if (request.type === "start") channel.port2.postMessage({ type: "started", requestId: request.requestId });
      if (request.type === "stop") channel.port2.postMessage({ type: "recorded", requestId: request.requestId,
        metadata: { sizeBytes: 3, durationMs: 100, mimeType: "video/webm", extension: "webm" } });
      if (request.type === "read") channel.port2.postMessage({ type: "chunk", requestId: mutation === "request" ? 7 : request.requestId,
        offsetBytes: mutation === "offset" ? 1 : 0, bytes: new ArrayBuffer(mutation === "oversized" ? HOSTED_RECORDING_CHUNK_BYTES + 1 : 3),
        ...(mutation === "extra-field" ? { url: "https://not-a-media-contract.invalid" } : {}) });
    });
    channel.port2.start();
    await client.start();
    await expect(client.stop()).rejects.toThrow("MESSAGE_INVALID");
    expect(client.state).toBe("disposed");
  });
  it("retains a completed Blob until the shell asks for each bounded chunk", async () => {
    const channel = new MessageChannel();
    const result = fixture().result;
    const recorder = { start() {}, stop: async () => result, dispose: vi.fn() };
    const server = attachHostedRecordingServer(channel.port2, () => recorder);
    cleanups.push(() => { server.dispose(); channel.port1.close(); });
    const messages: Record<string, unknown>[] = [];
    channel.port1.addEventListener("message", event => messages.push(event.data)); channel.port1.start();
    channel.port1.postMessage({ type: "start", requestId: 1 });
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    channel.port1.postMessage({ type: "stop", requestId: 2 });
    await vi.waitFor(() => expect(messages).toHaveLength(2));
    expect(messages[1]?.type).toBe("recorded");
    channel.port1.postMessage({ type: "read", requestId: 2, offsetBytes: 0 });
    await vi.waitFor(() => expect(messages).toHaveLength(3));
    expect((messages[2]?.bytes as ArrayBuffer).byteLength).toBe(HOSTED_RECORDING_CHUNK_BYTES);
    channel.port1.postMessage({ type: "read", requestId: 2, offsetBytes: 0 });
    await vi.waitFor(() => expect(recorder.dispose).toHaveBeenCalledOnce());
    expect(messages.filter(m => m.type === "chunk")).toHaveLength(1);
  });
  it.each(["empty", "nonfinite-duration", "wrong-mime", "extra-field"])("rejects %s metadata without requesting bytes", async mutation => {
    const channel = new MessageChannel();
    const client = createHostedRecordingClient(channel.port1);
    cleanups.push(() => { client.dispose(); channel.port2.close(); });
    const read = vi.fn();
    channel.port2.addEventListener("message", event => {
      const request = event.data;
      if (request.type === "start") channel.port2.postMessage({ type: "started", requestId: request.requestId });
      if (request.type === "stop") channel.port2.postMessage({ type: "recorded", requestId: request.requestId,
        metadata: { sizeBytes: mutation === "empty" ? 0 : 5, durationMs: mutation === "nonfinite-duration" ? Infinity : 123,
          mimeType: mutation === "wrong-mime" ? "text/html" : "video/webm", extension: "webm",
          ...(mutation === "extra-field" ? { sceneId: "untrusted-scene" } : {}) } });
      if (request.type === "read") read();
    }); channel.port2.start();
    await client.start();
    await expect(client.stop()).rejects.toThrow("MESSAGE_INVALID");
    expect(read).not.toHaveBeenCalled();
  });
});
