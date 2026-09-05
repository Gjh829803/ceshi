import type { CanvasRecorder, CanvasRecordingResult } from
  "@whitebox-world/browser-recording/canvas-recorder";

// A private media port is transferred with the existing origin/session/nonce
// handshake. It never carries Runtime requests, URLs, Studio ids or credentials.
// Pull one bounded chunk at a time; retain the old recorder's in-memory Blob and
// upload policy instead of inventing a new duration/whole-recording size gate.
export const HOSTED_RECORDING_CHUNK_BYTES = 64 * 1024;
type Recorder = Pick<CanvasRecorder, "start" | "stop" | "dispose">;
type RecordingState = "idle" | "starting" | "recording" | "stopping" | "disposed";

function fields(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === names.length && keys.every(key => typeof key === "string" && names.includes(key));
}

function validMetadata(value: unknown): value is Omit<CanvasRecordingResult, "blob"> & { sizeBytes: number } {
  if (!fields(value, ["sizeBytes", "durationMs", "extension", "mimeType"])) return false;
  return Number.isSafeInteger(value.sizeBytes) && Number(value.sizeBytes) > 0 &&
    typeof value.durationMs === "number" && Number.isFinite(value.durationMs) && value.durationMs >= 0 &&
    typeof value.mimeType === "string" && value.mimeType.length <= 128 &&
    (value.extension === "webm" && /^video\/webm(?:;|$)/.test(value.mimeType) ||
      value.extension === "mp4" && /^video\/mp4(?:;|$)/.test(value.mimeType));
}

export interface HostedRecordingClient {
  readonly state: RecordingState;
  start(): Promise<void>;
  stop(): Promise<CanvasRecordingResult>;
  onDisposed(listener: () => void): () => void;
  dispose(): void;
}

export function createHostedRecordingClient(port: MessagePort): HostedRecordingClient {
  let state: RecordingState = "idle";
  let requestId = 0;
  let pending: { resolve: (value?: CanvasRecordingResult) => void; reject: (error: Error) => void } | undefined;
  let metadata: (Omit<CanvasRecordingResult, "blob"> & { sizeBytes: number }) | undefined;
  let chunks: Uint8Array<ArrayBuffer>[] = [];
  let receivedBytes = 0;
  const disposalListeners = new Set<() => void>();

  function close(message = "WORLDKIT_RECORDING_DISPOSED"): void {
    if (state === "disposed") return;
    state = "disposed";
    port.removeEventListener("message", receive);
    port.removeEventListener("messageerror", onMessageError);
    try { port.postMessage({ type: "dispose" }); } catch { /* Peer already gone. */ }
    port.close();
    pending?.reject(new Error(message));
    pending = undefined;
    metadata = undefined;
    chunks = [];
    for (const listener of disposalListeners) {
      try { listener(); } catch { /* Finish closing other observers. */ }
    }
    disposalListeners.clear();
  }
  const onMessageError = (): void => close("WORLDKIT_RECORDING_MESSAGE_INVALID");
  function receive(event: MessageEvent): void {
    if (state === "disposed") return;
    const value = event.data;
    if (fields(value, ["type"]) && value.type === "disposed") { close(); return; }
    if (pending === undefined || value?.requestId !== requestId) { onMessageError(); return; }
    if (fields(value, ["type", "requestId", "message"]) && value.type === "failed" &&
        typeof value.message === "string" && value.message.length <= 1024) {
      const failed = pending;
      pending = undefined; metadata = undefined; chunks = []; state = "idle";
      failed.reject(new Error(value.message));
      return;
    }
    if (state === "starting" && fields(value, ["type", "requestId"]) && value.type === "started") {
      state = "recording";
      const done = pending; pending = undefined; done.resolve();
      return;
    }
    if (state !== "stopping") { onMessageError(); return; }
    if (fields(value, ["type", "requestId", "metadata"]) && value.type === "recorded" &&
        metadata === undefined && validMetadata(value.metadata)) {
      metadata = value.metadata;
      port.postMessage({ type: "read", requestId, offsetBytes: 0 });
      return;
    }
    if (!fields(value, ["type", "requestId", "offsetBytes", "bytes"]) || value.type !== "chunk" ||
        metadata === undefined || value.offsetBytes !== receivedBytes || !(value.bytes instanceof ArrayBuffer) ||
        value.bytes.byteLength !== Math.min(HOSTED_RECORDING_CHUNK_BYTES, metadata.sizeBytes - receivedBytes)) {
      onMessageError(); return;
    }
    chunks.push(new Uint8Array(value.bytes));
    receivedBytes += value.bytes.byteLength;
    if (receivedBytes < metadata.sizeBytes) {
      port.postMessage({ type: "read", requestId, offsetBytes: receivedBytes });
    } else {
      const result: CanvasRecordingResult = {
        blob: new Blob(chunks, { type: metadata.mimeType }),
        durationMs: metadata.durationMs, extension: metadata.extension, mimeType: metadata.mimeType,
      };
      const done = pending; pending = undefined; metadata = undefined; chunks = []; state = "idle";
      done.resolve(result);
    }
  }
  function request(type: "start" | "stop"): Promise<CanvasRecordingResult | undefined> {
    if (state !== (type === "start" ? "idle" : "recording")) {
      return Promise.reject(new Error("WORLDKIT_RECORDING_STATE_CONFLICT"));
    }
    state = type === "start" ? "starting" : "stopping";
    receivedBytes = 0;
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      try { port.postMessage({ type, requestId: ++requestId }); }
      catch { onMessageError(); }
    });
  }
  port.addEventListener("message", receive);
  port.addEventListener("messageerror", onMessageError);
  port.start();
  return {
    get state() { return state; },
    async start() { await request("start"); },
    async stop() { return (await request("stop"))!; },
    onDisposed(listener) {
      if (state === "disposed") listener();
      else disposalListeners.add(listener);
      return () => { disposalListeners.delete(listener); };
    },
    dispose: () => close(),
  };
}

