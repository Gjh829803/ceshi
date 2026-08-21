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
