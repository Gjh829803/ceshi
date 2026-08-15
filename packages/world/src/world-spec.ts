import type { Diagnostic, Vec2Tuple, Vec3Tuple } from "@whitebox-world/contracts";

import type { TerrainRelief } from "./official-features";
import { shape, type SerializedShape2D } from "./shapes";

export type WorldPlanEvidence =
  | "user-explicit"
  | "reference-visible"
  | "planner-inferred"
  | "planner-optional";

export interface WorldPlanClaim {
  id: string;
  evidence: WorldPlanEvidence;
  statement: string;
}

export interface WorldPromptBundle {
  identity: string;
  spatialComposition: string;
  environment: string;
  lighting: string;
  visualStyle: string;
  openingShot: string;
  invariants: readonly string[];
  negativePrompt: readonly string[];
}

export type PlannedEntityRole = "subject" | "npc" | "landmark" | "object";

export interface VisualPrototypeSpec {
  id: string;
  role: PlannedEntityRole;
  semantic: string;
  description: string;
  approximateSize: Vec3Tuple;
  forwardAxis: "-Z";
  pivot: "ground-center" | "center";
  instanceColor: `#${string}`;
  appearancePrompt: string;
  negativePrompt: string;
  evidence: WorldPlanEvidence;
  views: {
    canonical: readonly ["front", "right", "back"];
    whiteboxUri: string;
    styledUri: string;
  };
}

export interface PlannedEntityInstance {
  id: string;
  prototypeId: string;
  binding:
    | { kind: "feature"; id: string }
    | { kind: "runtime-entity"; id: string };
  evidence: WorldPlanEvidence;
}

export interface WorldEntityCatalog {
  prototypes: readonly VisualPrototypeSpec[];
  instances: readonly PlannedEntityInstance[];
}

export interface OutdoorWorldBoundsSpec {
  center: Vec2Tuple;
  size: Vec2Tuple;
  heightRange: readonly [minimum: number, maximum: number];
}

export interface PlannedTerrainRegion {
  id: string;
  semantic: string;
  role: "ground" | "ridge" | "valley" | "plateau" | "shore" | "route" | "background";
  area: SerializedShape2D;
  elevationIntent?: string;
  featureId?: string;
  evidence: WorldPlanEvidence;
}

export interface PlannedWaterBody {
  id: string;
  semantic: string;
  area: SerializedShape2D;
  featureId: string;
  evidence: WorldPlanEvidence;
}

export interface PlannedLandmark {
  id: string;
  semantic: string;
  position: Vec3Tuple;
  approximateSize: Vec3Tuple;
  importance: "primary" | "secondary" | "background";
  featureId: string;
  evidence: WorldPlanEvidence;
}

export interface PlannedRoute {
  id: string;
  points: readonly Vec2Tuple[];
  width: number;
  priority: "primary" | "secondary";
  maxSlopeDegrees: number;
  evidence: WorldPlanEvidence;
}

export interface OpeningShotSpec {
  spawn: Vec2Tuple;
  facingRadians: number;
  camera: {
    pitchRadians: number;
    distance: number;
    fovDegrees: number;
  };
  composition: {
    foreground: readonly string[];
    middleground: readonly string[];
    background: readonly string[];
    visibleLandmarkIds: readonly string[];
  };
}

export type WorldPlanArtifact =
  | {
      kind: "world-plan" | "opening-shot";
      generator: "codex-imagegen";
      uri: string;
      prompt: string;
    }
  | {
      kind: "height-slope-plan";
      generator: "sdk-derived";
      uri: "runtime://planning/height-slope";
    };

export interface OutdoorWorldSpec {
  kind: "outdoor-world-spec";
  version: 1;
  id: string;
  title?: string;
  source: {
    request: string;
    referenceImages?: readonly string[];
  };
  intent: string;
  worldPrompt: WorldPromptBundle;
  entityCatalog: WorldEntityCatalog;
  bounds: OutdoorWorldBoundsSpec;
  terrain: {
    baseRelief: TerrainRelief;
    regions: readonly PlannedTerrainRegion[];
  };
  water: readonly PlannedWaterBody[];
  landmarks: readonly PlannedLandmark[];
  routes: readonly PlannedRoute[];
  entry: OpeningShotSpec;
  claims: readonly WorldPlanClaim[];
  artifacts: readonly WorldPlanArtifact[];
  traceability: {
    requiredFeatureIds: readonly string[];
  };
}

