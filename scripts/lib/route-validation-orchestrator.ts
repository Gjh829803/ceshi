import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import type {
  CanonicalSceneConnectivityRequirementV1,
  CanonicalSceneExecutionPlanV1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  worldResourceLockEntriesV1,
  parseWorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import type { SubjectAssetResolverV1 } from "@whitebox-world/runtime-babylon";
import {
  assertRouteConnectivityResultForBuildInputV2,
  assertTraversalRuntimeWorldIdentityMatchesGraphV1,
  canonicalRouteOverlayV2,
  canonicalRouteRuntimeProbeReceiptV2,
  type CreateTraversalCapabilityEnvelopeInputV1,
  type RouteBuildInputReceiptV2,
  type RouteConnectivityResultV2,
  type ResolvedTraversalDriverProfileV1,
  type ResolvedTraversalGraphBuilderProfileV2,
  type ResolvedTraversalLockReceiptV1,
  type RouteOverlayV2,
  type RoutePathReceiptV2,
  type RouteRuntimeProbeReceiptV2,
  type TraversalCapabilityEnvelopeReceiptV1,
  type TraversalRuntimePortV1,
} from "@whitebox-world/traversal";
import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  validateValidationReportV2,
  type CreateRouteValidationReportInputV2,
  type EvidenceArtifactKindV2,
  type RouteEvidencePublicationRowInputV2,
  type RouteValidationRowInputV2,
  type RunRouteRuntimeProbeInputV2,
  type ValidationReportV2,
  type WorldPackageValidationSubjectV1,
} from "@whitebox-world/validation";
import { isEqual, isNil, isPlainObject } from "lodash-es";

type Hash = `sha256:${string}`;

export interface RouteValidationRuntimeLeaseV1 {
  readonly runtimePort: TraversalRuntimePortV1;
  readonly dispose: () => void | Promise<void>;
}

export interface RouteValidationRuntimeCreationInputV1 {
  readonly executionPlan: CanonicalSceneExecutionPlanV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly runtimeSessionId: string;
  readonly traversalLockReceipt: ResolvedTraversalLockReceiptV1;
  readonly routePathReceipt: RoutePathReceiptV2;
  readonly runtimeAssetResolver?: SubjectAssetResolverV1;
  readonly havokWasmBytes?: Readonly<Uint8Array>;
}

/**
 * Trusted Host wiring for the provider-neutral orchestration sequence. The CLI
 * must bind these operations to the frozen built-ins; they are intentionally
 * separate from Agent/user input and are never serialized into evidence.
 */
export interface RouteValidationOrchestratorOperationsV1 {
  readonly compileTraversalLock: (input: Readonly<{
    executionPlan: CanonicalSceneExecutionPlanV1;
    traversingEntityId: string;
  }>) => ResolvedTraversalLockReceiptV1;
  readonly resolveGraphBuilderProfile: () =>
    ResolvedTraversalGraphBuilderProfileV2;
  readonly createCapabilityEnvelope: (
    input: CreateTraversalCapabilityEnvelopeInputV1,
  ) => TraversalCapabilityEnvelopeReceiptV1;
  readonly createBuildInput: (input: Readonly<{
    executionPlan: CanonicalSceneExecutionPlanV1;
    capabilityEnvelope:
      TraversalCapabilityEnvelopeReceiptV1["envelope"];
    traversalLockReceipt: ResolvedTraversalLockReceiptV1;
    constraintId: string;
  }>) => RouteBuildInputReceiptV2;
  readonly evaluateRoute: (input: Readonly<{
    buildInputReceipt: RouteBuildInputReceiptV2;
  }>) => Promise<RouteConnectivityResultV2>;
  readonly createRuntimeLease: (
    input: RouteValidationRuntimeCreationInputV1,
  ) => Promise<RouteValidationRuntimeLeaseV1>;
  readonly resolveDriverProfile: () => ResolvedTraversalDriverProfileV1;
  readonly runRuntimeProbe: (
    input: RunRouteRuntimeProbeInputV2,
  ) => Promise<RouteRuntimeProbeReceiptV2>;
  readonly createReport: (
    input: CreateRouteValidationReportInputV2,
  ) => ValidationReportV2;
}

export interface OrchestrateRouteValidationInputV1 {
  readonly executionPlan: CanonicalSceneExecutionPlanV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly subject: WorldPackageValidationSubjectV1;
  readonly reportId: string;
  readonly dependencyReportRefs?: readonly string[];
  readonly runtimeAssetResolver?: SubjectAssetResolverV1;
  readonly havokWasmBytes?: Uint8Array;
}

