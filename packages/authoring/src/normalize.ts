import {
  builtInSubjectDefinitionRegistry,
  type SubjectDefinitionRegistryV1,
  type SubjectKitDefinitionV1,
} from "@whitebox-world/subject-registry";

import { sha256CanonicalJson } from "./canonical-json";
import type {
  AuthoringDiagnostic,
  AuthoringSpecV1,
  NormalizeAuthoringOptionsV1,
  NormalizeAuthoringResult,
  NormalizedProceduralTerrainSourceV1,
  NormalizedTransformV1,
  NormalizedWorldIRV1,
  NormalizedWorldNodeV1,
  ProceduralTerrainSourceSpecV1,
  WorldNodeSpecV1,
} from "./types";
import { validateAuthoringSpec } from "./validate";

const SUPPORTED_CAMERA_RIG = "worldkit://camera/third-person.standard@1";

const RELIEF_DEFAULTS: Readonly<
  Record<ProceduralTerrainSourceSpecV1["relief"], Omit<NormalizedProceduralTerrainSourceV1, "kind" | "relief">>
> = {
  flat: {
    baseHeightMeters: 0,
    amplitudeMeters: 0,
    frequencyPerMeter: 0.002,
    octaves: 1,
    lacunarityRatio: 2,
    persistenceRatio: 0.3,
  },
  plain: {
    baseHeightMeters: 0,
    amplitudeMeters: 2.5,
    frequencyPerMeter: 0.006,
    octaves: 3,
    lacunarityRatio: 2,
    persistenceRatio: 0.35,
  },
  hills: {
    baseHeightMeters: 0,
    amplitudeMeters: 8,
    frequencyPerMeter: 0.0065,
    octaves: 4,
    lacunarityRatio: 2,
    persistenceRatio: 0.42,
  },
  mountains: {
    baseHeightMeters: 0,
    amplitudeMeters: 24,
    frequencyPerMeter: 0.0035,
    octaves: 4,
    lacunarityRatio: 2,
    persistenceRatio: 0.45,
  },
};

function error(
  diagnostics: AuthoringDiagnostic[],
  code: string,
  instancePath: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): void {
  diagnostics.push({ severity: "error", code, instancePath, message, ...(details ? { details } : {}) });
}

function buildUniqueIndex<T extends { id: string }>(
  values: readonly T[],
  basePath: string,
  diagnostics: AuthoringDiagnostic[],
): Map<string, T> {
  const result = new Map<string, T>();
  values.forEach((value, index) => {
    if (result.has(value.id)) {
      error(diagnostics, "AUTHORING_ID_DUPLICATE", `${basePath}/${index}/id`, `Duplicate ID '${value.id}'.`, {
        id: value.id,
      });
    } else {
      result.set(value.id, value);
    }
  });
  return result;
}

function requireNodeKind(
  nodes: ReadonlyMap<string, WorldNodeSpecV1>,
  id: string,
  kind: WorldNodeSpecV1["kind"],
  instancePath: string,
  diagnostics: AuthoringDiagnostic[],
): void {
  const node = nodes.get(id);
  if (node === undefined) {
    error(diagnostics, "AUTHORING_REFERENCE_NOT_FOUND", instancePath, `Node '${id}' does not exist.`, { id });
  } else if (node.kind !== kind) {
    error(
      diagnostics,
      "AUTHORING_REFERENCE_KIND_MISMATCH",
      instancePath,
      `Node '${id}' is '${node.kind}', expected '${kind}'.`,
      { id, actualKind: node.kind, expectedKind: kind },
    );
  }
}

function normalizeTransform(transform: {
  positionMeters: readonly [number, number, number];
  rotationEulerRadiansXYZ?: readonly [number, number, number];
  scaleXYZ?: readonly [number, number, number];
}): NormalizedTransformV1 {
  return {
    positionMeters: [...transform.positionMeters],
    rotationEulerRadiansXYZ: [...(transform.rotationEulerRadiansXYZ ?? [0, 0, 0])],
    scaleXYZ: [...(transform.scaleXYZ ?? [1, 1, 1])],
  };
}

function normalizeSource(source: ProceduralTerrainSourceSpecV1): NormalizedProceduralTerrainSourceV1 {
  const defaults = RELIEF_DEFAULTS[source.relief];
  return {
    kind: "procedural",
    relief: source.relief,
    baseHeightMeters: source.baseHeightMeters ?? defaults.baseHeightMeters,
    amplitudeMeters: source.amplitudeMeters ?? defaults.amplitudeMeters,
    frequencyPerMeter: source.frequencyPerMeter ?? defaults.frequencyPerMeter,
    octaves: source.octaves ?? defaults.octaves,
    lacunarityRatio: source.lacunarityRatio ?? defaults.lacunarityRatio,
    persistenceRatio: source.persistenceRatio ?? defaults.persistenceRatio,
  };
}