export interface WorldSpecImplementationSnapshot {
  featureIds: readonly string[];
  bounds: {
    center: Vec2Tuple;
    size: Vec2Tuple;
  };
  spawn: Vec2Tuple;
  facingRadians: number;
  camera: OpeningShotSpec["camera"];
}

function isFiniteTuple(values: readonly number[], length: number): boolean {
  return values.length === length && values.every(Number.isFinite);
}

function insideBounds(point: Vec2Tuple, bounds: OutdoorWorldBoundsSpec): boolean {
  return (
    Math.abs(point[0] - bounds.center[0]) <= bounds.size[0] / 2 &&
    Math.abs(point[1] - bounds.center[1]) <= bounds.size[1] / 2
  );
}

function safePublicPlanUri(uri: string, specId: string): boolean {
  return (
    uri.startsWith(`/scene-plans/${specId}/`) &&
    !uri.includes("..") &&
    !uri.includes("://") &&
    /\.(png|jpe?g|webp)$/i.test(uri)
  );
}

function safePrototypeUri(uri: string, specId: string, prototypeId: string): boolean {
  return (
    uri.startsWith(`/scene-plans/${specId}/prototypes/${prototypeId}/`) &&
    !uri.includes("..") &&
    !uri.includes("://") &&
    /\.png$/i.test(uri)
  );
}

function diagnostic(
  severity: Diagnostic["severity"],
  code: string,
  message: string,
  suggestions?: string[],
): Diagnostic {
  return { severity, code, message, ...(suggestions === undefined ? {} : { suggestions }) };
}

