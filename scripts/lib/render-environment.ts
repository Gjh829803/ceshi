import type { CliDiagnostic } from "./worldkit-pipeline";

export type WebglApiV1 = "webgl2" | "webgl" | "unavailable";

export type RenderEnvironmentModeV1 = "hardware" | "software" | "unknown";

export interface BrowserRenderEnvironmentV1 {
  readonly webglApi: WebglApiV1;
  readonly webglVendor: string;
  readonly webglRenderer: string;
  readonly isUnmaskedRenderer: boolean;
}

export interface RenderEnvironmentReceiptV1
  extends BrowserRenderEnvironmentV1 {
  readonly kind: "worldkit-render-environment-receipt";
  readonly schemaVersion: 1;
  readonly mode: RenderEnvironmentModeV1;
}

const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|llvmpipe|lavapipe|softpipe|software rasterizer|microsoft basic render driver/i;

export function inspectRenderEnvironmentV1(
  input: BrowserRenderEnvironmentV1,
): RenderEnvironmentReceiptV1 {
  const rendererIdentity = `${input.webglVendor} ${input.webglRenderer}`;
  const mode: RenderEnvironmentModeV1 = input.webglApi === "unavailable"
    ? "unknown"
    : SOFTWARE_RENDERER_PATTERN.test(rendererIdentity)
      ? "software"
      : !input.isUnmaskedRenderer || input.webglRenderer.trim().length === 0
        ? "unknown"
        : "hardware";

  return {
    kind: "worldkit-render-environment-receipt",
    schemaVersion: 1,
    ...input,
    mode,
  };
}

export function createRenderEnvironmentDiagnosticsV1(
  receipt: RenderEnvironmentReceiptV1,
): readonly CliDiagnostic[] {
  if (receipt.mode !== "software") return [];

  return [{
    severity: "warning",
    code: "CLI_CAPTURE_SOFTWARE_RENDERER",
    instancePath: "/renderEnvironment",
    message:
      "Capture used a software WebGL renderer; static whitebox output remains valid, but rendering performance is not representative of hardware acceleration.",
    details: {
      webglApi: receipt.webglApi,
      webglVendor: receipt.webglVendor,
      webglRenderer: receipt.webglRenderer,
      isUnmaskedRenderer: receipt.isUnmaskedRenderer,
    },
  }];
}
