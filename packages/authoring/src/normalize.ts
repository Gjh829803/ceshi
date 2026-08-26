import {
  builtInSubjectResourceRegistry,
  type RegistrySubjectDefinitionV3,
} from "@whitebox-world/subject-registry";

import { sha256CanonicalJson } from "./canonical-json";
import { ResourceLockBuilderV1 } from "./resource-lock";
import { normalizeSubjectDefinitionV2 } from "./subject-definition-normalizer";
import type {
  AuthoringDocumentBase,
  AuthoringDiagnostic,
  NormalizeAuthoringOptions,
  NormalizeAuthoringBaseResult,
  NormalizedProceduralTerrainSourceV2,
  NormalizedSubjectDefinitionV2,
  NormalizedTransformV2,
  NormalizedWorldBase,
  NormalizedWorldNodeV2,
  MountedOnRelationshipSpecV1,
  PackageSubjectDefinitionV1,
  ProceduralTerrainSourceSpecV2,
} from "./types";
import type {
  AuthoringSpecV4,
  NormalizeAuthoringBaseV4Result,
  WorldNodeSpecV4,
} from "./types-v4.js";
import { validateAuthoringSpecV4 } from "./validate-v4.js";

type AuthoringBaseSpec = AuthoringSpecV4;
type AuthoringWorldNode = WorldNodeSpecV4;

const SUPPORTED_CAMERA_RIG = "worldkit://camera/third-person.standard@1";

const RELIEF_DEFAULTS_V2: Readonly<
  Record<
    ProceduralTerrainSourceSpecV2["relief"],
    Omit<NormalizedProceduralTerrainSourceV2, "kind" | "relief">
  >
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