export function validateOutdoorWorldSpec(
  spec: OutdoorWorldSpec,
  expectedSceneId?: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!spec.id.trim()) {
    diagnostics.push(diagnostic("error", "WORLD_SPEC_ID_EMPTY", "WorldSpec id cannot be empty."));
  }
  if (expectedSceneId !== undefined && spec.id !== expectedSceneId) {
    diagnostics.push(
      diagnostic(
        "error",
        "WORLD_SPEC_SCENE_ID_MISMATCH",
        `WorldSpec id ${spec.id} does not match scene id ${expectedSceneId}.`,
      ),
    );
  }
  if (!spec.source.request.trim() || !spec.intent.trim()) {
    diagnostics.push(
      diagnostic(
        "error",
        "WORLD_SPEC_INTENT_MISSING",
        "WorldSpec must preserve the user request and a concise world intent.",
      ),
    );
  }
  const promptFields = [
    spec.worldPrompt.identity,
    spec.worldPrompt.spatialComposition,
    spec.worldPrompt.environment,
    spec.worldPrompt.lighting,
    spec.worldPrompt.visualStyle,
    spec.worldPrompt.openingShot,
  ];
  if (promptFields.some((value) => !value.trim()) || spec.worldPrompt.invariants.length === 0) {
    diagnostics.push(
      diagnostic(
        "error",
        "WORLD_SPEC_WORLD_PROMPT_INCOMPLETE",
        "WorldPrompt must define identity, space, environment, lighting, style, opening shot, and at least one invariant.",
      ),
    );
  }
  if (
    !isFiniteTuple(spec.bounds.center, 2) ||
    !isFiniteTuple(spec.bounds.size, 2) ||
    !(spec.bounds.size[0] > 0 && spec.bounds.size[1] > 0) ||
    !isFiniteTuple(spec.bounds.heightRange, 2) ||
    !(spec.bounds.heightRange[1] > spec.bounds.heightRange[0])
  ) {
    diagnostics.push(
      diagnostic(
        "error",
        "WORLD_SPEC_BOUNDS_INVALID",
        "WorldSpec bounds require a finite positive size and an increasing height range.",
      ),
    );
  }

  const ids = new Set<string>();
  const addUnique = (id: string, label: string) => {
    if (!id.trim()) {
      diagnostics.push(diagnostic("error", "WORLD_SPEC_ITEM_ID_EMPTY", `${label} id cannot be empty.`));
    } else if (ids.has(id)) {
      diagnostics.push(
        diagnostic("error", "WORLD_SPEC_ITEM_ID_DUPLICATE", `WorldSpec item id ${id} is duplicated.`),
      );
    }
    ids.add(id);
  };

  for (const region of spec.terrain.regions) {
    addUnique(region.id, "Terrain region");
    try {
      shape.fromJSON(region.area);
    } catch (error) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_REGION_SHAPE_INVALID",
          `Terrain region ${region.id} has an invalid shape: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
  for (const water of spec.water) {
    addUnique(water.id, "Water body");
    try {
      shape.fromJSON(water.area);
    } catch (error) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_WATER_SHAPE_INVALID",
          `Water body ${water.id} has an invalid shape: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
  for (const landmark of spec.landmarks) {
    addUnique(landmark.id, "Landmark");
    if (!isFiniteTuple(landmark.position, 3) || !isFiniteTuple(landmark.approximateSize, 3)) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_LANDMARK_TRANSFORM_INVALID",
          `Landmark ${landmark.id} must have finite position and size values.`,
        ),
      );
    }
    if (landmark.approximateSize.some((value) => !(value > 0))) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_LANDMARK_SIZE_INVALID",
          `Landmark ${landmark.id} must have a positive approximate size.`,
        ),
      );
    }
    if (!insideBounds([landmark.position[0], landmark.position[2]], spec.bounds)) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_LANDMARK_OUTSIDE_BOUNDS",
          `Landmark ${landmark.id} is outside world bounds.`,
        ),
      );
    }
  }
  for (const route of spec.routes) {
    addUnique(route.id, "Route");
    if (route.points.length < 2 || route.points.some((point) => !isFiniteTuple(point, 2))) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_ROUTE_INVALID",
          `Route ${route.id} requires at least two finite points.`,
        ),
      );
    }
    if (route.points.some((point) => !insideBounds(point, spec.bounds))) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_ROUTE_OUTSIDE_BOUNDS",
          `Route ${route.id} leaves world bounds.`,
        ),
      );
    }
    if (!(route.width > 0) || !(route.maxSlopeDegrees > 0 && route.maxSlopeDegrees <= 90)) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_ROUTE_CONSTRAINT_INVALID",
          `Route ${route.id} requires a positive width and maxSlopeDegrees in (0, 90].`,
        ),
      );
    } else if (route.priority === "primary" && route.maxSlopeDegrees > 35) {
      diagnostics.push(
        diagnostic(
          "warning",
          "WORLD_SPEC_PRIMARY_ROUTE_STEEP",
          `Primary route ${route.id} allows ${route.maxSlopeDegrees}°, above the recommended 35° margin.`,
        ),
      );
    }
  }
  for (const claim of spec.claims) addUnique(claim.id, "Claim");

  const prototypeIds = new Set<string>();
  const prototypeColors = new Set<string>();
  for (const prototype of spec.entityCatalog.prototypes) {
    if (!prototype.id.trim() || prototypeIds.has(prototype.id)) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_PROTOTYPE_ID_INVALID",
          `Visual prototype id ${prototype.id || "<empty>"} must be non-empty and unique.`,
        ),
      );
    }
    prototypeIds.add(prototype.id);
    if (
      prototype.approximateSize.some((value) => !(value > 0) || !Number.isFinite(value)) ||
      !prototype.semantic.trim() ||
      !prototype.description.trim() ||
      !prototype.appearancePrompt.trim()
    ) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_PROTOTYPE_DEFINITION_INVALID",
          `Visual prototype ${prototype.id} requires positive size and non-empty semantic, description, and appearance prompt.`,
        ),
      );
    }
    if (!/^#[0-9a-f]{6}$/i.test(prototype.instanceColor) || prototypeColors.has(prototype.instanceColor.toLowerCase())) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_PROTOTYPE_COLOR_INVALID",
          `Visual prototype ${prototype.id} requires a unique six-digit instance color.`,
        ),
      );
    }
    prototypeColors.add(prototype.instanceColor.toLowerCase());
    if (
      prototype.views.canonical.join(",") !== "front,right,back" ||
      !safePrototypeUri(prototype.views.whiteboxUri, spec.id, prototype.id) ||
      !safePrototypeUri(prototype.views.styledUri, spec.id, prototype.id)
    ) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_PROTOTYPE_VIEWS_INVALID",
          `Visual prototype ${prototype.id} must use front/right/back and project-local whitebox/styled PNG paths.`,
        ),
      );
    }
  }

  const instanceIds = new Set<string>();
  const boundIds = new Set<string>();
  let subjectCount = 0;
  for (const instance of spec.entityCatalog.instances) {
    if (!instance.id.trim() || instanceIds.has(instance.id)) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_ENTITY_INSTANCE_ID_INVALID",
          `Entity instance id ${instance.id || "<empty>"} must be non-empty and unique.`,
        ),
      );
    }
    instanceIds.add(instance.id);
    const prototype = spec.entityCatalog.prototypes.find((item) => item.id === instance.prototypeId);
    if (prototype === undefined) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_ENTITY_PROTOTYPE_UNKNOWN",
          `Entity instance ${instance.id} references unknown prototype ${instance.prototypeId}.`,
        ),
      );
    } else if (prototype.role === "subject") {
      subjectCount += 1;
    }
    const bindingKey = `${instance.binding.kind}:${instance.binding.id}`;
    if (!instance.binding.id.trim() || boundIds.has(bindingKey)) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_ENTITY_BINDING_INVALID",
          `Entity instance ${instance.id} requires a non-empty unique runtime binding.`,
        ),
      );
    }
    boundIds.add(bindingKey);
  }
  if (subjectCount === 0) {
    diagnostics.push(
      diagnostic("error", "WORLD_SPEC_SUBJECT_MISSING", "Entity Catalog must define the playable subject."),
    );
  }
  const featureBindings = new Set(
    spec.entityCatalog.instances
      .filter((instance) => instance.binding.kind === "feature")
      .map((instance) => instance.binding.id),
  );
  for (const landmark of spec.landmarks) {
    if (!featureBindings.has(landmark.featureId)) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_LANDMARK_ENTITY_MISSING",
          `Landmark feature ${landmark.featureId} has no Entity Catalog instance.`,
        ),
      );
    }
  }

  if (!insideBounds(spec.entry.spawn, spec.bounds)) {
    diagnostics.push(
      diagnostic("error", "WORLD_SPEC_ENTRY_OUTSIDE_BOUNDS", "Opening-shot spawn is outside world bounds."),
    );
  }
  if (!Number.isFinite(spec.entry.facingRadians)) {
    diagnostics.push(
      diagnostic("error", "WORLD_SPEC_ENTRY_FACING_INVALID", "Opening-shot facing must be finite."),
    );
  }
  const camera = spec.entry.camera;
  if (
    !Number.isFinite(camera.pitchRadians) ||
    camera.pitchRadians < -0.95 ||
    camera.pitchRadians > 0.65 ||
    !Number.isFinite(camera.distance) ||
    camera.distance < 1.8 ||
    camera.distance > 8 ||
    !Number.isFinite(camera.fovDegrees) ||
    camera.fovDegrees < 35 ||
    camera.fovDegrees > 90
  ) {
    diagnostics.push(
      diagnostic(
        "error",
        "WORLD_SPEC_ENTRY_CAMERA_INVALID",
        "Opening-shot camera must use pitch -0.95..0.65, distance 1.8..8m, and FOV 35..90°.",
      ),
    );
  }

  const landmarkIds = new Set(spec.landmarks.map((landmark) => landmark.id));
  for (const landmarkId of spec.entry.composition.visibleLandmarkIds) {
    if (!landmarkIds.has(landmarkId)) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_VISIBLE_LANDMARK_UNKNOWN",
          `Opening shot references unknown landmark ${landmarkId}.`,
        ),
      );
    }
  }

  const artifactKinds = new Set(spec.artifacts.map((artifact) => artifact.kind));
  for (const kind of ["world-plan", "opening-shot", "height-slope-plan"] as const) {
    if (!artifactKinds.has(kind)) {
      diagnostics.push(
        diagnostic("error", "WORLD_SPEC_ARTIFACT_MISSING", `WorldSpec is missing ${kind} artifact.`),
      );
    }
  }
  if (artifactKinds.size !== spec.artifacts.length) {
    diagnostics.push(
      diagnostic("error", "WORLD_SPEC_ARTIFACT_DUPLICATE", "WorldSpec artifact kinds must be unique."),
    );
  }
  for (const artifact of spec.artifacts) {
    if (artifact.generator === "codex-imagegen") {
      if (!safePublicPlanUri(artifact.uri, spec.id) || !artifact.prompt.trim()) {
        diagnostics.push(
          diagnostic(
            "error",
            "WORLD_SPEC_IMAGE_ARTIFACT_INVALID",
            `${artifact.kind} must use a project-local /scene-plans/${spec.id}/ image URI and a non-empty prompt.`,
          ),
        );
      }
    }
  }

  const requiredFeatures = new Set<string>();
  for (const featureId of spec.traceability.requiredFeatureIds) {
    if (!featureId.trim() || requiredFeatures.has(featureId)) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_FEATURE_TRACE_INVALID",
          "WorldSpec requiredFeatureIds must be non-empty and unique.",
        ),
      );
    }
    requiredFeatures.add(featureId);
  }
  return diagnostics;
}

