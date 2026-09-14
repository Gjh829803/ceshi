import type { ErrorObject } from "ajv";
type Validator = ((value: unknown) => boolean) & {
  errors?: ErrorObject[] | null;
};
import {
  validateCameraDocument,
  validateFirstPerson,
  validateShoulder,
  validateThirdPerson,
  validateThirdPersonOverride,
  validateFirstPersonOverride,
  validateShoulderOverride,
} from "./validator.generated.js";
import { isPreserveOpeningInactiveField } from "./fields";
import { CAMERA_DOCUMENT_DEFAULTS, CAMERA_STRATEGY_DEFAULTS } from "./defaults";
import {
  assertCameraJson,
  cameraConfigurationError as fail,
  cloneCameraData,
} from "./validation";
import type {
  CameraDocument,
  CameraFieldProvenance,
  CameraFieldSource,
  CameraJsonValue,
  CameraKind,
  CameraSubjectContext,
  CameraViewConfiguration,
  ResolvedCameraConfiguration,
} from "./types";

type ObjectData = { [key: string]: CameraJsonValue };
const isObject = (value: CameraJsonValue | undefined): value is ObjectData =>
  !!value && typeof value === "object" && !Array.isArray(value);
const validators: Record<CameraKind, Validator> = {
  "third-person": validateThirdPerson,
  "first-person": validateFirstPerson,
  shoulder: validateShoulder,
};
const overrideValidators: Record<CameraKind, Validator> = {
  "third-person": validateThirdPersonOverride,
  "first-person": validateFirstPersonOverride,
  shoulder: validateShoulderOverride,
};
function checked(validator: Validator, value: unknown, path: string): void {
  if (validator(value)) return;
  const error = validator.errors?.[0];
  fail(
    path + (error?.instancePath ?? ""),
    `${error?.message ?? "invalid configuration"}${error?.params ? ` (${JSON.stringify(error.params)})` : ""}`,
  );
}

function merge(
  target: ObjectData,
  patch: ObjectData,
  source: CameraFieldSource,
  fields: Record<string, CameraFieldProvenance>,
  prefix = "",
): void {
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) {
      const previous = target[key];
      if (
        !isObject(previous) ||
        ("kind" in value && value.kind !== previous.kind)
      ) {
        target[key] = {};
        for (const field of Object.keys(fields))
          if (field === path || field.startsWith(path + "."))
            delete fields[field];
      }
      merge(target[key] as ObjectData, value, source, fields, path);
    } else {
      target[key] = cloneCameraData(value);
      fields[path] = {
        source,
        configured: cloneCameraData(value),
        effective: cloneCameraData(value),
      };
    }
  }
}

function ownEntry<T>(
  dictionary: Readonly<Record<string, T>> | undefined,
  id: string | undefined,
): T | undefined {
  return dictionary && id !== undefined && Object.hasOwn(dictionary, id)
    ? dictionary[id]
    : undefined;
}