function normalizeNode(
  node: WorldNodeSpecV1,
  startup: AuthoringSpecV1["startup"],
): NormalizedWorldNodeV1 {
  switch (node.kind) {
    case "terrain":
      return {
        ...structuredClone(node),
        components: {
          terrain: {
            ...structuredClone(node.components.terrain),
            source: normalizeSource(node.components.terrain.source),
          },
        },
      };
    case "water":
      return {
        ...structuredClone(node),
        components: {
          water: {
            ...structuredClone(node.components.water),
            shoreWidthMeters: node.components.water.shoreWidthMeters ?? 0,
            traversalMode: node.components.water.traversalMode ?? "blocked",
          },
        },
      };
    case "object":
      return { ...structuredClone(node), transform: normalizeTransform(node.transform) };
    case "anchor":
      return { ...structuredClone(node), transform: normalizeTransform(node.transform) };
    case "subject": {
      const spawnAnchorEntityId =
        node.spawnAnchorEntityId ??
        (node.id === startup.controlledEntityId ? startup.spawnAnchorId : undefined);
      if (spawnAnchorEntityId === undefined) {
        throw new Error(
          `NormalizedWorldIR invariant violated: subject '${node.id}' has no spawn anchor.`,
        );
      }
      return {
        ...structuredClone(node),
        spawnAnchorEntityId,
      };
    }
    case "camera":
      return structuredClone(node);
  }
}

interface SemanticValidationResult {
  diagnostics: AuthoringDiagnostic[];
  subjectDefinitions: SubjectKitDefinitionV1[];
}

function validateSemantics(
  spec: AuthoringSpecV1,
  subjectDefinitionRegistry: SubjectDefinitionRegistryV1,
): SemanticValidationResult {
  const diagnostics: AuthoringDiagnostic[] = [];
  const subjectDefinitionsByRef = new Map<string, SubjectKitDefinitionV1>();
  const prototypes = buildUniqueIndex(spec.resources.prototypes, "/resources/prototypes", diagnostics);
  const nodes = buildUniqueIndex(spec.nodes, "/nodes", diagnostics);

  if (spec.relationships.length > 0) {
    spec.relationships.forEach((relationship, index) => {
      error(
        diagnostics,
        "AUTHORING_FEATURE_NOT_SUPPORTED",
        `/relationships/${index}`,
        `Relationship '${relationship.type}' is not supported by AuthoringSpec V1.`,
        { feature: "relationships", type: relationship.type },
      );
    });
  }
  if (spec.rules.length > 0) {
    spec.rules.forEach((rule, index) => {
      error(
        diagnostics,
        "AUTHORING_FEATURE_NOT_SUPPORTED",
        `/rules/${index}`,
        `Rule '${rule.kind}' is not supported by AuthoringSpec V1.`,
        { feature: "rules", kind: rule.kind },
      );
    });
  }

  const terrains = spec.nodes.filter((node) => node.kind === "terrain");
  if (terrains.length !== 1) {
    error(
      diagnostics,
      "AUTHORING_CARDINALITY_INVALID",
      "/nodes",
      `AuthoringSpec V1 requires exactly one terrain node; received ${terrains.length}.`,
      { kind: "terrain", expected: 1, actual: terrains.length },
    );
  }

  spec.nodes.forEach((node, index) => {
    if (node.kind === "object") {
      const match = /^package:\/\/prototype\/([a-z0-9][a-z0-9.-]{0,63})$/.exec(node.prototypeRef);
      if (match === null || !prototypes.has(match[1]!)) {
        error(
          diagnostics,
          "AUTHORING_REFERENCE_NOT_FOUND",
          `/nodes/${index}/prototypeRef`,
          `Prototype reference '${node.prototypeRef}' does not resolve to a declared package prototype.`,
          { reference: node.prototypeRef },
        );
      }
    } else if (node.kind === "water") {
      requireNodeKind(
        nodes,
        node.components.water.terrainEntityId,
        "terrain",
        `/nodes/${index}/components/water/terrainEntityId`,
        diagnostics,
      );
    } else if (node.kind === "subject") {
      const definition = subjectDefinitionRegistry.resolve(node.kitRef);
      if (definition === undefined) {
        error(
          diagnostics,
          "AUTHORING_RESOURCE_NOT_SUPPORTED",
          `/nodes/${index}/kitRef`,
          `Kit '${node.kitRef}' is not registered.`,
          {
            supportedKitRefs: subjectDefinitionRegistry
              .list()
              .map((candidate) => candidate.kitRef)
              .sort((left, right) => left.localeCompare(right)),
          },
        );
      } else {
        subjectDefinitionsByRef.set(definition.kitRef, definition);
      }

      if (node.spawnAnchorEntityId !== undefined) {
        requireNodeKind(
          nodes,
          node.spawnAnchorEntityId,
          "anchor",
          `/nodes/${index}/spawnAnchorEntityId`,
          diagnostics,
        );
      } else if (node.id !== spec.startup.controlledEntityId) {
        error(
          diagnostics,
          "AUTHORING_SUBJECT_SPAWN_REQUIRED",
          `/nodes/${index}/spawnAnchorEntityId`,
          "Every subject except the startup controlled subject must declare spawnAnchorEntityId.",
          { subjectEntityId: node.id },
        );
      }
    } else if (node.kind === "camera") {
      const rig = node.components.cameraRig;
      if (rig.defaultRigRef !== SUPPORTED_CAMERA_RIG || rig.allowedRigRefs.some((ref) => ref !== SUPPORTED_CAMERA_RIG)) {
        error(
          diagnostics,
          "AUTHORING_RESOURCE_NOT_SUPPORTED",
          `/nodes/${index}/components/cameraRig`,
          "AuthoringSpec V1 supports only the standard third-person camera rig.",
          { supported: [SUPPORTED_CAMERA_RIG] },
        );
      }
      if (!rig.allowedRigRefs.includes(rig.defaultRigRef)) {
        error(
          diagnostics,
          "AUTHORING_DEFAULT_NOT_ALLOWED",
          `/nodes/${index}/components/cameraRig/defaultRigRef`,
          "The default camera rig must also appear in allowedRigRefs.",
        );
      }
      requireNodeKind(
        nodes,
        rig.target.entityId,
        "subject",
        `/nodes/${index}/components/cameraRig/target/entityId`,
        diagnostics,
      );
    }
  });

  requireNodeKind(nodes, spec.startup.spawnAnchorId, "anchor", "/startup/spawnAnchorId", diagnostics);
  requireNodeKind(nodes, spec.startup.controlledEntityId, "subject", "/startup/controlledEntityId", diagnostics);
  requireNodeKind(nodes, spec.startup.cameraEntityId, "camera", "/startup/cameraEntityId", diagnostics);

  const controlled = nodes.get(spec.startup.controlledEntityId);
  const camera = nodes.get(spec.startup.cameraEntityId);
  if (
    controlled?.kind === "subject" &&
    camera?.kind === "camera" &&
    camera.components.cameraRig.target.entityId !== controlled.id
  ) {
    error(
      diagnostics,
      "AUTHORING_STARTUP_TARGET_MISMATCH",
      "/startup/controlledEntityId",
      "The startup camera target must be the startup controlled subject in V1.",
      { cameraTargetEntityId: camera.components.cameraRig.target.entityId },
    );
  }

  const spawn = nodes.get(spec.startup.spawnAnchorId);
  const terrain = terrains[0];
  if (spawn?.kind === "anchor" && terrain?.kind === "terrain") {
    const [x, , z] = spawn.transform.positionMeters;
    const [centerX, centerZ] = terrain.components.terrain.grid.centerXZ;
    const [sizeX, sizeZ] = terrain.components.terrain.grid.sizeXZ;
    if (x < centerX - sizeX / 2 || x > centerX + sizeX / 2 || z < centerZ - sizeZ / 2 || z > centerZ + sizeZ / 2) {
      const index = spec.nodes.indexOf(spawn);
      error(
        diagnostics,
        "AUTHORING_SPAWN_OUT_OF_BOUNDS",
        `/nodes/${index}/transform/positionMeters`,
        "The startup spawn anchor must lie inside the terrain grid.",
      );
    }
  }

  const [minimum, maximum] = spec.world.bounds.heightRangeMeters;
  if (minimum >= maximum) {
    error(
      diagnostics,
      "AUTHORING_RANGE_INVALID",
      "/world/bounds/heightRangeMeters",
      "heightRangeMeters minimum must be less than maximum.",
    );
  }
  return {
    diagnostics,
    subjectDefinitions: [...subjectDefinitionsByRef.values()].sort((left, right) =>
      left.kitRef.localeCompare(right.kitRef),
    ),
  };
}