export interface RouteValidationEvidenceFileV1 {
  readonly kind: EvidenceArtifactKindV2;
  readonly artifactRef: string;
  readonly relativePath: string;
  readonly bytes: Readonly<Uint8Array>;
}

export interface RouteValidationOrchestrationResultV1 {
  readonly report: ValidationReportV2;
  readonly evidenceFiles: readonly RouteValidationEvidenceFileV1[];
  readonly publicationRows: readonly RouteEvidencePublicationRowInputV2[];
}

interface CanonicalOrchestrationInputV1 {
  readonly executionPlan: CanonicalSceneExecutionPlanV1;
  readonly executionPlanHash: `sha256:${string}`;
  readonly routeResourceLockHash: `sha256:${string}`;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly subject: WorldPackageValidationSubjectV1;
  readonly reportId: string;
  readonly dependencyReportRefs: readonly string[];
  readonly runtimeAssetResolver?: SubjectAssetResolverV1;
  readonly havokWasmBytes?: Uint8Array;
}

interface RowEvidenceV1 {
  readonly constraintId: string;
  readonly rowIndex: number;
  readonly evidenceBytes: RouteValidationRowInputV2["evidenceBytes"];
}

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const SUBJECT_FIELDS = [
  "kind",
  "worldPackageRootHash",
  "authoringSpecHash",
  "normalizedWorldIrHash",
  "worldBuildIdentityHash",
  "resourceLockHash",
  "layoutSolveReportHash",
] as const;
const INPUT_FIELDS = [
  "executionPlan",
  "worldRuntimeBootstrap",
  "subject",
  "reportId",
  "dependencyReportRefs",
  "runtimeAssetResolver",
  "havokWasmBytes",
] as const;
const REQUIRED_INPUT_FIELDS = [
  "executionPlan",
  "worldRuntimeBootstrap",
  "subject",
  "reportId",
] as const;
const REPORT_FIELDS = [
  "kind",
  "schemaVersion",
  "id",
  "subject",
  "dependencyReportRefs",
  "validationProfileRef",
  "resolvedVersion",
  "validationProfileHash",
  "routeValidationSetReceipt",
  "status",
  "gateResultsById",
  "evidenceArtifactsById",
  "diagnostics",
] as const;

const EVIDENCE_FILENAME_BY_KIND = Object.freeze({
  "route-validation-set-receipt": "00-route-validation-set-receipt.json",
  "traversal-graph": "01-traversal-graph.json",
  "route-path-receipt": "02-route-path-receipt.json",
  "route-connectivity-failure": "03-route-connectivity-failure.json",
  "route-runtime-probe-receipt": "04-route-runtime-probe-receipt.json",
  "route-overlay": "05-route-overlay.bin",
}) satisfies Readonly<Record<EvidenceArtifactKindV2, string>>;

const ROW_EVIDENCE_KEY_BY_KIND = Object.freeze({
  "traversal-graph": "traversalGraph",
  "route-path-receipt": "routePathReceipt",
  "route-connectivity-failure": "routeConnectivityFailure",
  "route-runtime-probe-receipt": "routeRuntimeProbeReceipt",
  "route-overlay": "routeOverlay",
}) satisfies Readonly<Record<
  Exclude<EvidenceArtifactKindV2, "route-validation-set-receipt">,
  keyof RouteValidationRowInputV2["evidenceBytes"]
>>;

function fail(code: string): never {
  throw new Error(code);
}

function compareCanonicalString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertPureEnumerableDataGraph(
  value: unknown,
  errorCode: string,
  visited = new WeakSet<object>(),
): void {
  if (isNil(value) || typeof value !== "object") return;
  if (visited.has(value)) return;
  visited.add(value);
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    fail(errorCode);
  }
  if (
    !Array.isArray(value) &&
    !(value instanceof Uint8Array) &&
    !(value instanceof ArrayBuffer) &&
    !isPlainObject(value)
  ) {
    fail(errorCode);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    const expectedOwnKeys = new Set<string>([
      "length",
      ...Array.from({ length: value.length }, (_, index) => String(index)),
    ]);
    const actualOwnKeys = Reflect.ownKeys(value);
    if (
      actualOwnKeys.length !== expectedOwnKeys.size ||
      actualOwnKeys.some((key) =>
        typeof key !== "string" || !expectedOwnKeys.has(key)
      )
    ) {
      fail(errorCode);
    }
  }
  for (const [field, descriptor] of Object.entries(descriptors)) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) {
      fail(errorCode);
    }
    if (
      (!(Array.isArray(value) && field === "length")) &&
      descriptor.enumerable !== true
    ) {
      fail(errorCode);
    }
    assertPureEnumerableDataGraph(descriptor.value, errorCode, visited);
  }
}

