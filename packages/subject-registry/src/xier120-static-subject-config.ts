export interface StaticSubjectBakeConfigV1 {
  readonly sourceId: `${string}.${string}`;
  readonly scaleToMeters: number;
  readonly rotateXYZRadians: readonly [number, number, number];
  readonly expectedForward: "-Z";
  readonly displayColorHex: `#${string}`;
}

function explicitRotationXYZRadians(
  x: number,
  y: number,
  z: number,
): readonly [number, number, number] {
  return Object.freeze([x, y, z]);
}

export const xier120StaticSubjectBakeConfigs = Object.freeze([
  Object.freeze({
    sourceId: "xier120.aerial-cockpit",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#7aa6c2",
  }),
  Object.freeze({
    sourceId: "xier120.aerial-hanging",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#7995b8",
  }),
  Object.freeze({
    sourceId: "xier120.aerial-seated",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#688fb3",
  }),
  Object.freeze({
    sourceId: "xier120.aerial-seated-variant",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#5f82a4",
  }),
  Object.freeze({
    sourceId: "xier120.aerial-standing",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#85adc6",
  }),
  Object.freeze({
    sourceId: "xier120.biped-animal",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, 0, 0),
    expectedForward: "-Z",
    displayColorHex: "#7c9a72",
  }),
  Object.freeze({
    sourceId: "xier120.flat-seated-glider",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#8bb6bf",
  }),
  Object.freeze({
    sourceId: "xier120.four-wheel",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#b18b67",
  }),
  Object.freeze({
    sourceId: "xier120.four-wheel-variant",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#c19b73",
  }),
  Object.freeze({
    sourceId: "xier120.hoverboard-standing",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#8b79ad",
  }),
  Object.freeze({
    sourceId: "xier120.prone-glider",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#75a3ad",
  }),
  Object.freeze({
    sourceId: "xier120.quadruped-animal",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, -Math.PI / 2, 0),
    expectedForward: "-Z",
    displayColorHex: "#8d9772",
  }),
  Object.freeze({
    sourceId: "xier120.quadruped-reptile",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#6f8d6b",
  }),
  Object.freeze({
    sourceId: "xier120.quadruped-ridable",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, -Math.PI / 2, 0),
    expectedForward: "-Z",
    displayColorHex: "#967a5f",
  }),
  Object.freeze({
    sourceId: "xier120.snake-animal",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI / 2, 0),
    expectedForward: "-Z",
    displayColorHex: "#779867",
  }),
  Object.freeze({
    sourceId: "xier120.three-wheel",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#a98263",
  }),
  Object.freeze({
    sourceId: "xier120.tracked",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI, 0),
    expectedForward: "-Z",
    displayColorHex: "#7e8069",
  }),
  Object.freeze({
    sourceId: "xier120.two-wheel-motorcycle",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI / 2, 0),
    expectedForward: "-Z",
    displayColorHex: "#9d785d",
  }),
  Object.freeze({
    sourceId: "xier120.two-wheel-motorcycle-variant",
    scaleToMeters: 0.01,
    rotateXYZRadians: explicitRotationXYZRadians(0, Math.PI / 2, 0),
    expectedForward: "-Z",
    displayColorHex: "#ad8667",
  }),
] as const satisfies readonly StaticSubjectBakeConfigV1[]);