function compose(document: CameraDocument, viewId: string, subjectId?: string) {
  const view = ownEntry(document.views, viewId)!;
  const subject = ownEntry(
    ownEntry(document.binding.subjectOverrides, subjectId)?.views,
    viewId,
  );
  const fields: Record<string, CameraFieldProvenance> = {};
  const values: ObjectData = {};
  const layers: [unknown, CameraFieldSource][] = [
    [CAMERA_STRATEGY_DEFAULTS[view.kind], "sdk-default"],
    [ownEntry(document.presets, view.presetId)?.values, "view-preset"],
    [ownEntry(document.presets, subject?.presetId)?.values, "subject-preset"],
    [view.overrides, "project-view"],
    [subject?.overrides, "project-subject"],
  ];
  // Select framing-specific defaults before applying any authored layer. A partial
  // bounded field cannot silently replace an unbounded default or be discarded.
  let framingKind: CameraJsonValue | undefined;
  for (const [patch] of layers) {
    const framing = (patch as ObjectData | undefined)?.framing;
    if (isObject(framing) && framing.kind !== undefined)
      framingKind = framing.kind;
  }
  merge(values, layers[0]![0] as ObjectData, "sdk-default", fields);
  if (view.kind === "third-person" && framingKind === "preserve-opening")
    merge(
      values,
      {
        position: { anchor: { kind: "origin" } },
        zoom: { range: { kind: "unbounded" } },
        orientation: {
          pitchLimitsRadians: { kind: "unbounded" },
          yawLimitsRadians: { kind: "unbounded" },
        },
      },
      "sdk-default",
      fields,
    );
  for (const [patch, source] of layers.slice(1))
    if (patch) merge(values, patch as ObjectData, source, fields);
  const result = values as unknown as ResolvedCameraConfiguration["values"];
  if ("framing" in result && result.framing.kind === "preserve-opening") {
    for (const [path, field] of Object.entries(fields)) {
      if (isPreserveOpeningInactiveField(path)) {
        if (
          field.source === "project-view" ||
          field.source === "project-subject"
        )
          fail(
            `/views/${viewId}/overrides/${path.replaceAll(".", "/")}`,
            "field is inapplicable to preserve-opening",
          );
        fields[path] = {
          source: field.source,
          configured: field.configured,
          inactiveReason: "preserve-opening",
        };
      }
    }
    if ("opening" in view && view.opening) {
      (values.lens as ObjectData).verticalFovDegrees = view.opening.fovDegrees;
      merge(
        {},
        view.opening as unknown as ObjectData,
        "opening",
        fields,
        "opening",
      );
    }
  }
  return { values: result, fields };
}

function relationships(
  values: ResolvedCameraConfiguration["values"],
  kind: CameraKind,
  path: string,
  openingFovKnown: boolean,
): void {
  const speedFov = values.effects.speedFov;
  // An implicit preserve-opening lens is admitted after authored-pose adoption.
  // Its inactive preset FOV cannot stand in for the actual opening lens.
  const baseFov = openingFovKnown ? values.lens.verticalFovDegrees : 0;
  if (speedFov.enabled && baseFov + speedFov.maximumOffsetDegrees >= 180)
    fail(path + "/effects/speedFov/maximumOffsetDegrees",
      "enabled speedFov plus the effective base FOV must be less than 180 degrees");
  if ("subjectFade" in values && values.subjectFade.startDistanceMeters <= values.subjectFade.endDistanceMeters)
    fail(path + "/subjectFade/startDistanceMeters", "must exceed endDistanceMeters");
  if (values.lens.farMeters <= values.lens.nearMeters)
    fail(path + "/lens/farMeters", "must be greater than nearMeters");
  for (const key of ["pitchLimitsRadians", "yawLimitsRadians"] as const) {
    const range = values.orientation[key];
    if (range.kind === "bounded" && range.minimumRadians > range.maximumRadians)
      fail(`${path}/orientation/${key}`, "minimum must not exceed maximum");
  }
  const pitchRange = values.orientation.pitchLimitsRadians;
  const preserve =
    "framing" in values && values.framing.kind === "preserve-opening";
  if (
    !preserve &&
    pitchRange.kind === "bounded" &&
    (values.orientation.initialPitchRadians < pitchRange.minimumRadians ||
      values.orientation.initialPitchRadians > pitchRange.maximumRadians)
  )
    fail(path + "/orientation/initialPitchRadians", "outside pitch limits");
  if ("zoom" in values) {
    const range = values.zoom.range;
    if (range.kind === "bounded") {
      if (range.minimumDistanceMeters > range.maximumDistanceMeters)
        fail(path + "/zoom/range", "minimum must not exceed maximum");
      if (kind === "shoulder" && range.minimumDistanceMeters <= 0)
        fail(
          path + "/zoom/range/minimumDistanceMeters",
          "shoulder minimum must be positive",
        );
      if (
        !preserve &&
        (values.position.distanceMeters < range.minimumDistanceMeters ||
          values.position.distanceMeters > range.maximumDistanceMeters)
      )
        fail(path + "/position/distanceMeters", "outside zoom range");
    }
    if (kind === "shoulder" && values.position.distanceMeters <= 0)
      fail(
        path + "/position/distanceMeters",
        "shoulder distance must be positive",
      );
  }
}