function assertOwnDescriptorsSafe(value: object): void {
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    fail("ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID");
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) {
      fail("ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID");
    }
  }
}

function assertExactEnumerableOwnFields(
  value: object,
  allowedFields: readonly string[],
  requiredFields: readonly string[],
  errorCode: string,
): void {
  const allowed = new Set(allowedFields);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) fail(errorCode);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      isNil(descriptor) ||
      descriptor.enumerable !== true ||
      !isNil(descriptor.get) ||
      !isNil(descriptor.set)
    ) {
      fail(errorCode);
    }
  }
  for (const field of requiredFields) {
    if (!Object.hasOwn(value, field)) fail(errorCode);
  }
}

function assertCanonicalDataArray(value: readonly unknown[]): void {
  const expectedOwnKeys = new Set<string>([
    "length",
    ...Array.from({ length: value.length }, (_, index) => String(index)),
  ]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !expectedOwnKeys.has(key)) {
      fail("ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      isNil(descriptor) ||
      !isNil(descriptor.get) ||
      !isNil(descriptor.set) ||
      (key === "length"
        ? descriptor.enumerable !== false
        : descriptor.enumerable !== true)
    ) {
      fail("ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID");
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      fail("ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID");
    }
  }
}

function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (isNil(value) || typeof value !== "object") return value;
  const object = value as object;
  if (visited.has(object)) return value;
  visited.add(object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, visited);
  }
  return Object.freeze(object) as T;
}

function snapshotBytes(value: Uint8Array | undefined): Uint8Array | undefined {
  if (isNil(value)) return undefined;
  if (!(value instanceof Uint8Array)) {
    fail("ROUTE_VALIDATION_ORCHESTRATION_HAVOK_BYTES_INVALID");
  }
  const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  const bufferGetter = Object.getOwnPropertyDescriptor(
    typedArrayPrototype,
    "buffer",
  )?.get;
  if (isNil(bufferGetter)) {
    fail("ROUTE_VALIDATION_ORCHESTRATION_HAVOK_BYTES_INVALID");
  }
  let buffer: ArrayBufferLike;
  try {
    buffer = Reflect.apply(bufferGetter, value, []) as ArrayBufferLike;
  } catch {
    return fail("ROUTE_VALIDATION_ORCHESTRATION_HAVOK_BYTES_INVALID");
  }
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    buffer instanceof SharedArrayBuffer
  ) {
    fail("ROUTE_VALIDATION_ORCHESTRATION_HAVOK_BYTES_INVALID");
  }
  try {
    return new Uint8Array(value);
  } catch {
    return fail("ROUTE_VALIDATION_ORCHESTRATION_HAVOK_BYTES_INVALID");
  }
}

function canonicalSubject(
  value: WorldPackageValidationSubjectV1,
): WorldPackageValidationSubjectV1 {
  assertPureEnumerableDataGraph(
    value,
    "ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID",
  );
  if (
    isNil(value) ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.kind !== "world-package"
  ) {
    return fail("ROUTE_VALIDATION_ORCHESTRATION_SUBJECT_INVALID");
  }
  assertExactEnumerableOwnFields(
    value,
    SUBJECT_FIELDS,
    SUBJECT_FIELDS,
    "ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID",
  );
  for (const field of SUBJECT_FIELDS.slice(1)) {
    const hash = value[field];
    if (typeof hash !== "string" || !HASH_PATTERN.test(hash) || hash === ZERO_HASH) {
      return fail("ROUTE_VALIDATION_ORCHESTRATION_SUBJECT_INVALID");
    }
  }
  return Object.freeze({ ...value });
}