export function attachHostedRecordingServer(port: MessagePort, createRecorder: () => Recorder): { dispose(): void } {
  let recorder: Recorder | undefined;
  let recording = false;
  let disposed = false;
  let busy = false;
  let requestId = 0;
  let recorded: CanvasRecordingResult | undefined;
  let offsetBytes = 0;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    port.removeEventListener("message", receive);
    port.removeEventListener("messageerror", dispose);
    try { port.postMessage({ type: "disposed" }); } catch { /* Peer already gone. */ }
    port.close();
    try { recorder?.dispose(); } catch { /* Media cleanup must not dispose Runtime. */ }
    recorder = undefined; recorded = undefined;
  }
  async function handle(value: unknown): Promise<void> {
    if (disposed) return;
    if (fields(value, ["type"]) && value.type === "dispose") { dispose(); return; }
    if (busy) { dispose(); return; }
    if (fields(value, ["type", "requestId", "offsetBytes"]) && value.type === "read" &&
        recorded !== undefined && value.requestId === requestId && value.offsetBytes === offsetBytes &&
        offsetBytes < recorded.blob.size) {
      busy = true;
      const bytes = await recorded.blob.slice(offsetBytes, offsetBytes + HOSTED_RECORDING_CHUNK_BYTES).arrayBuffer();
      if (disposed) return;
      const chunkSizeBytes = bytes.byteLength;
      port.postMessage({ type: "chunk", requestId, offsetBytes, bytes }, [bytes]);
      offsetBytes += chunkSizeBytes;
      if (offsetBytes === recorded.blob.size) recorded = undefined;
      busy = false;
      return;
    }
    if (!fields(value, ["type", "requestId"]) || !["start", "stop"].includes(String(value.type)) ||
        value.requestId !== requestId + 1 || recorded !== undefined) { dispose(); return; }
    requestId += 1;
    busy = true;
    try {
      if (value.type === "start") {
        if (recording) throw new Error("WORLDKIT_RECORDING_STATE_CONFLICT");
        recorder ??= createRecorder();
        recorder.start(); recording = true;
        port.postMessage({ type: "started", requestId });
      } else {
        if (!recording || recorder === undefined) throw new Error("WORLDKIT_RECORDING_STATE_CONFLICT");
        const result = await recorder.stop();
        if (disposed) return;
        const metadata = { sizeBytes: result.blob.size, durationMs: result.durationMs,
          extension: result.extension, mimeType: result.mimeType };
        if (!validMetadata(metadata)) throw new Error("WORLDKIT_RECORDING_RESULT_INVALID");
        recording = false; recorded = result; offsetBytes = 0;
        port.postMessage({ type: "recorded", requestId, metadata });
      }
    } catch (error) {
      if (!disposed) {
        recording = false; recorded = undefined;
        try { recorder?.dispose(); } catch { /* Preserve the recording error. */ }
        recorder = undefined;
        port.postMessage({ type: "failed", requestId,
          message: (error instanceof Error ? error.message : String(error)).slice(0, 1024) });
      }
    } finally { busy = false; }
  }
  function receive(event: MessageEvent): void { void handle(event.data).catch(() => dispose()); }
  port.addEventListener("message", receive);
  port.addEventListener("messageerror", dispose);
  port.start();
  return { dispose };
}
