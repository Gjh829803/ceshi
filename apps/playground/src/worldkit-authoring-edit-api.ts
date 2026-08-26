import type {
  AiSchemaProjectionRequestV1,
  RegistrySearchRequestV1,
  WorldChangeApplyRequestV1,
  WorldChangeCleanupReportQueryV1,
  WorldChangeDiffRequestV1,
  WorldChangeDryRunRequestV1,
  WorldChangeExplainRequestV1,
  WorldChangeReceiptQueryV1,
  WorldChangeValidateRequestV1,
  WorldkitAuthoringEditApiV1,
} from "@whitebox-world/authoring-edit";

export const WORLDKIT_AUTHORING_EDIT_PROTOCOL_VERSION = 1 as const;

export interface WorldkitAuthoringEditApiTargetV1 {
  __WORLDKIT_AUTHORING_EDIT__?: WorldkitAuthoringEditApiV1;
}

export interface WorldkitAuthoringEditApiInstallationV1 {
  readonly api: WorldkitAuthoringEditApiV1;
  dispose(): void;
}

export function installWorldkitAuthoringEditApi(
  target: WorldkitAuthoringEditApiTargetV1,
  port: WorldkitAuthoringEditApiV1,
): WorldkitAuthoringEditApiInstallationV1 {
  const api: WorldkitAuthoringEditApiV1 = Object.freeze({
    version: WORLDKIT_AUTHORING_EDIT_PROTOCOL_VERSION,
    projectAiSchema: (request: AiSchemaProjectionRequestV1) =>
      port.projectAiSchema(request),
    searchRegistry: (request: RegistrySearchRequestV1) =>
      port.searchRegistry(request),
    validateWorldChange: (request: WorldChangeValidateRequestV1) =>
      port.validateWorldChange(request),
    dryRunWorldChange: (request: WorldChangeDryRunRequestV1) =>
      port.dryRunWorldChange(request),
    applyWorldChange: (request: WorldChangeApplyRequestV1) =>
      port.applyWorldChange(request),
    getWorldChangeReceipt: (request: WorldChangeReceiptQueryV1) =>
      port.getWorldChangeReceipt(request),
    getWorldChangeCleanupReport: (request: WorldChangeCleanupReportQueryV1) =>
      port.getWorldChangeCleanupReport(request),
    explainWorldChange: (request: WorldChangeExplainRequestV1) =>
      port.explainWorldChange(request),
    diffWorldChange: (request: WorldChangeDiffRequestV1) =>
      port.diffWorldChange(request),
  });
  target.__WORLDKIT_AUTHORING_EDIT__ = api;
  return {
    api,
    dispose() {
      if (target.__WORLDKIT_AUTHORING_EDIT__ === api) {
        delete target.__WORLDKIT_AUTHORING_EDIT__;
      }
    },
  };
}