function canonicalInput(
  input: OrchestrateRouteValidationInputV1,
): CanonicalOrchestrationInputV1 {
  if (
    isNil(input) ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return fail("ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID");
  }
  assertOwnDescriptorsSafe(input);
  assertExactEnumerableOwnFields(
    input,
    INPUT_FIELDS,
    REQUIRED_INPUT_FIELDS,
    "ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID",
  );
  if (
    typeof input.reportId !== "string" ||
    input.reportId.length === 0 ||
    input.reportId.trim() !== input.reportId ||
    input.reportId.normalize("NFC") !== input.reportId
  ) {
    return fail("ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID");
  }
  assertPureEnumerableDataGraph(
    input.executionPlan,
    "ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID",
  );
  assertPureEnumerableDataGraph(
    input.worldRuntimeBootstrap,
    "ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID",
  );
  assertPureEnumerableDataGraph(
    input.subject,
    "ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID",
  );
  assertPureEnumerableDataGraph(
    input.dependencyReportRefs ?? [],
    "ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID",
  );
  if (!isNil(input.dependencyReportRefs)) {
    if (!Array.isArray(input.dependencyReportRefs)) {
      fail("ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID");
    }
    assertCanonicalDataArray(input.dependencyReportRefs);
  }
  const executionPlan = deepFreeze(structuredClone(input.executionPlan));
  if (executionPlan.schemaVersion !== 1) {
    fail("ROUTE_VALIDATION_ORCHESTRATION_PLAN_INVALID");
  }
  const worldRuntimeBootstrap = parseWorldRuntimeBootstrapV1(
    structuredClone(input.worldRuntimeBootstrap),
  );
  const subject = canonicalSubject(input.subject);
  const executionPlanHash = sha256CanonicalJson(executionPlan) as `sha256:${string}`;
  const combinedResourceLock = worldResourceLockEntriesV1([
    ...executionPlan.sceneResourceLockEntries,
    ...worldRuntimeBootstrap.runtimeResourceLockEntries,
  ]);
  const resourceLockHash = sha256CanonicalJson(combinedResourceLock);
  const routeResourceLockHash = sha256CanonicalJson(
    combinedResourceLock.filter(
      (row) => row.resourceKind !== "gameplay-bootstrap",
    ),
  ) as `sha256:${string}`;
  if (
    subject.authoringSpecHash !== executionPlan.authoringSpecHash ||
    subject.normalizedWorldIrHash !== executionPlan.normalizedWorldIrHash ||
    subject.resourceLockHash !== resourceLockHash ||
    executionPlan.worldRuntimeBootstrapHash !==
      worldRuntimeBootstrap.contentHash ||
    subject.layoutSolveReportHash !== executionPlan.layout.layoutSolveReportHash
  ) {
    fail("ROUTE_VALIDATION_ORCHESTRATION_WORLD_IDENTITY_MISMATCH");
  }
  const dependencyReportRefs = Object.freeze(
    [...(input.dependencyReportRefs ?? [])].sort(compareCanonicalString),
  );
  if (
    dependencyReportRefs.some((ref) =>
      typeof ref !== "string" ||
      ref.length === 0 ||
      ref.trim() !== ref ||
      ref.normalize("NFC") !== ref
    ) ||
    new Set(dependencyReportRefs).size !== dependencyReportRefs.length
  ) {
    fail("ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID");
  }
  const havokWasmBytes = snapshotBytes(input.havokWasmBytes);
  return Object.freeze({
    executionPlan,
    executionPlanHash,
    routeResourceLockHash,
    worldRuntimeBootstrap,
    subject,
    reportId: input.reportId,
    dependencyReportRefs,
    ...(isNil(input.runtimeAssetResolver)
      ? {}
      : { runtimeAssetResolver: input.runtimeAssetResolver }),
    ...(isNil(havokWasmBytes) ? {} : { havokWasmBytes }),
  });
}

function sortedRequirements(
  executionPlan: CanonicalSceneExecutionPlanV1,
): readonly CanonicalSceneConnectivityRequirementV1[] {
  return Object.freeze(
    [...executionPlan.traversal.connectivityRequirements].sort((left, right) =>
      compareCanonicalString(left.constraintId, right.constraintId) ||
      compareCanonicalString(left.routeId, right.routeId)
    ),
  );
}

