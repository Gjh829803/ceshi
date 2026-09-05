export type CanvasRecordingState = "idle" | "recording" | "stopping";

export interface CanvasRecordingResult {
  blob: Blob;
  durationMs: number;
  extension: "mp4" | "webm";
  mimeType: string;
}

export interface CanvasRecorderOptions {
  frameRate?: number;
  width?: number;
  height?: number;
  videoBitsPerSecond?: number;
  now?: () => number;
}

export const WHITEBOX_RECORDING_WIDTH = 1280;
export const WHITEBOX_RECORDING_HEIGHT = 720;
export const WHITEBOX_RECORDING_FRAME_RATE = 24;

const MIME_TYPE_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=h264",
  "video/mp4",
] as const;

export function selectRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string {
  return MIME_TYPE_CANDIDATES.find(isTypeSupported) ?? "";
}

export function recordingExtension(mimeType: string): "mp4" | "webm" {
  return mimeType.startsWith("video/mp4") ? "mp4" : "webm";
}

export class CanvasRecorder {
  private readonly frameRate: number;
  private readonly width: number;
  private readonly height: number;
  private readonly videoBitsPerSecond: number;
  private readonly now: () => number;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private captureContext: CanvasRenderingContext2D | null = null;
  private drawTimer: number | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private stateValue: CanvasRecordingState = "idle";
  private stopPromise: Promise<CanvasRecordingResult> | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: CanvasRecorderOptions = {},
  ) {
    this.frameRate = options.frameRate ?? WHITEBOX_RECORDING_FRAME_RATE;
    this.width = options.width ?? WHITEBOX_RECORDING_WIDTH;
    this.height = options.height ?? WHITEBOX_RECORDING_HEIGHT;
    this.videoBitsPerSecond = options.videoBitsPerSecond ?? 12_000_000;
    this.now = options.now ?? (() => performance.now());
  }

  get state(): CanvasRecordingState {
    return this.stateValue;
  }

  get elapsedMs(): number {
    return this.stateValue === "idle" ? 0 : Math.max(0, this.now() - this.startedAt);
  }

  static isSupported(canvas: HTMLCanvasElement): boolean {
    return typeof canvas.captureStream === "function" && typeof MediaRecorder !== "undefined";
  }

  start(): void {
    if (this.stateValue !== "idle") throw new Error("A canvas recording is already active.");
    if (!CanvasRecorder.isSupported(this.canvas)) {
      throw new Error("当前浏览器不支持画面录制，请使用最新版 Chrome、Edge 或 Safari。");
    }

    const mimeType = selectRecordingMimeType((candidate) =>
      typeof MediaRecorder.isTypeSupported === "function"
        ? MediaRecorder.isTypeSupported(candidate)
        : false,
    );
    try {
      // Match the legacy start-time raster decision, not CSS dimensions. A
      // later Runtime resize does not replace the stream or alter its canvas;
      // direct capture does not promise a fixed encoded raster after resizing.
      if (this.canvas.width === this.width && this.canvas.height === this.height) {
        this.stream = this.canvas.captureStream(this.frameRate);
      } else {
        this.captureCanvas = this.canvas.ownerDocument.createElement("canvas");
        this.captureCanvas.width = this.width;
        this.captureCanvas.height = this.height;
        this.captureContext = this.captureCanvas.getContext("2d", { alpha: false });
        if (this.captureContext === null) {
          throw new Error("无法建立 1280×720 白膜录制画布。");
        }
        this.drawCaptureFrame();
        this.drawTimer = window.setInterval(
          () => this.drawCaptureFrame(),
          1_000 / this.frameRate,
        );
        this.stream = this.captureCanvas.captureStream(this.frameRate);
      }
      this.chunks = [];
      this.stopPromise = null;
      this.mediaRecorder = new MediaRecorder(this.stream, {
        ...(mimeType === "" ? {} : { mimeType }),
        videoBitsPerSecond: this.videoBitsPerSecond,
      });
      this.mediaRecorder.addEventListener("dataavailable", this.handleDataAvailable);
      this.mediaRecorder.start(1_000);
      this.startedAt = this.now();
      this.stateValue = "recording";
    } catch (error) {
      this.finish();
      throw error;
    }
  }

  stop(): Promise<CanvasRecordingResult> {
    if (this.stateValue === "idle" || this.mediaRecorder === null) {
      return Promise.reject(new Error("No canvas recording is active."));
    }
    if (this.stopPromise !== null) return this.stopPromise;

    const recorder = this.mediaRecorder;
    const durationMs = Math.max(0, this.now() - this.startedAt);
    this.stateValue = "stopping";
    this.stopPromise = new Promise<CanvasRecordingResult>((resolve, reject) => {
      recorder.addEventListener("error", () => {
        this.finish();
        reject(new Error("录屏失败，浏览器没有成功编码视频。"));
      }, { once: true });
      recorder.addEventListener("stop", () => {
        const mimeType = recorder.mimeType || this.chunks[0]?.type || "video/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        this.finish();
        if (blob.size === 0) {
          reject(new Error("录屏内容为空，请重试。"));
          return;
        }
        resolve({
          blob,
          durationMs,
          extension: recordingExtension(mimeType),
          mimeType,
        });
      }, { once: true });
      recorder.stop();
    });
    return this.stopPromise;
  }

  dispose(): void {
    try {
      if (this.mediaRecorder?.state !== "inactive") this.mediaRecorder?.stop();
    } finally {
      this.finish();
    }
  }

  private readonly handleDataAvailable = (event: BlobEvent): void => {
    if (event.data.size > 0) this.chunks.push(event.data);
  };

  private drawCaptureFrame(): void {
    if (this.captureContext === null) return;
    const sourceWidth = Math.max(1, this.canvas.width);
    const sourceHeight = Math.max(1, this.canvas.height);
    const scale = Math.min(this.width / sourceWidth, this.height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const offsetX = (this.width - drawWidth) / 2;
    const offsetY = (this.height - drawHeight) / 2;
    this.captureContext.fillStyle = "#000000";
    this.captureContext.fillRect(0, 0, this.width, this.height);
    this.captureContext.drawImage(this.canvas, offsetX, offsetY, drawWidth, drawHeight);
  }

  private finish(): void {
    this.mediaRecorder?.removeEventListener("dataavailable", this.handleDataAvailable);
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    if (this.drawTimer !== null) window.clearInterval(this.drawTimer);
    this.mediaRecorder = null;
    this.stream = null;
    this.captureCanvas = null;
    this.captureContext = null;
    this.drawTimer = null;
    this.chunks = [];
    this.startedAt = 0;
    this.stateValue = "idle";
    this.stopPromise = null;
  }
}
