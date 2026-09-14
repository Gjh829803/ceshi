/** JSON Schema nodes also carry the editor-facing units and applicability. */
export type CameraFieldSchema = Readonly<Record<string, unknown>>;
export const object = (
  properties: Record<string, CameraFieldSchema>,
  required: readonly string[] = [],
): CameraFieldSchema => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
export const number = (
  unit: string,
  limits: Record<string, number> = {},
): CameraFieldSchema => ({
  type: "number",
  ...limits,
  $comment: `unit:${unit}`,
});
export const nonnegative = (unit: string) => number(unit, { minimum: 0 });
export const positive = (unit: string) => number(unit, { exclusiveMinimum: 0 });
export const boolean: CameraFieldSchema = { type: "boolean" };
export const choice = (...values: string[]): CameraFieldSchema => ({
  type: "string",
  enum: values,
});
export const id: CameraFieldSchema = { type: "string", minLength: 1 };
export const vector: CameraFieldSchema = {
  type: "array",
  items: { type: "number" },
  minItems: 3,
  maxItems: 3,
};
export const branch = (
  kind: string,
  properties: Record<string, CameraFieldSchema> = {},
) =>
  object({ kind: { const: kind }, ...properties }, [
    "kind",
    ...Object.keys(properties),
  ]);
export const angleLimits: CameraFieldSchema = {
  oneOf: [
    branch("unbounded"),
    branch("bounded", {
      minimumRadians: number("radians"),
      maximumRadians: number("radians"),
    }),
  ],
};
export const distanceRange: CameraFieldSchema = {
  oneOf: [
    branch("unbounded"),
    branch("bounded", {
      minimumDistanceMeters: nonnegative("meters"),
      maximumDistanceMeters: nonnegative("meters"),
    }),
  ],
};
export const speedLimit: CameraFieldSchema = {
  oneOf: [
    branch("unlimited"),
    branch("limited", {
      maximumSpeedMetersPerSecond: positive("meters/second"),
    }),
  ],
};
