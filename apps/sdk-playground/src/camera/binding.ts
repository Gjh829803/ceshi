import type {CameraInspection,CameraOpeningConfiguration} from "@worldkit/three";
import type {CameraEditorState} from "./editor-state";
import type {CameraFileClient} from "./file-client";
export interface CameraEditorBinding {
  state: CameraEditorState;
  client: CameraFileClient | null;
  rebind(): void;
  setPerformanceEnabled?(enabled: boolean): void;
  inspect?(): CameraInspection;
  subscribeInspection?(listener: (inspection: CameraInspection) => void): () => void;
  preview(host: HTMLElement): {
    opening(): CameraOpeningConfiguration;
    dispose(): void;
  };
}