function canonicalOverlay(
  buildInputReceipt: RouteBuildInputReceiptV2,
  result: Extract<RouteConnectivityResultV2, { status: "complete" }>,
): RouteOverlayV2 {
  const buildInput = buildInputReceipt.input;
  const requirement = buildInput.connectivityRequirement;
  const graph = result.traversalGraph;
  const path = result.routePathReceipt;
  if (
    graph.routeBuildInputHash !== buildInputReceipt.routeBuildInputHash ||
    path.routeBuildInputHash !== buildInputReceipt.routeBuildInputHash ||
    graph.resolvedTraversalLockHash !==
      buildInput.capabilityEnvelope.resolvedTraversalLockHash ||
    path.resolvedTraversalLockHash !==
      buildInput.capabilityEnvelope.resolvedTraversalLockHash ||
    path.constraintId !== requirement.constraintId ||
    path.routeId !== requirement.routeId ||
    path.traversingEntityId !== requirement.traversingEntityId ||
    path.startAnchorEntityId !== buildInput.startAnchor.entityId ||
    path.destinationAnchorEntityId !== buildInput.destinationAnchor.entityId
  ) {
    fail("ROUTE_VALIDATION_ORCHESTRATION_OVERLAY_BINDING_MISMATCH");
  }
  return canonicalRouteOverlayV2({
    kind: "route-overlay",
    schemaVersion: 2,
    constraintId: requirement.constraintId,
    routeId: requirement.routeId,
    traversingEntityId: requirement.traversingEntityId,
    startAnchor: buildInput.startAnchor,
    destinationAnchor: buildInput.destinationAnchor,
    orderedTraversalSurfaceIdentities: path.orderedTraversalSurfaceIdentities,
    resolvedTraversalLockHash: path.resolvedTraversalLockHash,
    traversalGraphHash: result.traversalGraphHash,
    routePathReceiptHash: result.routePathReceiptHash,
    orderedTraversalNodeIds: path.orderedTraversalNodeIds,
    orderedTraversalEdgeIds: path.orderedTraversalEdgeIds,
    orderedPathPositionsMetersXYZ: path.orderedPathPositionsMetersXYZ,
    hardRibbon: buildInput.hardRibbon,
    staticColliderIdentities: buildInput.staticColliders
      .map((collider) => ({
        entityId: collider.entityId,
        logicalSubshapeId: collider.logicalSubshapeId,
        colliderSubshapeId: collider.colliderSubshapeId,
        colliderHash: collider.colliderHash,
      }))
      .sort((left, right) =>
        compareCanonicalString(
          left.colliderSubshapeId,
          right.colliderSubshapeId,
        )
      ),
  });
}

async function disposeRuntimeLease(
  lease: RouteValidationRuntimeLeaseV1,
  primaryError: unknown,
): Promise<void> {
  let cleanupError: unknown;
  try {
    await lease.dispose();
  } catch (error) {
    cleanupError = error;
  }
  if (!isNil(primaryError) && !isNil(cleanupError)) {
    throw new AggregateError(
      [primaryError, cleanupError],
      "ROUTE_VALIDATION_RUNTIME_AND_CLEANUP_FAILED",
    );
  }
  if (!isNil(primaryError)) throw primaryError;
  if (!isNil(cleanupError)) throw cleanupError;
}

