import type { CapabilityDemoHostOverlayV1 } from "./authoring-loader.js";

export function withCapabilityDemoHostOverlay<
  TPayload extends Readonly<{ schemaVersion: number }>,
>(
  payload: TPayload,
  hostOverlay: CapabilityDemoHostOverlayV1 | undefined,
): TPayload & Readonly<{
  capabilityDemoHostOverlay?: CapabilityDemoHostOverlayV1;
}> {
  return hostOverlay === undefined
    ? payload
    : { ...payload, capabilityDemoHostOverlay: hostOverlay };
}

export function withCapabilityDemoHarnessScope<TReport>(
  report: TReport,
  hostOverlay: CapabilityDemoHostOverlayV1 | undefined,
): TReport | Readonly<{
  previewScope: Readonly<{
    kind: "motion-camera-preview";
    canonicalPackageValidation: "not-claimed";
    relationshipCapabilities: "deferred";
  }>;
  runtimeHarness: TReport;
}> {
  const relationshipsDeferred = hostOverlay?.changes.some(
    (change) => change.type === "relationship-capabilities-deferred",
  ) === true;
  return relationshipsDeferred
    ? {
        previewScope: {
          kind: "motion-camera-preview",
          canonicalPackageValidation: "not-claimed",
          relationshipCapabilities: "deferred",
        },
        runtimeHarness: report,
      }
    : report;
}
