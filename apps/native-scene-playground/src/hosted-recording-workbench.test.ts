import { beforeEach, expect, it, vi } from "vitest";
import { installHostedRecordingWorkbench } from "./hosted-recording-workbench.js";
import { installRecordingWorkbench } from "@whitebox-world/browser-recording/workbench";
import { downloadRecording } from "@whitebox-world/browser-recording/download";

vi.mock("@whitebox-world/browser-recording/workbench", () => ({ installRecordingWorkbench: vi.fn() }));
vi.mock("@whitebox-world/browser-recording/download", () => ({ downloadRecording: vi.fn(() => "original.webm") }));
const hash = `sha256:${"a".repeat(64)}`;
const context = { sceneId: "palace", worldPackageRootHash: hash };
const result = { blob: new Blob(["original"]), extension: "webm" as const, mimeType: "video/webm", durationMs: 9100 };
beforeEach(() => vi.clearAllMocks());

it("opens the shared workbench only for the launcher's exact ready Package and uploads original bytes", async () => {
  const uploadRecording = vi.fn(async () => ({ title: "录制 01" }));
  const dispose = vi.fn();
  vi.mocked(installRecordingWorkbench).mockReturnValue({ uploadRecording, dispose, refresh: vi.fn() } as never);
  const root = { hidden: true } as HTMLElement;
  const workbench = installHostedRecordingWorkbench({ root, context, worldPackageRootHash: hash });
  expect(installRecordingWorkbench).toHaveBeenCalledWith({ root, sceneId: "palace" });
  expect(root.hidden).toBe(false);
  await expect(workbench.save(result)).resolves.toContain("已保存");
  expect(uploadRecording).toHaveBeenCalledWith(result);
  expect(downloadRecording).not.toHaveBeenCalled();
  workbench.dispose(); workbench.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  expect(root.hidden).toBe(true);
  await expect(workbench.save(result)).rejects.toThrow("DISPOSED");
});
it("rejects a different ready Package before any list or upload request", () => {
  expect(() => installHostedRecordingWorkbench({ root: {} as HTMLElement, context, worldPackageRootHash: "other" }))
    .toThrow("PACKAGE_MISMATCH");
  expect(installRecordingWorkbench).not.toHaveBeenCalled();
});
it("keeps standalone local download and does not contact Studio", async () => {
  const root = { hidden: true } as HTMLElement;
  const workbench = installHostedRecordingWorkbench({ root, context: null, worldPackageRootHash: hash });
  await expect(workbench.save(result)).resolves.toContain("已下载");
  expect(root.hidden).toBe(true);
  expect(downloadRecording).toHaveBeenCalledWith(result.blob, "webm");
  expect(installRecordingWorkbench).not.toHaveBeenCalled();
});
it("backs up original bytes on upload failure without retrying the POST", async () => {
  const uploadRecording = vi.fn().mockRejectedValue(new Error("offline"));
  vi.mocked(installRecordingWorkbench).mockReturnValue({ uploadRecording, dispose: vi.fn(), refresh: vi.fn() });
  const workbench = installHostedRecordingWorkbench({ root: {} as HTMLElement, context, worldPackageRootHash: hash });
  await expect(workbench.save(result)).resolves.toContain("上传失败，已下载原始录屏备份");
  expect(uploadRecording).toHaveBeenCalledOnce();
  expect(downloadRecording).toHaveBeenCalledWith(result.blob, "webm", "palace");
});
it("does not download a late upload failure after the page closes", async () => {
  let reject!: (error: Error) => void;
  const uploadRecording = vi.fn(() => new Promise<never>((_resolve, failed) => { reject = failed; }));
  vi.mocked(installRecordingWorkbench).mockReturnValue({ uploadRecording, dispose: vi.fn(), refresh: vi.fn() });
  const workbench = installHostedRecordingWorkbench({ root: {} as HTMLElement, context, worldPackageRootHash: hash });
  const save = workbench.save(result);
  const assertion = expect(save).rejects.toThrow("closed");
  workbench.dispose(); reject(new Error("closed"));
  await assertion;
  expect(downloadRecording).not.toHaveBeenCalled();
});
