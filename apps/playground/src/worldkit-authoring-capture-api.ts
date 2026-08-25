import {
  WORLDKIT_AUTHORING_CAPTURE_PROTOCOL_VERSION,
  type RuntimeCaptureTargetV1,
  type WhiteboxTriviewCaptureV1,
  type WorldkitAuthoringCaptureApiV1,
} from "@whitebox-world/runtime-contracts";

export interface WorldkitAuthoringCaptureRuntimeAdapterV1 {
  configureVisualCaptureTargets(
    targets: readonly RuntimeCaptureTargetV1[],
  ): readonly RuntimeCaptureTargetV1[];
  listCaptureTargets(): readonly RuntimeCaptureTargetV1[];
  captureRuntimeWhiteboxTriview(targetId: string): WhiteboxTriviewCaptureV1;
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
    configureVisualCaptureTargets: (targets: readonly RuntimeCaptureTargetV1[]) =>
      adapter.configureVisualCaptureTargets(targets),
    listCaptureTargets: () => adapter.listCaptureTargets(),
    captureWhiteboxTriview: (targetId: string) =>
      adapter.captureRuntimeWhiteboxTriview(targetId),
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
