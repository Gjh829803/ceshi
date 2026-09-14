import {
  object,
  choice,
  id,
  vector,
  number,
  nonnegative,
  type CameraFieldSchema,
} from "./field-primitives";
import {
  lensFields,
  positionFields,
  orientationFields,
  constraintFields,
  speedFovField,
  speedDistanceField,
  zoomField,
} from "./behavior-fields";
import type { CameraKind } from "./types";

const common = {
  lens: object(lensFields),
  position: object(positionFields),
  orientation: object(orientationFields),
  constraints: object(constraintFields),
  effects: object({ speedFov: speedFovField }),
};
const following = {
  ...common,
  orientation: object({...orientationFields,upHalfLifeSeconds:nonnegative("seconds")}),
  subjectFade: object({
    enabled: {type: "boolean"},
    startDistanceMeters: nonnegative("meters"),
    endDistanceMeters: nonnegative("meters"),
  }),
  position: object({
    ...positionFields,
    distanceMeters: nonnegative("meters"),
  }),
  zoom: zoomField,
  constraints: object({
    ...constraintFields,
    visibility: choice("preserve-framing", "require-line-of-sight"),
  }),
  effects: object({
    speedFov: speedFovField,
    speedDistance: speedDistanceField,
  }),
};
export const CAMERA_VALUE_SCHEMAS: Readonly<
  Record<CameraKind, CameraFieldSchema>
> = {
  "third-person": object({
    ...following,
    framing: object({ kind: choice("preserve-opening", "look-at") }, ["kind"]),
  }),
  "first-person": object({
    ...common,
    orientation: object({
      ...orientationFields,
      rollInheritanceRatio: number("ratio", { minimum: 0, maximum: 1 }),
    }),
  }),
  shoulder: object(following),
};
/** Overrides may omit inherited branch fields; the merged branch is checked separately. */
function partial(schema: CameraFieldSchema): CameraFieldSchema {
  const { required: _, oneOf, properties, ...rest } = schema;
  return {
    ...rest,
    ...(properties
      ? {
          properties: Object.fromEntries(
            Object.entries(properties as Record<string, CameraFieldSchema>).map(
              ([key, value]) => [key, partial(value)],
            ),
          ),
        }
      : {}),
    ...(oneOf ? { anyOf: (oneOf as CameraFieldSchema[]).map(partial) } : {}),
  };
}
export const CAMERA_OVERRIDE_SCHEMAS: Readonly<
  Record<CameraKind, CameraFieldSchema>
> = {
  "third-person": partial(CAMERA_VALUE_SCHEMAS["third-person"]),
  "first-person": partial(CAMERA_VALUE_SCHEMAS["first-person"]),
  shoulder: partial(CAMERA_VALUE_SCHEMAS.shoulder),
};
const opening = object(
  {
    positionWorldMetersXYZ: vector,
    lookAtWorldMetersXYZ: vector,
    upWorldXYZ: vector,
    fovDegrees: lensFields.verticalFovDegrees,
  },
  ["positionWorldMetersXYZ", "lookAtWorldMetersXYZ", "fovDegrees"],
);
const record = (schema: CameraFieldSchema): CameraFieldSchema => ({
  type: "object",
  propertyNames: id,
  additionalProperties: schema,
});
const kinds: CameraKind[] = ["third-person", "first-person", "shoulder"];
export const CAMERA_DOCUMENT_SCHEMA: CameraFieldSchema = {
  ...object(
    {
      kind: { const: "world-camera" },
      schemaVersion: { const: 1 },
      defaultViewId: id,
      views: {
        ...record({
          oneOf: kinds.map((kind) =>
            object(
              {
                kind: { const: kind },
                presetId: id,
                overrides: { $ref: `#/$defs/${kind}` },
                ...(kind === "third-person" ? { opening } : {}),
              },
              ["kind"],
            ),
          ),
        }),
        minProperties: 1,
      },
      binding: object(
        {
          targetEntityId: id,
          mountTarget: choice("actor", "vehicle"),
          subjectOverrides: record(
            object(
              {
                views: record(
                  object({
                    presetId: id,
                    overrides: {
                      anyOf: kinds.map((kind) => ({ $ref: `#/$defs/${kind}` })),
                    },
                  }),
                ),
              },
              ["views"],
            ),
          ),
        },
        ["targetEntityId"],
      ),
      presets: record({
        oneOf: kinds.map((kind) =>
          object(
            {
              kind: { const: kind },
              values: { $ref: `#/$defs/${kind}` },
              sourceIdentity: object({ id, version: id }, ["id", "version"]),
            },
            ["kind", "values"],
          ),
        ),
      }),
      activation: choice("on-input", "immediate"),
      input: object({
        orbitRateRadiansPerSecond: nonnegative("radians/second"),
        orbitPitchRateRadiansPerSecond: nonnegative("radians/second"),
        cycleViewIds: { type: "array", items: id, uniqueItems: true },
      }),
      transition: object({ durationSeconds: nonnegative("seconds") }),
    },
    ["kind", "schemaVersion", "defaultViewId", "views", "binding"],
  ),
  $id: "https://worldkit.dev/schema/camera-document-v1.json",
  $defs: CAMERA_OVERRIDE_SCHEMAS,
};

export interface CameraFieldMetadata {
  readonly path: string;
  readonly kind: CameraKind;
  readonly schema: CameraFieldSchema;
  readonly unit?: string;
  readonly applicability: "always" | "look-at-only" | "heading-required";
  readonly visibility: "standard" | "advanced";
}
export function isPreserveOpeningInactiveField(path: string): boolean {
  return (
    path === "position.distanceMeters" ||
    path === "orientation.initialPitchRadians" ||
    path === "lens.verticalFovDegrees"
  );
}
/** Flatten only schema properties; union constraints remain intact for controls. */
export const CAMERA_FIELD_METADATA: readonly CameraFieldMetadata[] =
  kinds.flatMap((kind) => {
    const result: CameraFieldMetadata[] = [];
    const visit = (schema: CameraFieldSchema, path: string) => {
      const properties = schema.properties as
        | Record<string, CameraFieldSchema>
        | undefined;
      if (properties) {
        for (const [key, child] of Object.entries(properties))
          visit(child, path ? `${path}.${key}` : key);
      } else {
        const unit =
          typeof schema.$comment === "string"
            ? schema.$comment.replace("unit:", "")
            : undefined;
        result.push({
          kind,
          path,
          schema,
          ...(unit ? { unit } : {}),
          applicability:
            kind === "third-person" && isPreserveOpeningInactiveField(path)
              ? "look-at-only"
              : path.startsWith("orientation.recenter.")
                ? "heading-required"
                : "always",
          visibility:
            path === "orientation.rollInheritanceRatio"
              ? "advanced"
              : "standard",
        });
      }
    };
    visit(CAMERA_VALUE_SCHEMAS[kind], "");
    return result;
  });
