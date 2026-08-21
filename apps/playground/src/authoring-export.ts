import type { CapabilityDemoHostOverlayV1 } from "./authoring-loader.js";

const SOURCE_COMMIT_ENDPOINT = "/__worldkit/source-commit";
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const FORGED_ZERO_SOURCE_COMMIT = "0".repeat(40);

export async function loadTrustedSourceCommitV1(
  fetchSource: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchSource(SOURCE_COMMIT_ENDPOINT, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      "WORLDKIT_SOURCE_COMMIT_UNTRUSTED: host did not provide a commit id.",
    );
  }
  const body = await response.json() as { sourceCommit?: unknown };
  if (
    typeof body.sourceCommit !== "string" ||
    !COMMIT_PATTERN.test(body.sourceCommit) ||
    body.sourceCommit === FORGED_ZERO_SOURCE_COMMIT
  ) {
    throw new Error(
      "WORLDKIT_SOURCE_COMMIT_UNTRUSTED: host commit id is forged or malformed.",
    );
  }
  return body.sourceCommit;
}

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