export function normalizeAuthoringSpec(
  value: unknown,
  options: NormalizeAuthoringOptionsV1 = {},
): NormalizeAuthoringResult {
  const schemaResult = validateAuthoringSpec(value);
  if (!schemaResult.ok || schemaResult.value === undefined) {
    return { ok: false, diagnostics: schemaResult.diagnostics };
  }

  const { diagnostics, subjectDefinitions } = validateSemantics(
    schemaResult.value,
    options.subjectDefinitionRegistry ?? builtInSubjectDefinitionRegistry,
  );
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { ok: false, diagnostics };
  }

  const spec = schemaResult.value;
  const normalized: NormalizedWorldIRV1 = {
    kind: "worldkit-normalized-world",
    schemaVersion: 1,
    id: spec.id,
    seed: spec.seed,
    ...(spec.provenance === undefined ? {} : { provenance: structuredClone(spec.provenance) }),
    world: structuredClone(spec.world),
    resources: {
      prototypes: [...spec.resources.prototypes]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((prototype) => structuredClone(prototype)),
      subjectDefinitions: subjectDefinitions.map((definition) => structuredClone(definition)),
    },
    nodes: [...spec.nodes]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) => normalizeNode(node, spec.startup)),
    startup: structuredClone(spec.startup),
  };
  return {
    ok: true,
    value: normalized,
    diagnostics: [],
    normalizedWorldIrHash: sha256CanonicalJson(normalized),
  };
}