async function probeCompleteRoute(
  input: CanonicalOrchestrationInputV1,
  operations: RouteValidationOrchestratorOperationsV1,
  rowIndex: number,
  traversalLockReceipt: ResolvedTraversalLockReceiptV1,
  result: Extract<RouteConnectivityResultV2, { status: "complete" }>,
): Promise<RouteRuntimeProbeReceiptV2> {
  const lease = await operations.createRuntimeLease({
    executionPlan: input.executionPlan,
    worldRuntimeBootstrap: input.worldRuntimeBootstrap,
    runtimeSessionId: `worldkit-route-validation-${String(rowIndex).padStart(6, "0")}`,
    traversalLockReceipt,
    routePathReceipt: result.routePathReceipt,
    ...(isNil(input.runtimeAssetResolver)
      ? {}
      : { runtimeAssetResolver: input.runtimeAssetResolver }),
    ...(isNil(input.havokWasmBytes)
      ? {}
      : { havokWasmBytes: input.havokWasmBytes }),
  });
  let primaryError: unknown;
  let receipt: RouteRuntimeProbeReceiptV2 | undefined;
  try {
    if (
      isNil(lease) ||
      typeof lease.dispose !== "function" ||
      isNil(lease.runtimePort)
    ) {
      fail("ROUTE_VALIDATION_RUNTIME_LEASE_INVALID");
    }
    if (
      lease.runtimePort.resolvedTraversalLockHash !==
        traversalLockReceipt.resolvedTraversalLockHash ||
      lease.runtimePort.traversingEntityId !==
        traversalLockReceipt.lock.subjectEntityId
    ) {
      fail("ROUTE_VALIDATION_RUNTIME_LOCK_MISMATCH");
    }
    if (
      lease.runtimePort.authoringSpecHash !== input.subject.authoringSpecHash ||
      lease.runtimePort.layoutSolveReportHash !==
        input.subject.layoutSolveReportHash ||
      lease.runtimePort.resourceLockHash !== input.routeResourceLockHash ||
      lease.runtimePort.executionPlanHash !== input.executionPlanHash
    ) {
      fail("ROUTE_VALIDATION_RUNTIME_WORLD_IDENTITY_MISMATCH");
    }
    const runtimeIdentity = lease.runtimePort.runtimeImplementationIdentity;
    const lock = traversalLockReceipt.lock;
    if (
      runtimeIdentity.runtimeBackendRef !== lock.runtimeBackendRef ||
      runtimeIdentity.runtimeBackendResolvedVersion !==
        lock.runtimeBackendResolvedVersion ||
      runtimeIdentity.runtimeBackendHash !== lock.runtimeBackendHash ||
      runtimeIdentity.runtimeAdapterRef !== lock.runtimeAdapterRef ||
      runtimeIdentity.runtimeAdapterResolvedVersion !==
        lock.runtimeAdapterResolvedVersion ||
      runtimeIdentity.runtimeAdapterHash !== lock.runtimeAdapterHash
    ) {
      fail("ROUTE_VALIDATION_RUNTIME_IMPLEMENTATION_IDENTITY_MISMATCH");
    }
    assertTraversalRuntimeWorldIdentityMatchesGraphV1({
      traversalGraph: result.traversalGraph,
      runtimeWorldIdentity: lease.runtimePort,
    });
    receipt = canonicalRouteRuntimeProbeReceiptV2(
      await operations.runRuntimeProbe({
        routePathReceipt: result.routePathReceipt,
        traversalDriverProfile: operations.resolveDriverProfile(),
        runtimePort: lease.runtimePort,
        validationProfile: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
        resolvedControlFeelProfile: (() => {
          const subject = input.worldRuntimeBootstrap
            .subjectRuntimeDescriptors.find(
            (candidate) => candidate.entityId === result.routePathReceipt.traversingEntityId,
          );
          if (isNil(subject)) {
            return fail("ROUTE_VALIDATION_RUNTIME_SUBJECT_MISSING");
          }
          return subject.controlFeel;
        })(),
        positionQuantizationMeters:
          operations.resolveGraphBuilderProfile().profile.positionQuantizationMeters,
      }),
    );
  } catch (error) {
    primaryError = error;
  }
  await disposeRuntimeLease(lease, primaryError);
  if (isNil(receipt)) {
    return fail("ROUTE_VALIDATION_RUNTIME_PROBE_MISSING");
  }
  return receipt;
}

function canonicalBoundReport(
  rawReport: ValidationReportV2,
  input: CanonicalOrchestrationInputV1,
  rows: readonly RouteValidationRowInputV2[],
): ValidationReportV2 {
  try {
    assertPureEnumerableDataGraph(rawReport, "ROUTE_VALIDATION_REPORT_INVALID");
    assertExactEnumerableOwnFields(
      rawReport,
      REPORT_FIELDS,
      REPORT_FIELDS,
      "ROUTE_VALIDATION_REPORT_INVALID",
    );
  } catch {
    return fail("ROUTE_VALIDATION_REPORT_INVALID");
  }
  let detached: unknown;
  try {
    detached = structuredClone(rawReport);
  } catch {
    return fail("ROUTE_VALIDATION_REPORT_INVALID");
  }
  const validation = validateValidationReportV2(detached);
  if (validation.ok !== true) {
    return fail("ROUTE_VALIDATION_REPORT_INVALID");
  }
  const report = validation.value;
  const receipt = report.routeValidationSetReceipt;
  if (
    report.id !== input.reportId ||
    !isEqual(report.subject, input.subject) ||
    !isEqual(report.dependencyReportRefs, input.dependencyReportRefs) ||
    report.validationProfileRef !==
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef ||
    report.resolvedVersion !==
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.version ||
    report.validationProfileHash !==
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2 ||
    receipt.authoringSpecHash !== input.subject.authoringSpecHash ||
    receipt.normalizedWorldIrHash !== input.subject.normalizedWorldIrHash ||
    receipt.executionPlanHash !== input.executionPlanHash ||
    receipt.resourceLockHash !== input.routeResourceLockHash ||
    receipt.layoutSolveReportHash !== input.subject.layoutSolveReportHash ||
    receipt.rows.length !== rows.length
  ) {
    return fail("ROUTE_VALIDATION_REPORT_BINDING_MISMATCH");
  }
  for (const [index, row] of rows.entries()) {
    const receiptRow = receipt.rows[index];
    const requirement =
      row.routeBuildInputReceipt.input.connectivityRequirement;
    const expectedRuntimeStatus = row.routeConnectivityResult.status === "complete"
      ? row.routeRuntimeProbeReceipt?.status
      : "not-run";
    if (
      isNil(receiptRow) ||
      isNil(expectedRuntimeStatus) ||
      receiptRow.constraintId !== requirement.constraintId ||
      receiptRow.routeId !== requirement.routeId ||
      receiptRow.traversingEntityId !== requirement.traversingEntityId ||
      receiptRow.startAnchorEntityId !==
        row.routeBuildInputReceipt.input.startAnchor.entityId ||
      receiptRow.destinationAnchorEntityId !==
        row.routeBuildInputReceipt.input.destinationAnchor.entityId ||
      receiptRow.resolvedTraversalLockHash !==
        row.resolvedTraversalLockReceipt.resolvedTraversalLockHash ||
      receiptRow.connectivityStatus !== row.routeConnectivityResult.status ||
      receiptRow.runtimeStatus !== expectedRuntimeStatus
    ) {
      return fail("ROUTE_VALIDATION_REPORT_BINDING_MISMATCH");
    }
  }
  return deepFreeze(report);
}

