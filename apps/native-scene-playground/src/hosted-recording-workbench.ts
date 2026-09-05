import type { CanvasRecordingResult } from "@whitebox-world/browser-recording/canvas-recorder";
import { downloadRecording } from "@whitebox-world/browser-recording/download";
import { installRecordingWorkbench } from "@whitebox-world/browser-recording/workbench";

export interface HostedRecordingContext {
  readonly sceneId: string;
  readonly worldPackageRootHash: string;
}

/** Shell only. Identity comes from the trusted launcher and Runtime ready event,
 * never from query parameters or an API origin supplied by the frame. */
export function installHostedRecordingWorkbench(input: {
  root: HTMLElement;
  context: HostedRecordingContext | null;
  worldPackageRootHash: string;
}): { save(result: CanvasRecordingResult): Promise<string>; dispose(): void } {
  const { context, root } = input;
  if (context && context.worldPackageRootHash !== input.worldPackageRootHash) {
    throw new Error("NATIVE_RECORDING_PACKAGE_MISMATCH");
  }
  const workbench = context ? installRecordingWorkbench({ root, sceneId: context.sceneId }) : null;
  root.hidden = workbench === null;
  let disposed = false;
  return {
    async save(result) {
      if (disposed) throw new Error("NATIVE_RECORDING_WORKBENCH_DISPOSED");
      if (!workbench) return `已下载本地录屏 · ${downloadRecording(result.blob, result.extension)}`;
      try {
        const recording = await workbench.uploadRecording(result);
        return `已保存到录制列表 · ${recording.title}`;
      } catch (error) {
        if (disposed) throw error;
        const fileName = downloadRecording(result.blob, result.extension, context!.sceneId);
        return `上传失败，已下载原始录屏备份 · ${fileName} · ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      workbench?.dispose();
      root.hidden = true;
    },
  };
}
