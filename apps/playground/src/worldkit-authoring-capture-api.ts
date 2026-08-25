import {
  WORLDKIT_AUTHORING_CAPTURE_PROTOCOL_VERSION,
  type VisualCaptureGroupV1,
  type WhiteboxTriviewCaptureV1,
  type WorldkitAuthoringCaptureApiV1,
} from "@whitebox-world/runtime-contracts";

export interface WorldkitAuthoringCaptureRuntimeAdapterV1 {
  configureVisualCaptureGroups(
    groups: readonly VisualCaptureGroupV1[],
  ): readonly VisualCaptureGroupV1[];
  listVisualCaptureGroups(): readonly VisualCaptureGroupV1[];
  captureRuntimeWhiteboxTriview(visualTargetId: string): WhiteboxTriviewCaptureV1;
}

export interface WorldkitAuthoringCaptureApiTargetV1 {
  __WORLDKIT_AUTHORING_CAPTURE__?: WorldkitAuthoringCaptureApiV1;
}

export interface WorldkitAuthoringCaptureApiInstallationV1 {
  readonly api: WorldkitAuthoringCaptureApiV1;
  dispose(): void;
}

export function installWorldkitAuthoringCaptureApi(
  target: WorldkitAuthoringCaptureApiTargetV1,
  adapter: WorldkitAuthoringCaptureRuntimeAdapterV1,
): WorldkitAuthoringCaptureApiInstallationV1 {
  const api: WorldkitAuthoringCaptureApiV1 = Object.freeze({
    version: WORLDKIT_AUTHORING_CAPTURE_PROTOCOL_VERSION,
    configureVisualCaptureGroups: (groups: readonly VisualCaptureGroupV1[]) =>
      adapter.configureVisualCaptureGroups(groups),
    listVisualCaptureGroups: () => adapter.listVisualCaptureGroups(),
    captureWhiteboxTriview: (visualTargetId: string) =>
      adapter.captureRuntimeWhiteboxTriview(visualTargetId),
  });
  target.__WORLDKIT_AUTHORING_CAPTURE__ = api;
  return {
    api,
    dispose() {
      if (target.__WORLDKIT_AUTHORING_CAPTURE__ === api) {
        delete target.__WORLDKIT_AUTHORING_CAPTURE__;
      }
    },
  };
}