function evidenceBytesForResult(
  result: RouteConnectivityResultV2,
  probe: RouteRuntimeProbeReceiptV2 | undefined,
  overlay: RouteOverlayV2 | undefined,
): RouteValidationRowInputV2["evidenceBytes"] {
  if (result.status === "complete") {
    if (isNil(probe) || isNil(overlay)) {
      return fail("ROUTE_VALIDATION_COMPLETE_EVIDENCE_MISSING");
    }
    return Object.freeze({
      traversalGraph: canonicalJsonBytes(result.traversalGraph),
      routePathReceipt: canonicalJsonBytes(result.routePathReceipt),
      routeRuntimeProbeReceipt: canonicalJsonBytes(probe),
      routeOverlay: canonicalJsonBytes(overlay),
    });
  }
  return Object.freeze({
    ...(result.graphStatus === "complete"
      ? { traversalGraph: canonicalJsonBytes(result.traversalGraph) }
      : {}),
    routeConnectivityFailure: canonicalJsonBytes(result.connectivityFailure),
  });
}

function findArtifactRef(
  report: ValidationReportV2,
  kind: EvidenceArtifactKindV2,
  constraintId?: string,
): string {
  const matches = Object.values(report.evidenceArtifactsById).filter((artifact) =>
    artifact.kind === kind &&
    (isNil(constraintId) ||
      ("constraintId" in artifact && artifact.constraintId === constraintId))
  );
  if (matches.length !== 1) {
    return fail("ROUTE_VALIDATION_EVIDENCE_INVENTORY_MISMATCH");
  }
  return matches[0]!.artifactRef;
}

function assertArtifactBytes(
  report: ValidationReportV2,
  artifactRef: string,
  bytes: Readonly<Uint8Array>,
): void {
  const artifact = Object.values(report.evidenceArtifactsById).find(
    (candidate) => candidate.artifactRef === artifactRef,
  );
  if (
    isNil(artifact) ||
    artifact.sizeBytes !== bytes.byteLength ||
    artifact.contentHash !== sha256Bytes(bytes)
  ) {
    fail("ROUTE_VALIDATION_EVIDENCE_INVENTORY_MISMATCH");
  }
}

function evidenceInventory(
  report: ValidationReportV2,
  rows: readonly RowEvidenceV1[],
): readonly RouteValidationEvidenceFileV1[] {
  const routeSetBytes = canonicalJsonBytes(report.routeValidationSetReceipt);
  const routeSetArtifactRef = findArtifactRef(
    report,
    "route-validation-set-receipt",
  );
  assertArtifactBytes(report, routeSetArtifactRef, routeSetBytes);
  const files: RouteValidationEvidenceFileV1[] = [{
    kind: "route-validation-set-receipt",
    artifactRef: routeSetArtifactRef,
    relativePath:
      EVIDENCE_FILENAME_BY_KIND["route-validation-set-receipt"],
    bytes: routeSetBytes,
  }];
  for (const row of rows) {
    for (const [kind, key] of Object.entries(ROW_EVIDENCE_KEY_BY_KIND) as
      readonly [
        Exclude<EvidenceArtifactKindV2, "route-validation-set-receipt">,
        keyof RouteValidationRowInputV2["evidenceBytes"],
      ][]) {
      const bytes = row.evidenceBytes[key];
      if (isNil(bytes)) continue;
      const artifactRef = findArtifactRef(report, kind, row.constraintId);
      assertArtifactBytes(report, artifactRef, bytes);
      files.push({
        kind,
        artifactRef,
        relativePath: `routes/${String(row.rowIndex).padStart(6, "0")}/${EVIDENCE_FILENAME_BY_KIND[kind]}`,
        bytes,
      });
    }
  }
  if (files.length !== Object.keys(report.evidenceArtifactsById).length) {
    fail("ROUTE_VALIDATION_EVIDENCE_INVENTORY_MISMATCH");
  }
  files.sort((left, right) =>
    compareCanonicalString(left.relativePath, right.relativePath)
  );
  return Object.freeze(files.map((file) => Object.freeze(file)));
}