function addError(
  diagnostics: AuthoringDiagnostic[],
  code: string,
  instancePath: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): void {
  diagnostics.push({
    severity: "error",
    code,
    instancePath,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function buildUniqueIndex<T extends { id: string }>(
  values: readonly T[],
  basePath: string,
  diagnostics: AuthoringDiagnostic[],
): Map<string, T> {
  const result = new Map<string, T>();
  values.forEach((value, index) => {
    if (result.has(value.id)) {
      addError(
        diagnostics,
        "AUTHORING_ID_DUPLICATE",
        `${basePath}/${index}/id`,
        `Duplicate ID '${value.id}'.`,
        { id: value.id },
      );
    } else {
      result.set(value.id, value);
    }
  });
  return result;
}

function requireNodeKind(
  nodes: ReadonlyMap<string, AuthoringWorldNode>,
  id: string,
  kind: AuthoringWorldNode["kind"],
  instancePath: string,
  diagnostics: AuthoringDiagnostic[],
): void {
  const node = nodes.get(id);
  if (node === undefined) {
    addError(
      diagnostics,
      "AUTHORING_REFERENCE_NOT_FOUND",
      instancePath,
      `Node '${id}' does not exist.`,
      { id },
    );
  } else if (node.kind !== kind) {
    addError(
      diagnostics,
      "AUTHORING_REFERENCE_KIND_MISMATCH",
      instancePath,
      `Node '${id}' is '${node.kind}', expected '${kind}'.`,
      { id, actualKind: node.kind, expectedKind: kind },
    );
  }
}

const IMPLEMENTED_MOUNTED_ON_PROFILE_REF =
  "worldkit://relationship-profile/mounted-on.stand-ground@1";

type MountedOnRelationshipProfile = Extract<
  NormalizedSubjectDefinitionV2["capabilityAssembly"]["relationshipProfiles"][number],
  { relationshipType: "mountedOn" }
>;

function normalizeMountedOnRelationships(
  relationships: readonly MountedOnRelationshipSpecV1[],
  nodes: ReadonlyMap<string, AuthoringWorldNode>,
  subjectDefinitions: readonly NormalizedSubjectDefinitionV2[],
  controlledEntityId: string,
  diagnostics: AuthoringDiagnostic[],
): readonly MountedOnRelationshipSpecV1[] {
  const definitionsByRef = new Map(
    subjectDefinitions.map((definition) => [definition.subjectDefinitionRef, definition]),
  );
  const occupiedRiderIds = new Set<string>();
  const occupiedMountSlotKeys = new Set<string>();

  relationships.forEach((relationship, index) => {
    const relationshipPath = `/relationships/${index}`;
    const rider = nodes.get(relationship.riderEntityId);
    const mount = nodes.get(relationship.mountEntityId);
    requireNodeKind(
      nodes,
      relationship.riderEntityId,
      "subject",
      `${relationshipPath}/riderEntityId`,
      diagnostics,
    );
    requireNodeKind(
      nodes,
      relationship.mountEntityId,
      "subject",
      `${relationshipPath}/mountEntityId`,
      diagnostics,
    );

    if (relationship.riderEntityId === relationship.mountEntityId) {
      addError(
        diagnostics,
        "AUTHORING_RELATIONSHIP_ENDPOINTS_INVALID",
        relationshipPath,
        "A mountedOn Rider and Mount must be different Subject Entities.",
        { entityId: relationship.riderEntityId },
      );
    }

    const riderDefinition = rider?.kind === "subject"
      ? definitionsByRef.get(rider.subjectDefinitionRef)
      : undefined;
    const mountDefinition = mount?.kind === "subject"
      ? definitionsByRef.get(mount.subjectDefinitionRef)
      : undefined;
    const mountSlot = mountDefinition?.mountSlots.find(
      ({ id }) => id === relationship.mountSlotId,
    );
    if (mountDefinition !== undefined && mountSlot === undefined) {
      addError(
        diagnostics,
        "AUTHORING_MOUNT_SLOT_NOT_FOUND",
        `${relationshipPath}/mountSlotId`,
        `Mount Subject '${relationship.mountEntityId}' does not declare Mount slot '${relationship.mountSlotId}'.`,
        {
          mountEntityId: relationship.mountEntityId,
          mountSlotId: relationship.mountSlotId,
        },
      );
    }

    const relationshipProfile = mountDefinition?.capabilityAssembly.relationshipProfiles
      .find((profile): profile is MountedOnRelationshipProfile =>
        profile.resourceRef === IMPLEMENTED_MOUNTED_ON_PROFILE_REF &&
        profile.relationshipType === "mountedOn" &&
        profile.runtimeStatus === "implemented"
      );
    if (mountDefinition !== undefined && relationshipProfile === undefined) {
      addError(
        diagnostics,
        "AUTHORING_RELATIONSHIP_PROFILE_UNAVAILABLE",
        relationshipPath,
        `Mount Subject '${relationship.mountEntityId}' does not resolve the exact implemented mountedOn Relationship Profile.`,
        {
          mountEntityId: relationship.mountEntityId,
          requiredRelationshipProfileRef: IMPLEMENTED_MOUNTED_ON_PROFILE_REF,
        },
      );
    }

    if (relationshipProfile !== undefined) {
      const riderSocketIds = new Set(riderDefinition?.sockets.map(({ id }) => id) ?? []);
      const mountSocketIds = new Set(mountDefinition?.sockets.map(({ id }) => id) ?? []);
      const missingRiderSocketId = relationshipProfile.requiredRiderSocketIds.find(
        (socketId) => !riderSocketIds.has(socketId),
      );
      const missingMountSocketId = relationshipProfile.requiredMountSocketIds.find(
        (socketId) => !mountSocketIds.has(socketId),
      );
      if (missingRiderSocketId !== undefined || missingMountSocketId !== undefined) {
        addError(
          diagnostics,
          "AUTHORING_RELATIONSHIP_PROFILE_UNSATISFIED",
          relationshipPath,
          "The Rider or Mount is missing a Socket required by the mountedOn Relationship Profile.",
          {
            ...(missingRiderSocketId === undefined ? {} : { missingRiderSocketId }),
            ...(missingMountSocketId === undefined ? {} : { missingMountSocketId }),
          },
        );
      }
      if (
        mountSlot !== undefined &&
        !relationshipProfile.requiredMountSocketIds.includes(mountSlot.mountSocketId)
      ) {
        addError(
          diagnostics,
          "AUTHORING_RELATIONSHIP_PROFILE_UNSATISFIED",
          `${relationshipPath}/mountSlotId`,
          `Mount slot '${mountSlot.id}' targets Socket '${mountSlot.mountSocketId}', which is not allowed by the mountedOn Relationship Profile.`,
          {
            mountSlotId: mountSlot.id,
            mountSocketId: mountSlot.mountSocketId,
            relationshipProfileRef: relationshipProfile.resourceRef,
          },
        );
      }
    }

    if (occupiedRiderIds.has(relationship.riderEntityId)) {
      addError(
        diagnostics,
        "AUTHORING_MOUNTED_ON_RIDER_OCCUPIED",
        `${relationshipPath}/riderEntityId`,
        `Rider '${relationship.riderEntityId}' is already a Rider in another mountedOn Relationship.`,
        { riderEntityId: relationship.riderEntityId },
      );
    }
    occupiedRiderIds.add(relationship.riderEntityId);

    const mountSlotKey = `${relationship.mountEntityId}\u0000${relationship.mountSlotId}`;
    if (occupiedMountSlotKeys.has(mountSlotKey)) {
      addError(
        diagnostics,
        "AUTHORING_MOUNT_SLOT_OCCUPIED",
        relationshipPath,
        `Mount slot '${relationship.mountSlotId}' on '${relationship.mountEntityId}' is already occupied.`,
        {
          mountEntityId: relationship.mountEntityId,
          mountSlotId: relationship.mountSlotId,
        },
      );
    }
    occupiedMountSlotKeys.add(mountSlotKey);

    if (controlledEntityId !== relationship.mountEntityId) {
      addError(
        diagnostics,
        "AUTHORING_MOUNTED_ON_POSSESSION_MISMATCH",
        "/startup/controlledEntityId",
        "An initial mountedOn Relationship requires matching initial possession of its Mount.",
        {
          controlledEntityId,
          riderEntityId: relationship.riderEntityId,
          requiredControlledEntityId: relationship.mountEntityId,
        },
      );
    }
  });

  return [...relationships]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((relationship) => structuredClone(relationship));
}

function normalizeTransformV2(transform: {
  positionMetersXYZ: readonly [number, number, number];
  rotationEulerRadiansXYZ?: readonly [number, number, number];
  scaleXYZ?: readonly [number, number, number];
}): NormalizedTransformV2 {
  return {
    positionMetersXYZ: [...transform.positionMetersXYZ],
    rotationEulerRadiansXYZ: [...(transform.rotationEulerRadiansXYZ ?? [0, 0, 0])],
    scaleXYZ: [...(transform.scaleXYZ ?? [1, 1, 1])],
  };
}

function normalizeTerrainSourceV2(
  source: ProceduralTerrainSourceSpecV2,
): NormalizedProceduralTerrainSourceV2 {
  const defaults = RELIEF_DEFAULTS_V2[source.relief];
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

function normalizeNodeV2(
  node: AuthoringWorldNode,
  startup: AuthoringDocumentBase["startup"],
  finalTransformsByEntityId: Readonly<Record<string, NormalizedTransformV2>>,
  fallbackPositionMetersXYZ: readonly [number, number, number],
): NormalizedWorldNodeV2 {
  switch (node.kind) {
    case "terrain":
      return {
        ...structuredClone(node),
        components: {
          terrain: {
            ...structuredClone(node.components.terrain),
            source: normalizeTerrainSourceV2(node.components.terrain.source),
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
    case "anchor": {
      const finalTransform = finalTransformsByEntityId[node.id];
      const transform = finalTransform ?? (
        node.placement.kind === "fixed"
          ? normalizeTransformV2(node.placement.transform)
          : node.placement.initialTransform === undefined
            ? normalizeTransformV2({ positionMetersXYZ: fallbackPositionMetersXYZ })
            : normalizeTransformV2(node.placement.initialTransform)
      );
      const { placement: _placement, ...nodeWithoutPlacement } = node;
      return { ...structuredClone(nodeWithoutPlacement), transform };
    }
    case "subject": {
      const spawnAnchorEntityId =
        node.spawnAnchorEntityId ??
        (node.id === startup.controlledEntityId
          ? startup.spawnAnchorEntityId
          : undefined);
      if (spawnAnchorEntityId === undefined) {
        throw new Error(
          `Normalized World IR invariant violated: Subject '${node.id}' has no spawn anchor.`,
        );
      }
      return { ...structuredClone(node), spawnAnchorEntityId };
    }
    case "camera":
      return {
        ...structuredClone(node),
        components: {
          cameraRig: {
            ...structuredClone(node.components.cameraRig),
            thirdPerson: {
              pitchRadians: node.components.cameraRig.thirdPerson.pitchRadians,
              distanceMeters: node.components.cameraRig.thirdPerson.distanceMeters,
              targetHeightMeters: node.components.cameraRig.thirdPerson.targetHeightMeters,
              fovDegrees: node.components.cameraRig.thirdPerson.fovDegrees,
            },
          },
        },
      };
  }
}

interface ResolvedDefinitionInputV2 {
  definition: PackageSubjectDefinitionV1 | RegistrySubjectDefinitionV3;
  subjectDefinitionRef: string;
  source: "package" | "registry";
  instancePath: string;
}

function packageDefinitionRef(definition: PackageSubjectDefinitionV1): string {
  return `package://subject-definition/${definition.id}@${definition.version}`;
}

export interface NormalizeAuthoringBaseV4Options extends NormalizeAuthoringOptions {
  readonly finalTransformsByEntityId?: Readonly<Record<string, NormalizedTransformV2>>;
}

export function normalizeAuthoringBaseV4(
  value: unknown,
  options: NormalizeAuthoringBaseV4Options = {},
): NormalizeAuthoringBaseV4Result {
  const schemaResult = validateAuthoringSpecV4(value);
  if (!schemaResult.ok || schemaResult.value === undefined) {
    return { ok: false, diagnostics: schemaResult.diagnostics };
  }
  return normalizeValidatedAuthoringBase(schemaResult.value, options);
}

function normalizeValidatedAuthoringBase(
  spec: AuthoringBaseSpec,
  options: NormalizeAuthoringBaseV4Options,
): NormalizeAuthoringBaseResult {
  const diagnostics: AuthoringDiagnostic[] = [];
  const subjectResourceRegistry =
    options.subjectResourceRegistry ?? builtInSubjectResourceRegistry;
  const packageDefinitionsByRef = new Map<string, PackageSubjectDefinitionV1>();
  const definitionsToNormalizeByRef = new Map<string, ResolvedDefinitionInputV2>();

  spec.resources.subjectDefinitions.forEach((definition, index) => {
    const resourceRef = packageDefinitionRef(definition);
    if (packageDefinitionsByRef.has(resourceRef)) {
      addError(
        diagnostics,
        "SUBJECT_DEFINITION_DUPLICATE",
        `/resources/subjectDefinitions/${index}`,
        `Duplicate Package Subject Definition '${resourceRef}'.`,
        { subjectDefinitionRef: resourceRef },
      );
      return;
    }
    packageDefinitionsByRef.set(resourceRef, definition);
    definitionsToNormalizeByRef.set(resourceRef, {
      definition,
      subjectDefinitionRef: resourceRef,
      source: "package",
      instancePath: `/resources/subjectDefinitions/${index}`,
    });
  });

  const prototypes = buildUniqueIndex(
    spec.resources.prototypes,
    "/resources/prototypes",
    diagnostics,
  );
  const nodes = buildUniqueIndex(spec.nodes, "/nodes", diagnostics);

  spec.rules.forEach((rule, index) => {
    addError(
      diagnostics,
      "AUTHORING_FEATURE_NOT_SUPPORTED",
      `/rules/${index}`,
      `Rule '${rule.kind}' is not supported by AuthoringSpec V${spec.schemaVersion}.`,
      { feature: "rules", kind: rule.kind },
    );
  });

  const terrains = spec.nodes.filter((node) => node.kind === "terrain");
  if (terrains.length !== 1) {
    addError(
      diagnostics,
      "AUTHORING_CARDINALITY_INVALID",
      "/nodes",
      `AuthoringSpec V${spec.schemaVersion} requires exactly one Terrain node; received ${terrains.length}.`,
      { kind: "terrain", expected: 1, actual: terrains.length },
    );
  }

  spec.nodes.forEach((node, index) => {
    if (node.kind === "object") {
      const match = /^package:\/\/prototype\/([a-z0-9][a-z0-9.-]{0,63})@([1-9][0-9]*)$/.exec(
        node.prototypeRef,
      );
      const prototype = match === null ? undefined : prototypes.get(match[1]!);
      if (
        match === null ||
        prototype === undefined ||
        prototype.version !== Number(match[2])
      ) {
        addError(
          diagnostics,
          "AUTHORING_REFERENCE_NOT_FOUND",
          `/nodes/${index}/prototypeRef`,
          `Prototype reference '${node.prototypeRef}' does not resolve to an exact Package Prototype version.`,
          { resourceRef: node.prototypeRef },
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
      const definitionPath = `/nodes/${index}/subjectDefinitionRef`;
      if (node.subjectDefinitionRef.startsWith("package://")) {
        const definition = packageDefinitionsByRef.get(node.subjectDefinitionRef);
        if (definition === undefined) {
          addError(
            diagnostics,
            "SUBJECT_DEFINITION_NOT_FOUND",
            definitionPath,
            `Package Subject Definition '${node.subjectDefinitionRef}' does not exist.`,
            {
              subjectDefinitionRef: node.subjectDefinitionRef,
              availableSubjectDefinitionRefs: [...packageDefinitionsByRef.keys()].sort(),
            },
          );
        }
      } else {
        const definition = subjectResourceRegistry.resolveSubjectDefinition(
          node.subjectDefinitionRef,
        );
        if (definition === undefined) {
          addError(
            diagnostics,
            "SUBJECT_DEFINITION_NOT_FOUND",
            definitionPath,
            `Registry Subject Definition '${node.subjectDefinitionRef}' does not exist.`,
            {
              subjectDefinitionRef: node.subjectDefinitionRef,
              availableSubjectDefinitionRefs: subjectResourceRegistry
                .listDiscoverableResources({ kind: "subject-definition" })
                .map((candidate) => candidate.resourceRef),
            },
          );
        } else if (!definitionsToNormalizeByRef.has(node.subjectDefinitionRef)) {
          definitionsToNormalizeByRef.set(node.subjectDefinitionRef, {
            definition,
            subjectDefinitionRef: node.subjectDefinitionRef,
            source: "registry",
            instancePath: definitionPath,
          });
        }
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
        addError(
          diagnostics,
          "AUTHORING_SUBJECT_SPAWN_REQUIRED",
          `/nodes/${index}/spawnAnchorEntityId`,
          "Every Subject except the startup controlled Subject must declare spawnAnchorEntityId.",
          { subjectEntityId: node.id },
        );
      }
    } else if (node.kind === "camera") {
      const rig = node.components.cameraRig;
      if (
        rig.defaultRigRef !== SUPPORTED_CAMERA_RIG ||
        rig.allowedRigRefs.some((resourceRef) => resourceRef !== SUPPORTED_CAMERA_RIG)
      ) {
        addError(
          diagnostics,
          "AUTHORING_RESOURCE_NOT_SUPPORTED",
          `/nodes/${index}/components/cameraRig`,
          `AuthoringSpec V${spec.schemaVersion} supports only the standard third-person Camera Rig.`,
          { supportedResourceRefs: [SUPPORTED_CAMERA_RIG] },
        );
      }
      if (!rig.allowedRigRefs.includes(rig.defaultRigRef)) {
        addError(
          diagnostics,
          "AUTHORING_DEFAULT_NOT_ALLOWED",
          `/nodes/${index}/components/cameraRig/defaultRigRef`,
          "The default Camera Rig must also appear in allowedRigRefs.",
        );
      }
      requireNodeKind(
        nodes,
        rig.target.targetEntityId,
        "subject",
        `/nodes/${index}/components/cameraRig/target/targetEntityId`,
        diagnostics,
      );
    }
  });

  requireNodeKind(
    nodes,
    spec.startup.spawnAnchorEntityId,
    "anchor",
    "/startup/spawnAnchorEntityId",
    diagnostics,
  );
  requireNodeKind(
    nodes,
    spec.startup.controlledEntityId,
    "subject",
    "/startup/controlledEntityId",
    diagnostics,
  );
  requireNodeKind(
    nodes,
    spec.startup.cameraEntityId,
    "camera",
    "/startup/cameraEntityId",
    diagnostics,
  );

  const controlled = nodes.get(spec.startup.controlledEntityId);
  const camera = nodes.get(spec.startup.cameraEntityId);
  if (
    controlled?.kind === "subject" &&
    camera?.kind === "camera" &&
    camera.components.cameraRig.target.targetEntityId !== controlled.id
  ) {
    addError(
      diagnostics,
      "AUTHORING_STARTUP_TARGET_MISMATCH",
      "/startup/controlledEntityId",
      "The startup Camera target must be the startup controlled Subject.",
      { cameraTargetEntityId: camera.components.cameraRig.target.targetEntityId },
    );
  }

  const spawn = nodes.get(spec.startup.spawnAnchorEntityId);
  const terrain = terrains[0];
  if (spawn?.kind === "anchor" && terrain?.kind === "terrain") {
    const fallbackPositionMetersXYZ = [
      spec.world.bounds.centerMetersXZ[0],
      0,
      spec.world.bounds.centerMetersXZ[1],
    ] as const;
    const spawnTransform = options.finalTransformsByEntityId?.[spawn.id] ?? (
      spawn.placement.kind === "fixed"
        ? normalizeTransformV2(spawn.placement.transform)
        : spawn.placement.initialTransform === undefined
          ? normalizeTransformV2({ positionMetersXYZ: fallbackPositionMetersXYZ })
          : normalizeTransformV2(spawn.placement.initialTransform)
    );
    const [x, , z] = spawnTransform.positionMetersXYZ;
    const [centerX, centerZ] = terrain.components.terrain.grid.centerMetersXZ;
    const [sizeX, sizeZ] = terrain.components.terrain.grid.sizeMetersXZ;
    if (
      x < centerX - sizeX / 2 ||
      x > centerX + sizeX / 2 ||
      z < centerZ - sizeZ / 2 ||
      z > centerZ + sizeZ / 2
    ) {
      const index = spec.nodes.indexOf(spawn);
      addError(
        diagnostics,
        "AUTHORING_SPAWN_OUT_OF_BOUNDS",
        `/nodes/${index}/placement/transform/positionMetersXYZ`,
        "The startup Spawn Anchor must lie inside the Terrain grid.",
      );
    }
  }

  const [minimumHeightMeters, maximumHeightMeters] =
    spec.world.bounds.heightRangeMeters;
  if (minimumHeightMeters >= maximumHeightMeters) {
    addError(
      diagnostics,
      "AUTHORING_RANGE_INVALID",
      "/world/bounds/heightRangeMeters",
      "heightRangeMeters minimum must be less than maximum.",
    );
  }

  const resourceLockBuilder = new ResourceLockBuilderV1();
  const subjectDefinitions = [...definitionsToNormalizeByRef.values()]
    .sort((left, right) =>
      left.subjectDefinitionRef.localeCompare(right.subjectDefinitionRef),
    )
    .flatMap((input) => {
      const normalized = normalizeSubjectDefinitionV2({
        ...input,
        subjectResourceRegistry,
        resourceLockBuilder,
        diagnostics,
        resourceBudget: spec.world.resourceBudget,
      });
      return normalized === undefined ? [] : [normalized];
    });
  const {
    subjectAssets,
    rigProfiles,
    animationSets,
    colliderProfiles,
    resourceLock,
    resourceLockHash,
  } = resourceLockBuilder.finish();
  const relationships = normalizeMountedOnRelationships(
    spec.relationships,
    nodes,
    subjectDefinitions,
    spec.startup.controlledEntityId,
    diagnostics,
  );

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { ok: false, diagnostics };
  }

  const normalized: NormalizedWorldBase = {
    id: spec.id,
    seed: spec.seed,
    ...(spec.provenance === undefined
      ? {}
      : { provenance: structuredClone(spec.provenance) }),
    world: structuredClone(spec.world),
    resources: {
      prototypes: [...spec.resources.prototypes]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((prototype) => structuredClone(prototype)),
      subjectDefinitions,
      subjectAssets,
      rigProfiles,
      animationSets,
      colliderProfiles,
      resourceLock,
      resourceLockHash,
    },
    nodes: [...spec.nodes]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) => normalizeNodeV2(
        node,
        spec.startup,
        options.finalTransformsByEntityId ?? {},
        [spec.world.bounds.centerMetersXZ[0], 0, spec.world.bounds.centerMetersXZ[1]],
      )),
    relationships,
    startup: structuredClone(spec.startup),
  };

  return {
    ok: true,
    value: normalized,
    diagnostics: [],
    normalizedWorldIrHash: sha256CanonicalJson(normalized),
  };
}
