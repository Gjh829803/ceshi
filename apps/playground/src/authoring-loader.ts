import {
  normalizeAuthoringSpec,
  normalizeAuthoringSpecV4,
  parseCanonicalJson,
  parseAuthoringSpecJson,
  parseAuthoringSpecV4,
  sha256CanonicalJson,
  type AuthoringDiagnostic,
  type AuthoringSpecV3,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileWorld, compileWorldV5 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import {
  createGameplayBootstrapResourceLockEntryV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import {
  builtInSubjectResourceRegistry,
  type RegistrySubjectDefinitionV3,
  type SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";
import type {
  CompileDiagnostic,
  ExecutionPlanV4,
  ExecutionPlanV5,
} from "@whitebox-world/runtime-contracts";
import {
  canonicalWorldkitBrowserRouteEvidencePublicationV2,
  type WorldkitBrowserRouteEvidencePublicationV2,
} from "@whitebox-world/runtime-contracts";
import type { RuntimeWorldConfigurationV1 } from "@whitebox-world/runtime-host";
import { createWorldPackageBuildReceiptV1 } from "@whitebox-world/world-package";
import { isNil } from "lodash-es";

import {
  PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
  PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
  resolveWorldPackageSubjectAssetArtifactsV1,
} from "./worldkit-asset-resolver.js";

type CapabilityDemoResourceBudgetV1 = Readonly<
  AuthoringSpecV3["world"]["resourceBudget"]
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
  executionPlan?: ExecutionPlanV4 | ExecutionPlanV5;
  normalizedWorldIrHash?: string;
  executionPlanHash?: string;
  diagnostics: readonly (AuthoringDiagnostic | CompileDiagnostic)[];
  hostOverlay?: CapabilityDemoHostOverlayV1;
  routeEvidencePublication?: WorldkitBrowserRouteEvidencePublicationV2;
  /** Internal Host bootstrap. This is intentionally not a public Browser DTO. */
  runtimeWorldConfiguration?: RuntimeWorldConfigurationV1;
}

export type AuthoringSourceFetcher = () => Promise<Response>;

export interface AuthoringSceneLoadOptionsV1 {
  subjectDefinitionRef?: string;
  fetchRouteEvidence?: AuthoringSourceFetcher;
  fetchSubjectAsset?: typeof fetch;
}

type SupportedAuthoringSpec = AuthoringSpecV3 | AuthoringSpecV4;

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
  });
}

function frozenResourceBudget(
  resourceBudget: AuthoringSpecV3["world"]["resourceBudget"],
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
    capabilityRefs: source.capabilityRefs.filter(
      (capabilityRef) => !deferredCapabilityRefSet.has(capabilityRef),
    ),
    relationshipCapabilityRefs: [],
  };
  const definition = deepFreeze({
    ...previewInput,
    contentHash: sha256CanonicalJson(previewInput),
  }) as RegistrySubjectDefinitionV3;
  const registry: SubjectResourceRegistryV3 = Object.freeze({
    ...builtInSubjectResourceRegistry,
    resolveSubjectDefinition(resourceRef: string) {
      return resourceRef === definition.resourceRef
        ? definition
        : builtInSubjectResourceRegistry.resolveSubjectDefinition(resourceRef);
    },
    listSubjectDefinitions() {
      return [
        ...builtInSubjectResourceRegistry.listSubjectDefinitions(),
        definition,
      ].sort((left, right) => left.resourceRef.localeCompare(right.resourceRef));
    },
    listCapabilitySubjectDefinitions() {
      return [
        ...builtInSubjectResourceRegistry.listCapabilitySubjectDefinitions(),
        definition,
      ].sort((left, right) => left.resourceRef.localeCompare(right.resourceRef));
    },
  });
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

