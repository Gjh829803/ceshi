import { worldPackageRefFromRootHashV1 } from "@whitebox-world/world-identity";

import {
  hashAuthoringDocumentV4,
  normalizeAuthoringSpecV4,
  parseCanonicalJson,
  parseAuthoringSpecV4,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type AuthoringDiagnostic,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import {
  createCoreGameplayBootstrapV1,
  type GameplayActionRequestResolverV1,
} from "@whitebox-world/gameplay";
import {
  createGameplayBootstrapResourceLockEntryV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import {
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
  type RegistrySubjectDefinitionV3,
  type SubjectRegistryResourceInputV3,
  type SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";
import type {
  CompileDiagnostic,
  ExecutionPlanV5,
  SceneBriefImplementationMapV1,
  VisualCaptureGroupV1,
} from "@whitebox-world/runtime-contracts";
import {
  canonicalWorldkitBrowserRouteEvidencePublicationV2,
  validateSceneBriefImplementationMapV1,
  type WorldkitBrowserRouteEvidencePublicationV2,
} from "@whitebox-world/runtime-contracts";
import type { RuntimeWorldConfigurationV1 } from "@whitebox-world/runtime-host";
import {
  BABYLON_WEB_WORLD_PACKAGE_HOST_POLICY_V1,
  assertWorldPackageHostCompatibilityV2,
  createWorldPackageV2,
  verifyWorldPackageDirectoryV2,
  type ResolvedWorldPackageResourceArtifactV2,
  type WorldPackageBuildContextV2,
  type WorldPackageStoreV1,
} from "@whitebox-world/world-package";
import { isNil, uniq } from "lodash-es";

import {
  PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
  PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
  resolveWorldPackageSubjectAssetArtifactsV2,
} from "./worldkit-asset-resolver.js";
import { createPlaygroundWorldPackageBuildContextV2 } from "./playground-world-package-v2.js";
import {
  MOUNTED_SKATEBOARD_S1_SCENE_ID,
  augmentMountedSkateboardS1AuthoringSpecV1,
  createMountedSkateboardS1GameplayResourcesV1,
} from "./scenes/mounted-skateboard-s1.js";

type CapabilityDemoResourceBudgetV1 = Readonly<
  AuthoringSpecV4["world"]["resourceBudget"]
>;

type CapabilityDemoPositionMetersXYZV1 = readonly [number, number, number];

export type CapabilityDemoHostOverlayChangeV1 =
  | Readonly<{
      type: "subject-definition-replaced";
      subjectEntityId: string;
      beforeSubjectDefinitionRef: string;
      afterSubjectDefinitionRef: string;
    }>
  | Readonly<{
      type: "resource-budget-changed";
      beforeResourceBudget: CapabilityDemoResourceBudgetV1;
      afterResourceBudget: CapabilityDemoResourceBudgetV1;
    }>
  | Readonly<{
      type: "spawn-position-changed";
      spawnAnchorEntityId: string;
      beforePositionMetersXYZ: CapabilityDemoPositionMetersXYZV1;
      afterPositionMetersXYZ: CapabilityDemoPositionMetersXYZV1;
    }>
  | Readonly<{
      type: "relationship-capabilities-deferred";
      sourceSubjectDefinitionRef: string;
      runtimeSubjectDefinitionRef: string;
      deferredCapabilityRefs: readonly string[];
    }>;

export interface CapabilityDemoHostOverlayV1 {
  readonly schemaVersion: 1;
  readonly kind: "capability-demo";
  readonly id: "capability-demo";
  readonly subjectDefinitionRef: string;
  readonly changes: readonly CapabilityDemoHostOverlayChangeV1[];
}

export interface AuthoringSceneLoadResult {
  ok: boolean;
  executionPlan?: ExecutionPlanV5;
  normalizedWorldIrHash?: string;
  executionPlanHash?: string;
  diagnostics: readonly (AuthoringDiagnostic | CompileDiagnostic)[];
  hostOverlay?: CapabilityDemoHostOverlayV1;
  routeEvidencePublication?: WorldkitBrowserRouteEvidencePublicationV2;
  /** Internal Host bootstrap. This is intentionally not a public Browser DTO. */
  runtimeWorldConfiguration?: RuntimeWorldConfigurationV1;
  /** Trusted Host-only resolver; never exposed through Browser Protocol V5. */
  gameplayActionRequestResolver?: GameplayActionRequestResolverV1;
  /** Trusted Host-only Authoring document; never exposed through Browser Protocol V5. */
  authoringSpec?: AuthoringSpecV4;
  authoringSpecHash?: `sha256:${string}`;
  /** Host-only V2 package context used by the Authoring/Edit publication owner. */
  worldPackageBuildContext?: WorldPackageBuildContextV2;
  /** Host-only exact resource closure used by the Authoring/Edit publication owner. */
  worldPackageResourceArtifacts?: readonly ResolvedWorldPackageResourceArtifactV2[];
}

export type AuthoringSourceFetcher = () => Promise<Response>;

export interface AuthoringSceneLoadOptionsV1 {
  subjectDefinitionRef?: string;
  fetchRouteEvidence?: AuthoringSourceFetcher;
  fetchSubjectAsset?: typeof fetch;
  worldPackageStore?: WorldPackageStoreV1;
}

export interface StudioPreviewBootstrapV1 {
  readonly kind: "worldkit-studio-preview-bootstrap";
  readonly schemaVersion: 1;
  readonly worldId: string;
  readonly sceneId: string;
  readonly attempt: number;
  readonly attemptStartedAt: string;
  readonly authoringSpecHash: `sha256:${string}`;
  readonly authoringSpec: AuthoringSpecV4;
  readonly implementationMap: SceneBriefImplementationMapV1;
}

export async function loadStudioAuthoringPreviewV1(
  worldId: string,
  fetchSource: AuthoringSourceFetcher,
  options: AuthoringSceneLoadOptionsV1 = {},
): Promise<Readonly<{
  loaded: AuthoringSceneLoadResult;
  visualCaptureGroups: readonly VisualCaptureGroupV1[];
  attempt: number;
  attemptStartedAt: string;
}>> {
  let response: Response;
  try {
    response = await fetchSource();
  } catch (error) {
    throw new Error("Unable to fetch the Studio Preview bootstrap.", {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new Error(`Studio Preview bootstrap returned HTTP ${response.status}.`);
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    throw new Error("Studio Preview bootstrap is not valid JSON.", { cause: error });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Studio Preview bootstrap must be a JSON object.");
  }
  const payload = value as Partial<StudioPreviewBootstrapV1>;
  const attempt = payload.attempt;
  const attemptStartedAt = payload.attemptStartedAt;
  if (
    payload.kind !== "worldkit-studio-preview-bootstrap" ||
    payload.schemaVersion !== 1 ||
    payload.worldId !== worldId ||
    typeof payload.sceneId !== "string" || !payload.sceneId ||
    !Number.isInteger(attempt) || (attempt ?? 0) < 1 ||
    typeof attemptStartedAt !== "string" ||
      !Number.isFinite(Date.parse(attemptStartedAt)) ||
    typeof payload.authoringSpecHash !== "string" ||
    payload.authoringSpec === null || typeof payload.authoringSpec !== "object" ||
      Array.isArray(payload.authoringSpec) ||
    payload.implementationMap === null ||
      typeof payload.implementationMap !== "object" ||
      Array.isArray(payload.implementationMap) ||
    !Array.isArray(payload.implementationMap.visualTargetMappings) ||
    !Array.isArray(payload.implementationMap.visualCaptureGroups)
  ) {
    throw new Error("Studio Preview bootstrap wrapper is invalid.");
  }
  const implementationMap = payload.implementationMap as SceneBriefImplementationMapV1;
  const implementationMapErrors = validateSceneBriefImplementationMapV1(implementationMap);
  const canonicalAuthoringSpecHash = sha256CanonicalJson(payload.authoringSpec);
  if (
    implementationMapErrors.length > 0 ||
    payload.authoringSpec.kind !== "worldkit-authoring-spec" ||
    payload.authoringSpec.schemaVersion !== 4 ||
    payload.authoringSpec.id !== payload.sceneId ||
    implementationMap.sceneId !== payload.sceneId ||
    implementationMap.authoringSpecId !== payload.authoringSpec.id ||
    payload.authoringSpecHash !== canonicalAuthoringSpecHash ||
    implementationMap.authoringSpecHash !== canonicalAuthoringSpecHash
  ) {
    throw new Error(
      `Studio Preview bootstrap authority is invalid${
        implementationMapErrors.length === 0
          ? "."
          : `: ${implementationMapErrors.join(" ")}`
      }`,
    );
  }
  const loaded = await loadAuthoringScene(
    async () => new Response(stringifyCanonicalJson(payload.authoringSpec), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    options,
  );
  return Object.freeze({
    loaded,
    visualCaptureGroups: Object.freeze(
      implementationMap.visualCaptureGroups.map((target) => Object.freeze({
        ...target,
        runtimeEntityIds: Object.freeze([...target.runtimeEntityIds]),
      })),
    ),
    attempt: attempt as number,
    attemptStartedAt,
  });
}
const CAPABILITY_PLAYGROUND_MINIMUM_RESOURCE_BUDGET = Object.freeze({
  maxVertices: 200_000,
  maxTriangles: 300_000,
  maxColliders: 128,
});

function createRuntimeGameplayBootstrap(
  normalizedWorldIr: NormalizedWorldIRV4,
): GameplayBootstrapV1 {
  const entityDescriptors = normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) =>
          candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (isNil(definition)) {
        throw new Error(
          `AUTHORING_GAMEPLAY_SUBJECT_DEFINITION_MISSING: ${node.subjectDefinitionRef}`,
        );
      }
      return {
        id: node.id,
        entityDefinitionRef: node.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      };
    });
  return createCoreGameplayBootstrapV1({
    worldId: normalizedWorldIr.id,
    worldSeed: normalizedWorldIr.seed,
    entityDescriptors,
    initialRelationshipStates: normalizedWorldIr.relationships.map(
      (relationship) => ({ ...relationship, establishedSimulationTick: 0 }),
    ),
  });
}

function frozenResourceBudget(
  resourceBudget: AuthoringSpecV4["world"]["resourceBudget"],
): CapabilityDemoResourceBudgetV1 {
  return Object.freeze({ ...resourceBudget });
}

function frozenPositionMetersXYZ(
  positionMetersXYZ: CapabilityDemoPositionMetersXYZV1,
): CapabilityDemoPositionMetersXYZV1 {
  return Object.freeze([
    ...positionMetersXYZ,
  ]) as CapabilityDemoPositionMetersXYZV1;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function createRelationshipDeferredPreview(
  sourceSubjectDefinitionRef: string,
): Readonly<{
  definition: RegistrySubjectDefinitionV3;
  registry: SubjectResourceRegistryV3;
  deferredCapabilityRefs: readonly string[];
}> | undefined {
  const source = builtInSubjectResourceRegistry.resolveSubjectDefinition(
    sourceSubjectDefinitionRef,
  );
  if (
    source === undefined ||
    !("schemaVersion" in source) ||
    source.schemaVersion !== 3 ||
    source.relationshipCapabilityRefs.length === 0
  ) {
    return undefined;
  }

  const deferredCapabilityRefs = Object.freeze(
    [...source.relationshipCapabilityRefs].sort((left, right) =>
      left.localeCompare(right)),
  );
  const deferredCapabilityRefSet = new Set(deferredCapabilityRefs);
  const { contentHash: _contentHash, ...sourceInput } = structuredClone(source);
  const previewInput = {
    ...sourceInput,
    id: `playground-preview.${source.id}`,
    resourceRef:
      `worldkit://subject-definition/playground-preview.${source.id}@${source.version}`,
    capabilityRefs: uniq([
      ...source.capabilityRefs.filter(
        (capabilityRef) =>
          !deferredCapabilityRefSet.has(capabilityRef) &&
          !capabilityRef.startsWith("worldkit://capability/locomotion."),
      ),
      "worldkit://capability/locomotion.ground@1",
    ]),
    relationshipCapabilityRefs: [],
  };
  const definition = deepFreeze({
    ...previewInput,
    contentHash: sha256CanonicalJson(previewInput),
  }) as RegistrySubjectDefinitionV3;
  const registryInputs = [
    ...builtInSubjectResourceRegistry.listDiscoverableResources(),
    definition,
  ].map((resource) => {
    const { contentHash: _contentHash, ...input } = structuredClone(resource);
    return input as SubjectRegistryResourceInputV3;
  });
  const registry: SubjectResourceRegistryV3 =
    createSubjectResourceRegistry(registryInputs);
  return Object.freeze({ definition, registry, deferredCapabilityRefs });
}

function sourceDiagnostic(message: string, details?: Readonly<Record<string, unknown>>): AuthoringSceneLoadResult {
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "AUTHORING_SOURCE_UNAVAILABLE",
        instancePath: "",
        message,
        ...(details === undefined ? {} : { details }),
      },
    ],
  };
}

async function sourceResponseDiagnosticCode(
  response: Response,
): Promise<string | undefined> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return undefined;
  }
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return undefined;
    const diagnostics = (body as { diagnostics?: unknown }).diagnostics;
    if (!Array.isArray(diagnostics)) return undefined;
    const firstDiagnostic: unknown = diagnostics[0];
    if (typeof firstDiagnostic !== "object" || firstDiagnostic === null) {
      return undefined;
    }
    const code = (firstDiagnostic as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

function applyCapabilityDemoContext(
  source: AuthoringSpecV4,
  subjectDefinitionRef: string,
): Readonly<{
  source: AuthoringSpecV4;
  hostOverlay?: CapabilityDemoHostOverlayV1;
  subjectResourceRegistry?: SubjectResourceRegistryV3;
}> {
  const controlledEntityId = source.startup.controlledEntityId;
  const controlledSubject = source.nodes.find(
    (node) => node.kind === "subject" && node.id === controlledEntityId,
  );
  if (controlledSubject === undefined || controlledSubject.kind !== "subject") {
    return { source };
  }
  const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
    subjectDefinitionRef,
  );
  const relationshipDeferredPreview = createRelationshipDeferredPreview(
    subjectDefinitionRef,
  );
  const runtimeSubjectDefinitionRef =
    relationshipDeferredPreview?.definition.resourceRef ?? subjectDefinitionRef;
  const motionProfile =
    definition !== undefined && "schemaVersion" in definition
      ? builtInSubjectResourceRegistry.resolveMotionProfile(
          definition.profiles.motion.defaultMotionProfileRef,
        )
      : undefined;
  const spawnAnchorId = controlledSubject.spawnAnchorEntityId;
  const water = source.nodes.find((node) => node.kind === "water");
  const spawnAnchor = source.nodes.find(
    (node) => node.kind === "anchor" && node.id === spawnAnchorId,
  );
  const beforeResourceBudget = source.world.resourceBudget;
  const afterResourceBudget = {
    maxVertices: Math.max(
      beforeResourceBudget.maxVertices,
      CAPABILITY_PLAYGROUND_MINIMUM_RESOURCE_BUDGET.maxVertices,
    ),
    maxTriangles: Math.max(
      beforeResourceBudget.maxTriangles,
      CAPABILITY_PLAYGROUND_MINIMUM_RESOURCE_BUDGET.maxTriangles,
    ),
    maxColliders: Math.max(
      beforeResourceBudget.maxColliders,
      CAPABILITY_PLAYGROUND_MINIMUM_RESOURCE_BUDGET.maxColliders,
    ),
  };
  const beforePositionMetersXYZ =
    spawnAnchor?.kind === "anchor" && spawnAnchor.placement.kind === "fixed"
    ? spawnAnchor.placement.transform.positionMetersXYZ
    : undefined;
  let afterPositionMetersXYZ: CapabilityDemoPositionMetersXYZV1 | undefined;
  if (
    beforePositionMetersXYZ !== undefined &&
    motionProfile?.motionKernelRef ===
      "worldkit://motion-kernel/water-surface@1" &&
    water?.kind === "water" &&
    water.components.water.boundary.kind === "ellipse"
  ) {
    const [x, z] = water.components.water.boundary.centerMetersXZ;
    afterPositionMetersXYZ = [x, beforePositionMetersXYZ[1], z];
  } else if (
    beforePositionMetersXYZ !== undefined &&
    motionProfile?.motionKernelRef ===
      "worldkit://motion-kernel/unpowered-glide@1"
  ) {
    afterPositionMetersXYZ = [
      beforePositionMetersXYZ[0],
      Math.max(12, beforePositionMetersXYZ[1]),
      beforePositionMetersXYZ[2],
    ];
  }

  const changes: CapabilityDemoHostOverlayChangeV1[] = [
    Object.freeze({
      type: "subject-definition-replaced",
      subjectEntityId: controlledEntityId,
      beforeSubjectDefinitionRef: controlledSubject.subjectDefinitionRef,
      afterSubjectDefinitionRef: runtimeSubjectDefinitionRef,
    }),
  ];
  if (relationshipDeferredPreview !== undefined) {
    changes.push(
      Object.freeze({
        type: "relationship-capabilities-deferred",
        sourceSubjectDefinitionRef: subjectDefinitionRef,
        runtimeSubjectDefinitionRef,
        deferredCapabilityRefs:
          relationshipDeferredPreview.deferredCapabilityRefs,
      }),
    );
  }
  if (
    beforeResourceBudget.maxVertices !== afterResourceBudget.maxVertices ||
    beforeResourceBudget.maxTriangles !== afterResourceBudget.maxTriangles ||
    beforeResourceBudget.maxColliders !== afterResourceBudget.maxColliders
  ) {
    changes.push(
      Object.freeze({
        type: "resource-budget-changed",
        beforeResourceBudget: frozenResourceBudget(beforeResourceBudget),
        afterResourceBudget: frozenResourceBudget(afterResourceBudget),
      }),
    );
  }
  if (
    beforePositionMetersXYZ !== undefined &&
    afterPositionMetersXYZ !== undefined &&
    spawnAnchor?.kind === "anchor" &&
    spawnAnchor.placement.kind === "fixed" &&
    beforePositionMetersXYZ.some(
      (coordinate, index) => coordinate !== afterPositionMetersXYZ[index],
    )
  ) {
    changes.push(
      Object.freeze({
        type: "spawn-position-changed",
        spawnAnchorEntityId: spawnAnchor.id,
        beforePositionMetersXYZ: frozenPositionMetersXYZ(
          beforePositionMetersXYZ,
        ),
        afterPositionMetersXYZ: frozenPositionMetersXYZ(
          afterPositionMetersXYZ,
        ),
      }),
    );
  }
  const hostOverlay = Object.freeze({
    schemaVersion: 1,
    kind: "capability-demo",
    id: "capability-demo",
    subjectDefinitionRef,
    changes: Object.freeze(changes),
  } satisfies CapabilityDemoHostOverlayV1);

  return {
    hostOverlay,
    ...(relationshipDeferredPreview === undefined
      ? {}
      : { subjectResourceRegistry: relationshipDeferredPreview.registry }),
    source: {
      ...source,
      // Subject Package selection is an explicit Playground demo overlay. Its
      // host world must be large enough for every registered Phase-1 package;
      // otherwise a valid art asset (notably the 49,112-triangle G Bot) is
      // rejected by an unrelated small-world example budget before Runtime.
      world: {
        ...source.world,
        resourceBudget: afterResourceBudget,
      },
      nodes: source.nodes.map((node) => {
        if (node.kind === "subject" && node.id === controlledEntityId) {
          return { ...node, subjectDefinitionRef: runtimeSubjectDefinitionRef };
        }
        if (
          node.kind !== "anchor" ||
          node.id !== spawnAnchorId ||
          node.placement.kind !== "fixed"
        ) {
          return node;
        }
        if (afterPositionMetersXYZ !== undefined) {
          return {
            ...node,
            placement: {
              ...node.placement,
              transform: {
                ...node.placement.transform,
                positionMetersXYZ: afterPositionMetersXYZ,
              },
            },
          };
        }
        return node;
      }),
    } as AuthoringSpecV4,
  };
}