/** Internal shared parse/resolve validation; uses no scene or subject assumptions. */
export function validateCameraDocumentData(
  value: unknown,
): asserts value is CameraDocument {
  assertCameraJson(value);
  checked(validateCameraDocument, value, "");
  const document = value as unknown as CameraDocument;
  if (!Object.hasOwn(document.views, document.defaultViewId))
    fail("/defaultViewId", "unknown view");
  for (const [index, id] of (document.input?.cycleViewIds ?? []).entries())
    if (!Object.hasOwn(document.views, id))
      fail(`/input/cycleViewIds/${index}`, "unknown view");
  const ruleIds = new Set<string>();
  for (const [index, rule] of (document.viewSelection?.rules ?? []).entries()) {
    if (ruleIds.has(rule.id)) fail(`/viewSelection/rules/${index}/id`, "duplicate rule id");
    ruleIds.add(rule.id);
    if (!Object.hasOwn(document.views, rule.viewId)) fail(`/viewSelection/rules/${index}/viewId`, "unknown view");
  }
  const presetReference = (
    id: string | undefined,
    kind: CameraKind,
    path: string,
  ) => {
    if (id === undefined) return;
    const preset = Object.hasOwn(document.presets ?? {}, id)
      ? document.presets?.[id]
      : undefined;
    if (!preset) fail(path, "unknown preset");
    if (preset.kind !== kind) fail(path, "preset kind does not match view");
  };
  for (const [viewId, view] of Object.entries(document.views))
    presetReference(view.presetId, view.kind, `/views/${viewId}/presetId`);
  for (const [subjectId, subject] of Object.entries(
    document.binding.subjectOverrides ?? {},
  ))
    for (const [viewId, view] of Object.entries(subject.views)) {
      const path = `/binding/subjectOverrides/${subjectId}/views/${viewId}`;
      if (!Object.hasOwn(document.views, viewId)) fail(path, "unknown view");
      const kind = document.views[viewId]!.kind;
      presetReference(view.presetId, kind, path + "/presetId");
      if (view.overrides)
        checked(overrideValidators[kind], view.overrides, path + "/overrides");
    }
  for (const [viewId, view] of Object.entries(document.views)) {
    const subjects = [
      undefined,
      ...Object.keys(document.binding.subjectOverrides ?? {}),
    ];
    for (const subject of subjects) {
      const { values } = compose(document, viewId, subject);
      checked(validators[view.kind], values, `/views/${viewId}`);
      const preserve =
        "framing" in values && values.framing.kind === "preserve-opening";
      relationships(values, view.kind, `/views/${viewId}`, !preserve || ("opening" in view && view.opening !== undefined));
      if ("opening" in view && view.opening) {
        if (!preserve)
          fail(`/views/${viewId}/opening`, "opening requires preserve-opening");
        const opening = view.opening;
        const direction = opening.positionWorldMetersXYZ.map(
          (value, index) => opening.lookAtWorldMetersXYZ[index]! - value,
        );
        if (Math.hypot(...direction) === 0)
          fail(
            `/views/${viewId}/opening/lookAtWorldMetersXYZ`,
            "look-at must differ from camera position",
          );
        const up = opening.upWorldXYZ ?? [0, 1, 0];
        const cross = [
          direction[1]! * up[2] - direction[2]! * up[1],
          direction[2]! * up[0] - direction[0]! * up[2],
          direction[0]! * up[1] - direction[1]! * up[0],
        ];
        if (Math.hypot(...cross) === 0)
          fail(
            `/views/${viewId}/opening/upWorldXYZ`,
            "up must provide a nondegenerate reference",
          );
      } else if (preserve && viewId !== document.defaultViewId)
        fail(
          `/views/${viewId}/opening`,
          "nondefault preserve-opening view needs an explicit opening",
        );
    }
  }
}

