export const CONTROL_CAPTURE_PASS_IDS_V1 = [
  "neutral-color",
  "linear-depth-meters",
  "semantic-class-id",
  "instance-id",
  "world-normal",
] as const;

export type ControlCapturePassIdV1 = typeof CONTROL_CAPTURE_PASS_IDS_V1[number];

export const CONTROL_CAPTURE_PROFILE_V1 = {
  kind: "worldkit-control-capture-profile",
  schemaVersion: 1,
  resourceRef: "worldkit://capture/profile/control-video@1",
  requiredPassIds: CONTROL_CAPTURE_PASS_IDS_V1,
  encodingProfile: {
    kind: "worldkit-control-capture-encoding-profile",
    schemaVersion: 1,
    resourceRef: "worldkit://capture/encoding/web-v1@1",
    pixelOrigin: "top-left",
    passesById: {
      "neutral-color": {
        mediaType: "image/png",
        encoding: "png-rgba8-srgb",
      },
      "linear-depth-meters": {
        mediaType: "application/octet-stream",
        encoding: "float32-le",
        noHitMeters: 0,
      },
      "semantic-class-id": {
        mediaType: "application/octet-stream",
        encoding: "uint32-le",
        backgroundId: 0,
      },
      "instance-id": {
        mediaType: "application/octet-stream",
        encoding: "uint32-le",
        backgroundId: 0,
      },
      "world-normal": {
        mediaType: "application/octet-stream",
        encoding: "float32x3-le",
        coordinateSpace: "world",
      },
    },
  },
} as const;