type RouteEvidenceLoadResult =
  | Readonly<{
      ok: true;
      publication?: WorldkitBrowserRouteEvidencePublicationV2;
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly AuthoringDiagnostic[];
    }>;

function routeEvidenceDiagnostic(
  code: string,
  message: string,
  instancePath = "",
  details?: Readonly<Record<string, unknown>>,
): RouteEvidenceLoadResult {
  return {
    ok: false,
    diagnostics: [{
      severity: "error",
      code,
      instancePath,
      message,
      ...(details === undefined ? {} : { details }),
    }],
  };
}

async function loadRouteEvidence(
  fetchRouteEvidence: AuthoringSourceFetcher | undefined,
): Promise<RouteEvidenceLoadResult> {
  if (fetchRouteEvidence === undefined) return { ok: true };
  let response: Response;
  try {
    response = await fetchRouteEvidence();
  } catch (error) {
    return routeEvidenceDiagnostic(
      "WORLDKIT_ROUTE_EVIDENCE_SOURCE_UNAVAILABLE",
      "Unable to fetch the configured Route evidence.",
      "",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
  if (!response.ok) {
    const diagnosticCode = await sourceResponseDiagnosticCode(response);
    if (
      response.status === 404 &&
      diagnosticCode === "WORLDKIT_ROUTE_EVIDENCE_NOT_CONFIGURED"
    ) {
      return { ok: true };
    }
    return routeEvidenceDiagnostic(
      "WORLDKIT_ROUTE_EVIDENCE_SOURCE_UNAVAILABLE",
      `Route evidence source returned HTTP ${response.status}.`,
      "",
      {
        status: response.status,
        ...(diagnosticCode === undefined ? {} : { sourceDiagnosticCode: diagnosticCode }),
      },
    );
  }

  let sourceText: string;
  try {
    sourceText = await response.text();
  } catch (error) {
    return routeEvidenceDiagnostic(
      "WORLDKIT_ROUTE_EVIDENCE_SOURCE_UNAVAILABLE",
      "Unable to read the configured Route evidence response.",
      "",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
  const parsed = parseCanonicalJson(sourceText);
  if (!parsed.ok) {
    return routeEvidenceDiagnostic(
      "WORLDKIT_ROUTE_EVIDENCE_INVALID",
      "Configured Route evidence is not canonical JSON.",
      "",
      { diagnostics: parsed.diagnostics },
    );
  }
  try {
    return {
      ok: true,
      publication: canonicalWorldkitBrowserRouteEvidencePublicationV2(
        parsed.value,
      ),
    };
  } catch {
    return routeEvidenceDiagnostic(
      "WORLDKIT_ROUTE_EVIDENCE_INVALID",
      "Configured Route evidence does not match the Browser publication contract.",
    );
  }
}

function mismatchDiagnostic(
  field: "authoringSpecHash" | "normalizedWorldIrHash" | "executionPlanHash" |
    "resourceLockHash" | "layoutSolveReportHash",
  expected: string,
  actual: string,
): AuthoringSceneLoadResult {
  return {
    ok: false,
    diagnostics: [{
      severity: "error",
      code: "WORLDKIT_ROUTE_EVIDENCE_WORLD_MISMATCH",
      instancePath: `/${field}`,
      message: `Route evidence ${field} does not match the loaded Authoring world.`,
      details: { field, expected, actual },
    }],
  };
}

const fetchDefaultAuthoringSource: AuthoringSourceFetcher = () =>
  fetch("/__worldkit/authoring-spec", { cache: "no-store" });
const fetchDefaultRouteEvidence: AuthoringSourceFetcher = () =>
  fetch("/__worldkit/route-evidence", { cache: "no-store" });

export async function loadAuthoringScene(
  fetchSource: AuthoringSourceFetcher = fetchDefaultAuthoringSource,
  options: AuthoringSceneLoadOptionsV1 = {},
): Promise<AuthoringSceneLoadResult> {
  let response: Response;
  try {
    response = await fetchSource();
  } catch (error) {
    return sourceDiagnostic("Unable to fetch the configured AuthoringSpec.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!response.ok) {
    const sourceDiagnosticCode = await sourceResponseDiagnosticCode(response);
    return sourceDiagnostic(
      sourceDiagnosticCode === "AUTHORING_SOURCE_NOT_CONFIGURED"
        ? "AuthoringSpec is not configured. Start Authoring mode with `pnpm worldkit run <world.json>`; do not combine `pnpm dev` with `?authoring=1`."
        : `AuthoringSpec source returned HTTP ${response.status}.`,
      {
        status: response.status,
        ...(sourceDiagnosticCode === undefined ? {} : { sourceDiagnosticCode }),
      },
    );
  }

  let sourceText: string;
  try {
    sourceText = await response.text();
  } catch (error) {
    return sourceDiagnostic("Unable to read the configured AuthoringSpec response.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const syntax = parseCanonicalJson(sourceText);
  if (!syntax.ok) return { ok: false, diagnostics: syntax.diagnostics };
  const schemaVersion =
    syntax.value !== null && typeof syntax.value === "object"
      ? (syntax.value as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  if (
    syntax.value !== null &&
    typeof syntax.value === "object" &&
    (syntax.value as { kind?: unknown }).kind === "worldkit-authoring-spec" &&
    Object.hasOwn(syntax.value, "schemaVersion") &&
    schemaVersion !== 4
  ) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
        instancePath: "/schemaVersion",
        message: `Authoring schema version '${String(schemaVersion)}' is not supported.`,
        details: { supportedSchemaVersions: [4] },
      }],
    };
  }
  const parsed = parseAuthoringSpecV4(sourceText);
  if (!parsed.ok || parsed.value === undefined) return { ok: false, diagnostics: parsed.diagnostics };
  const fixtureSource = parsed.value.id === MOUNTED_SKATEBOARD_S1_SCENE_ID
    ? augmentMountedSkateboardS1AuthoringSpecV1(parsed.value)
    : parsed.value;
  const overlayResult = options.subjectDefinitionRef === undefined ||
      fixtureSource.id === MOUNTED_SKATEBOARD_S1_SCENE_ID
    ? { source: fixtureSource }
    : applyCapabilityDemoContext(
        fixtureSource,
        options.subjectDefinitionRef,
      );
  const { source, hostOverlay, subjectResourceRegistry } = overlayResult;
  const normalizeOptions = subjectResourceRegistry === undefined
    ? {}
    : { subjectResourceRegistry };
  const normalized = normalizeAuthoringSpecV4(source, normalizeOptions);
  if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
    return {
      ok: false,
      diagnostics: normalized.diagnostics,
      ...(hostOverlay === undefined ? {} : { hostOverlay }),
    };
  }
  const mountedSkateboardResources = normalized.value.id ===
      MOUNTED_SKATEBOARD_S1_SCENE_ID
    ? createMountedSkateboardS1GameplayResourcesV1(normalized.value)
    : undefined;
  const gameplayBootstrap = mountedSkateboardResources?.gameplayBootstrap ??
    createRuntimeGameplayBootstrap(normalized.value);
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
  });
  if (!compiled.ok || compiled.executionPlan === undefined || compiled.executionPlanHash === undefined) {
    return {
      ok: false,
      diagnostics: compiled.diagnostics,
      ...(hostOverlay === undefined ? {} : { hostOverlay }),
    };
  }
  const fetchRouteEvidence = options.fetchRouteEvidence ??
    (fetchSource === fetchDefaultAuthoringSource
      ? fetchDefaultRouteEvidence
      : undefined);
  const routeEvidence = await loadRouteEvidence(fetchRouteEvidence);
  if (!routeEvidence.ok) {
    return {
      ok: false,
      diagnostics: routeEvidence.diagnostics,
      ...(hostOverlay === undefined ? {} : { hostOverlay }),
    };
  }
  if (routeEvidence.publication !== undefined) {
    if (
      normalized.value.schemaVersion !== 4 ||
      compiled.executionPlan.schemaVersion !== 5 ||
      normalized.layoutSolveReportHash === undefined
    ) {
      throw new Error("WORLDKIT_ROUTE_EVIDENCE_INTERNAL_VERSION_MISMATCH");
    }
    const identities = {
      authoringSpecHash: normalized.value.authoringSpecHash,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
      executionPlanHash: compiled.executionPlanHash,
      resourceLockHash: compiled.executionPlan.resourceLockHash,
      layoutSolveReportHash: normalized.layoutSolveReportHash,
    } as const;
    for (const field of [
      "authoringSpecHash",
      "normalizedWorldIrHash",
      "executionPlanHash",
      "resourceLockHash",
      "layoutSolveReportHash",
    ] as const) {
      const actual = routeEvidence.publication[field];
      const expected = identities[field];
      if (actual !== expected) {
        return mismatchDiagnostic(field, expected, actual);
      }
    }
  }

  let runtimeWorldConfiguration: RuntimeWorldConfigurationV1;
  if (
    normalized.value.schemaVersion !== 4 ||
    compiled.executionPlan.schemaVersion !== 5 ||
    isNil(normalized.layoutSolveReport) ||
    isNil(normalized.layoutSolveReportHash)
  ) {
    throw new Error("AUTHORING_RUNTIME_CONFIGURATION_INTERNAL_VERSION_MISMATCH");
  }
  try {
    const resourceArtifacts = isNil(options.fetchSubjectAsset)
      ? await resolveWorldPackageSubjectAssetArtifactsV2(
          normalized.value.resources.subjectAssets,
          PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
          PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
        )
      : await resolveWorldPackageSubjectAssetArtifactsV2(
          normalized.value.resources.subjectAssets,
          PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
          PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
          options.fetchSubjectAsset,
        );
    const worldPackageBuildContext = createPlaygroundWorldPackageBuildContextV2({
      title: `${source.id} WorldPackage`,
      resourceArtifacts,
      includeAuthoringSpec: isNil(subjectResourceRegistry),
    });
    const directory = createWorldPackageV2({
      packageId: `${source.id}.${source.seed}`,
      ...worldPackageBuildContext,
      authoringSpec: source,
      normalizedWorldIr: normalized.value,
      layoutSolveResult: {
        status: normalized.layoutSolveReport.status,
        report: normalized.layoutSolveReport,
        layoutSolveReportHash: normalized.layoutSolveReportHash,
      },
      executionPlan: compiled.executionPlan,
      gameplayBootstrap,
      resourceArtifacts,
    });
    const worldPackageStore = options.worldPackageStore;
    const stored = isNil(worldPackageStore)
      ? (() => {
          const verifiedDirectory = verifyWorldPackageDirectoryV2(directory);
          return Object.freeze({
            worldPackageRef: worldPackageRefFromRootHashV1(
              verifiedDirectory.receipt.worldPackageRootHash,
            ),
            verifiedDirectory,
          });
        })()
      : await (async () => {
          const put = await worldPackageStore.put(directory);
          const verifiedDirectory = await worldPackageStore.get(
            put.worldPackageRef,
          );
          if (isNil(verifiedDirectory)) {
            throw new Error("WORLD_PACKAGE_STORE_REPLAY_MISSING");
          }
          return Object.freeze({
            worldPackageRef: put.worldPackageRef,
            verifiedDirectory,
          });
        })();
    assertWorldPackageHostCompatibilityV2(
      stored.verifiedDirectory.receipt.manifest,
      BABYLON_WEB_WORLD_PACKAGE_HOST_POLICY_V1,
    );
    runtimeWorldConfiguration = Object.freeze({
      executionPlan: stored.verifiedDirectory.executionPlan,
      executionPlanHash:
        stored.verifiedDirectory.receipt.manifest.executionPlanHash,
      worldPackageRef: stored.worldPackageRef,
      worldPackageBuildReceipt: stored.verifiedDirectory.receipt,
      gameplayBootstrap: stored.verifiedDirectory.gameplayBootstrap,
    });
    return {
      ok: true,
      executionPlan: stored.verifiedDirectory.executionPlan,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
      executionPlanHash:
        stored.verifiedDirectory.receipt.manifest.executionPlanHash,
      authoringSpec: source,
      authoringSpecHash: hashAuthoringDocumentV4(source),
      diagnostics: [],
      ...(hostOverlay === undefined ? {} : { hostOverlay }),
      ...(routeEvidence.publication === undefined
        ? {}
        : { routeEvidencePublication: routeEvidence.publication }),
      runtimeWorldConfiguration,
      worldPackageBuildContext,
      worldPackageResourceArtifacts: resourceArtifacts,
      ...(mountedSkateboardResources === undefined
        ? {}
        : {
            gameplayActionRequestResolver:
              mountedSkateboardResources.gameplayActionRequestResolver,
          }),
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "AUTHORING_RUNTIME_CONFIGURATION_INVALID",
        instancePath: "/resources",
        message:
          "Unable to construct the locked Runtime World Configuration from the Authoring world.",
        details: {
          cause: error instanceof Error ? error.message : String(error),
        },
      }],
      ...(hostOverlay === undefined ? {} : { hostOverlay }),
    };
  }

}