/** Resolve selected view against pure, already-bound subject facts. */
export function resolveCameraConfiguration(
  document: CameraDocument,
  subjectContext: CameraSubjectContext,
): ResolvedCameraConfiguration {
  validateCameraDocumentData(document);
  if (
    !Number.isSafeInteger(subjectContext.subjectGeneration) ||
    subjectContext.subjectGeneration < 0
  )
    fail(
      "/subjectContext/subjectGeneration",
      "expected a nonnegative safe integer",
    );
  const viewId = subjectContext.viewId ?? document.defaultViewId;
  if (!Object.hasOwn(document.views, viewId))
    fail("/subjectContext/viewId", "unknown view");
  const view: CameraViewConfiguration = document.views[viewId]!;
  const { values, fields } = compose(
    document,
    viewId,
    subjectContext.subjectId,
  );
  const preserve =
    "framing" in values && values.framing.kind === "preserve-opening";
  const anchor = values.position.anchor;
  {
    if (view.kind === "first-person" && anchor.kind !== "eye")
      fail(`/views/${viewId}/position/anchor`, "first-person requires eye");
    if (
      view.kind === "shoulder" &&
      anchor.kind !== "eye" &&
      anchor.kind !== "seat" &&
      anchor.kind !== "shoulder-eye"
    )
      fail(`/views/${viewId}/position/anchor`, "shoulder requires eye or seat");
    if (
      view.kind === "third-person" &&
      anchor.kind !== "body" &&
      anchor.kind !== "subject-local" &&
      anchor.kind !== "origin" &&
      anchor.kind !== "follow-pivot"
    )
      fail(
        `/views/${viewId}/position/anchor`,
        "third-person requires body, origin or subject-local",
      );
    if (
      (anchor.kind === "eye" || anchor.kind === "seat" || anchor.kind === "follow-pivot" || anchor.kind === "shoulder-eye") &&
      !subjectContext.availableAnchors.includes(anchor.kind)
    )
      fail(
        `/views/${viewId}/position/anchor`,
        `${anchor.kind} anchor unavailable on subject ${subjectContext.subjectId}`,
      );
    if (anchor.kind === "body") {
      const body = subjectContext.body;
      if (
        !body ||
        !Number.isFinite(body.minimumHeightMeters) ||
        !Number.isFinite(body.maximumHeightMeters) ||
        body.maximumHeightMeters < body.minimumHeightMeters
      )
        fail("/subjectContext/body", "valid body bounds required");
    }
  }
  if (!subjectContext.headingAvailable)
    for (const [path, field] of Object.entries(fields))
      if (path.startsWith("orientation.recenter."))
        fields[path] = {
          source: field.source,
          configured: field.configured,
          inactiveReason: "heading-unavailable",
        };
  if (preserve && "zoom" in values && values.zoom.range.kind === "bounded") {
    const distance = subjectContext.openingDistanceMeters;
    if (distance === undefined || !Number.isFinite(distance) || distance < 0)
      fail(
        "/subjectContext/openingDistanceMeters",
        "bounded preserve-opening requires a verified distance",
      );
    if (
      distance < values.zoom.range.minimumDistanceMeters ||
      distance > values.zoom.range.maximumDistanceMeters
    )
      fail(`/views/${viewId}/zoom/range`, "range excludes opening distance");
  }
  return cloneCameraData({
    kind: view.kind,
    viewId,
    subjectId: subjectContext.subjectId,
    subjectGeneration: subjectContext.subjectGeneration,
    subjectKind: subjectContext.subjectKind,
    values,
    fields,
    ...("opening" in view && view.opening ? { opening: view.opening } : {}),
    activation:
      document.views[document.defaultViewId]!.kind === "first-person"
        ? "immediate"
        : (document.activation ?? CAMERA_DOCUMENT_DEFAULTS.activation),
    mountTarget:
      document.binding.mountTarget ?? CAMERA_DOCUMENT_DEFAULTS.mountTarget,
    input: { ...CAMERA_DOCUMENT_DEFAULTS.input, ...document.input },
    transition: {
      ...CAMERA_DOCUMENT_DEFAULTS.transition,
      ...document.transition,
    },
  }) as ResolvedCameraConfiguration;
}

/** Internal runtime measurement uses the same layered position as full resolution.
 * This does not perform subject admission or duplicate configuration defaults. */
export function resolveCameraPosition(document: CameraDocument, viewId: string, subjectId: string) {
  return compose(document, viewId, subjectId).values.position;
}