export async function orchestrateRouteValidationV1(
  rawInput: OrchestrateRouteValidationInputV1,
  operations: RouteValidationOrchestratorOperationsV1,
): Promise<RouteValidationOrchestrationResultV1> {
  const input = canonicalInput(rawInput);
  const requirements = sortedRequirements(input.executionPlan);
  const rows: RouteValidationRowInputV2[] = [];
  const publicationRows: RouteEvidencePublicationRowInputV2[] = [];
  const rowEvidence: RowEvidenceV1[] = [];

  for (const [rowIndex, requirement] of requirements.entries()) {
    const traversalLockReceipt = operations.compileTraversalLock({
      executionPlan: input.executionPlan,
      traversingEntityId: requirement.traversingEntityId,
    });
    const graphBuilderProfile = operations.resolveGraphBuilderProfile();
    const capabilityEnvelope = operations.createCapabilityEnvelope({
      traversalLockReceipt,
      graphBuilderProfile,
    });
    const routeBuildInputReceipt = operations.createBuildInput({
      executionPlan: input.executionPlan,
      capabilityEnvelope: capabilityEnvelope.envelope,
      traversalLockReceipt,
      constraintId: requirement.constraintId,
    });
    const routeConnectivityResult =
      assertRouteConnectivityResultForBuildInputV2(
        await operations.evaluateRoute({ buildInputReceipt: routeBuildInputReceipt }),
        routeBuildInputReceipt,
      );

    let routeRuntimeProbeReceipt: RouteRuntimeProbeReceiptV2 | undefined;
    let routeOverlay: RouteOverlayV2 | undefined;
    if (routeConnectivityResult.status === "complete") {
      routeRuntimeProbeReceipt = await probeCompleteRoute(
        input,
        operations,
        rowIndex,
        traversalLockReceipt,
        routeConnectivityResult,
      );
      routeOverlay = canonicalOverlay(
        routeBuildInputReceipt,
        routeConnectivityResult,
      );
    }
    const evidenceBytes = evidenceBytesForResult(
      routeConnectivityResult,
      routeRuntimeProbeReceipt,
      routeOverlay,
    );
    const validationRow = Object.freeze({
      routeBuildInputReceipt,
      routeConnectivityResult,
      ...(isNil(routeRuntimeProbeReceipt)
        ? {}
        : { routeRuntimeProbeReceipt }),
      resolvedTraversalLockReceipt: traversalLockReceipt,
      evidenceBytes,
    });
    rows.push(validationRow);
    publicationRows.push(Object.freeze({
      validationRow,
      ...(isNil(routeOverlay) ? {} : { routeOverlay }),
    }));
    rowEvidence.push(Object.freeze({
      constraintId: requirement.constraintId,
      rowIndex,
      evidenceBytes,
    }));
  }

  const report = canonicalBoundReport(
    operations.createReport({
      reportId: input.reportId,
      subject: input.subject,
      executionPlanHash: input.executionPlanHash,
      resourceLockHash: input.routeResourceLockHash,
      dependencyReportRefs: input.dependencyReportRefs,
      validationProfile: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
      requiredRoutes: requirements.map((requirement) => ({
        constraintId: requirement.constraintId,
        routeId: requirement.routeId,
        traversingEntityId: requirement.traversingEntityId,
        startAnchorEntityId: requirement.startAnchorEntityId,
        destinationAnchorEntityId: requirement.destinationAnchorEntityId,
      })),
      rows: Object.freeze(rows),
    }),
    input,
    rows,
  );
  const evidenceFiles = evidenceInventory(report, rowEvidence);
  return Object.freeze({
    report,
    evidenceFiles,
    publicationRows: Object.freeze(publicationRows),
  });
}