export function validateWorldSpecImplementation(
  spec: OutdoorWorldSpec,
  implementation: WorldSpecImplementationSnapshot,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const approximately = (left: number, right: number) => Math.abs(left - right) <= 1e-6;
  const featureIds = new Set(implementation.featureIds);
  for (const featureId of spec.traceability.requiredFeatureIds) {
    if (!featureIds.has(featureId)) {
      diagnostics.push(
        diagnostic(
          "error",
          "WORLD_SPEC_FEATURE_NOT_BUILT",
          `WorldSpec requires feature ${featureId}, but the scene did not build it.`,
          ["Create the feature with the planned stable id or update the WorldSpec deliberately."],
        ),
      );
    }
  }

  if (
    !approximately(spec.bounds.center[0], implementation.bounds.center[0]) ||
    !approximately(spec.bounds.center[1], implementation.bounds.center[1]) ||
    !approximately(spec.bounds.size[0], implementation.bounds.size[0]) ||
    !approximately(spec.bounds.size[1], implementation.bounds.size[1])
  ) {
    diagnostics.push(
      diagnostic(
        "error",
        "WORLD_SPEC_BOUNDS_MISMATCH",
        "Primary terrain bounds do not match WorldSpec bounds.",
        ["Align terrain tile size/count/origin with the planned world bounds."],
      ),
    );
  }
  if (
    !approximately(spec.entry.spawn[0], implementation.spawn[0]) ||
    !approximately(spec.entry.spawn[1], implementation.spawn[1]) ||
    !approximately(spec.entry.facingRadians, implementation.facingRadians) ||
    !approximately(spec.entry.camera.pitchRadians, implementation.camera.pitchRadians) ||
    !approximately(spec.entry.camera.distance, implementation.camera.distance) ||
    !approximately(spec.entry.camera.fovDegrees, implementation.camera.fovDegrees)
  ) {
    diagnostics.push(
      diagnostic(
        "error",
        "WORLD_SPEC_OPENING_SHOT_MISMATCH",
        "Scene spawn/camera does not match the planned Opening Shot.",
        ["Copy spawn, facing, pitch, distance, and FOV from WorldSpec into world.player.spawn()."],
      ),
    );
  }
  return diagnostics;
}

export class WorldSpecValidationError extends Error {
  constructor(
    message: string,
    readonly diagnostics: readonly Diagnostic[],
  ) {
    super(message);
    this.name = "WorldSpecValidationError";
  }
}

export function defineOutdoorWorldSpec(spec: OutdoorWorldSpec): OutdoorWorldSpec {
  const diagnostics = validateOutdoorWorldSpec(spec);
  const errors = diagnostics.filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new WorldSpecValidationError(
      `Outdoor WorldSpec ${spec.id || "<empty>"} is invalid: ${errors.map((item) => item.message).join(" ")}`,
      diagnostics,
    );
  }
  return Object.freeze(spec);
}