function applyCapabilityDemoContext<Source extends SupportedAuthoringSpec>(
  source: Source,
  subjectDefinitionRef: string,
): Readonly<{
  source: Source;
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
    } as Source,
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
    schemaVersion !== 3 &&
    schemaVersion !== 4
  ) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
        instancePath: "/schemaVersion",
        message: `Authoring schema version '${String(schemaVersion)}' is not supported.`,
        details: { supportedSchemaVersions: [3, 4] },
      }],
    };
  }
  const parsed = schemaVersion === 4
    ? parseAuthoringSpecV4(sourceText)
    : parseAuthoringSpecJson(sourceText);
  if (!parsed.ok || parsed.value === undefined) return { ok: false, diagnostics: parsed.diagnostics };
  const overlayResult = options.subjectDefinitionRef === undefined
    ? { source: parsed.value }
    : applyCapabilityDemoContext(
        parsed.value,
        options.subjectDefinitionRef,
      );
  const { source, hostOverlay, subjectResourceRegistry } = overlayResult;
  const normalizeOptions = subjectResourceRegistry === undefined
    ? {}
    : { subjectResourceRegistry };
  const normalized = source.schemaVersion === 4
    ? normalizeAuthoringSpecV4(source, normalizeOptions)
    : normalizeAuthoringSpec(source, normalizeOptions);
  if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
    return {
      ok: false,
      diagnostics: normalized.diagnostics,
      ...(hostOverlay === undefined ? {} : { hostOverlay }),
    };
  }
  const gameplayBootstrap = normalized.value.schemaVersion === 4
    ? createRuntimeGameplayBootstrap(normalized.value)
    : undefined;
  const compiled = normalized.value.schemaVersion === 4
    ? compileWorldV5({
        normalizedWorldIr: normalized.value,
        normalizedWorldIrHash: normalized.normalizedWorldIrHash,
        gameplayBootstrapResourceLock:
          createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
      })
    : compileWorld({
        normalizedWorldIr: normalized.value,
        normalizedWorldIrHash: normalized.normalizedWorldIrHash,
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
  if (
    source.schemaVersion === 3 &&
    routeEvidence.publication !== undefined
  ) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "WORLDKIT_ROUTE_EVIDENCE_REQUIRES_AUTHORING_V4",
        instancePath: "/schemaVersion",
        message: "Configured Route evidence requires AuthoringSpec V4 and ExecutionPlan V5.",
      }],
      ...(hostOverlay === undefined ? {} : { hostOverlay }),
    };
  }
  if (
    source.schemaVersion === 4 &&
    routeEvidence.publication !== undefined
  ) {
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

  let runtimeWorldConfiguration: RuntimeWorldConfigurationV1 | undefined;
  if (source.schemaVersion === 4) {
    if (
      normalized.value.schemaVersion !== 4 ||
      compiled.executionPlan.schemaVersion !== 5 ||
      isNil(gameplayBootstrap) ||
      isNil(normalized.layoutSolveReport) ||
      isNil(normalized.layoutSolveReportHash)
    ) {
      throw new Error("AUTHORING_RUNTIME_CONFIGURATION_INTERNAL_VERSION_MISMATCH");
    }
    try {
      const resourceArtifacts = isNil(options.fetchSubjectAsset)
        ? await resolveWorldPackageSubjectAssetArtifactsV1(
            normalized.value.resources.subjectAssets,
            PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
            PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
          )
        : await resolveWorldPackageSubjectAssetArtifactsV1(
            normalized.value.resources.subjectAssets,
            PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
            PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
            options.fetchSubjectAsset,
          );
      const worldPackageBuildReceipt = createWorldPackageBuildReceiptV1({
        packageId: `${source.id}.${source.seed}`,
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
      runtimeWorldConfiguration = Object.freeze({
        executionPlan: compiled.executionPlan,
        executionPlanHash:
          worldPackageBuildReceipt.manifest.executionPlanHash,
        worldPackageRef:
          `worldkit://world-package/${source.id}.${source.seed}@1`,
        worldPackageBuildReceipt,
        gameplayBootstrap,
      });
    } catch {
      return {
        ok: false,
        diagnostics: [{
          severity: "error",
          code: "AUTHORING_RUNTIME_CONFIGURATION_INVALID",
          instancePath: "/resources",
          message:
            "Unable to construct the locked Runtime World Configuration from the Authoring world.",
        }],
        ...(hostOverlay === undefined ? {} : { hostOverlay }),
      };
    }
  }

  return {
    ok: true,
    executionPlan: compiled.executionPlan,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    executionPlanHash: compiled.executionPlanHash,
    diagnostics: [],
    ...(hostOverlay === undefined ? {} : { hostOverlay }),
    ...(routeEvidence.publication === undefined
      ? {}
      : { routeEvidencePublication: routeEvidence.publication }),
    ...(isNil(runtimeWorldConfiguration)
      ? {}
      : { runtimeWorldConfiguration }),
  };
}
