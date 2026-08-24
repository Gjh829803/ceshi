import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import {
  normalizeAuthoringSpecV4,
  parseAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import { createGameplayBootstrapResourceLockEntryV1 } from "@whitebox-world/gameplay-contracts";
import { sha256Bytes } from "@whitebox-world/protocol";
import {
  SubjectAssetCacheV1,
  isSubjectAssetRuntimeErrorV1,
} from "@whitebox-world/runtime-babylon";
import type {
  ExecutionPlanV5,
  ExecutionSubjectAssetV1,
} from "@whitebox-world/runtime-contracts";
import {
  XIER120_SUBJECT_DEFINITIONS,
  builtInSubjectResourceRegistry,
  resolveSubjectPresetClosureV1,
  sourceFbxContributorAssetInventory,
} from "@whitebox-world/subject-registry";

import { XIER120_SUBJECT_ASSET_URI_BY_REF_V1 } from "../apps/playground/src/worldkit-asset-resolver";
import { bakeXier120StaticSubjects } from "./bake-xier120-static-subjects";

const EXPECTED_SUBJECT_COUNT = 19;
const DEFAULT_FIXTURE_RELATIVE_PATH =
  "examples/authoring/xier120-subject-gallery.json";

type Xier120VerificationStage =
  | "registry-closure"
  | "authoring-normalize"
  | "compiler"
  | "asset-cache-acquire"
  | "asset-instantiate"
  | "asset-dispose";

export class Xier120SubjectActualUseError extends Error {
  readonly name = "Xier120SubjectActualUseError";
  readonly code = "XIER120_SUBJECT_ACTUAL_USE_FAILED";

  constructor(
    readonly stage: Xier120VerificationStage,
    readonly subjectDefinitionRef: string,
    readonly subjectAssetRef: string | undefined,
    readonly colliderProfileRef: string | undefined,
    readonly causeCode: string,
  ) {
    super(
      `${stage}: definition=${subjectDefinitionRef}` +
        (subjectAssetRef === undefined ? "" : ` asset=${subjectAssetRef}`) +
        (colliderProfileRef === undefined
          ? ""
          : ` collider=${colliderProfileRef}`) +
        ` cause=${causeCode}`,
    );
  }
}

export interface Xier120SubjectActualUseResultV1 {
  readonly subjectDefinitionRef: string;
  readonly subjectAssetRef: string;
  readonly colliderProfileRef: string;
  readonly normalized: true;
  readonly compiled: true;
  readonly capabilityCatalogDiscoverable: true;
  readonly cacheResolveCount: 1;
  readonly leaseCount: 2;
  readonly instanceCount: 2;
  readonly mutationIsolationVerified: true;
  readonly crossLeaseReleaseIsolationVerified: true;
  readonly disposedInstanceCount: 2;
  readonly releasedLeaseCount: 2;
  readonly cacheDisposed: true;
  readonly meshCountPerInstance: number;
}

export interface Xier120ActualUseVerificationReportV1 {
  readonly kind: "xier120-subject-actual-use-verification";
  readonly schemaVersion: 1;
  readonly fixtureRelativePath: string;
  readonly fixtureSubjectDefinitionRef: string;
  readonly selectionMode: "direct-fixture-ref-plus-capability-catalog";
  readonly sourceHashMatchCount: 19;
  readonly exactBakeMatchCount: 19;
  readonly subjectCount: 19;
  readonly results: readonly Xier120SubjectActualUseResultV1[];
}

function causeCode(error: unknown): string {
  if (isSubjectAssetRuntimeErrorV1(error)) return error.code;
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}

function actualUseFailure(
  stage: Xier120VerificationStage,
  subjectDefinitionRef: string,
  subjectAssetRef: string | undefined,
  colliderProfileRef: string | undefined,
  error: unknown,
): Xier120SubjectActualUseError {
  if (error instanceof Xier120SubjectActualUseError) return error;
  return new Xier120SubjectActualUseError(
    stage,
    subjectDefinitionRef,
    subjectAssetRef,
    colliderProfileRef,
    causeCode(error),
  );
}

class VerificationInvariantError extends Error {
  readonly name = "VerificationInvariantError";

  constructor(readonly code: string) {
    super(code);
  }
}

function requireInvariant(condition: boolean, code: string): asserts condition {
  if (!condition) throw new VerificationInvariantError(code);
}

function createGameplayBootstrap(normalizedWorldIr: NormalizedWorldIRV4) {
  const entityDescriptors = normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) =>
          candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      requireInvariant(
        definition !== undefined,
        "XIER120_NORMALIZED_SUBJECT_DEFINITION_MISSING",
      );
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

function compileSelectedSubject(
  authoringSourceText: string,
  subjectDefinitionRef: string,
): Readonly<{
  executionPlan: ExecutionPlanV5;
  controlledEntityId: string;
}> {
  const parsed = parseAuthoringSpecV4(authoringSourceText);
  requireInvariant(
    parsed.ok && parsed.value !== undefined,
    parsed.diagnostics[0]?.code ?? "XIER120_AUTHORING_PARSE_FAILED",
  );
  const controlledEntityId = parsed.value.startup.controlledEntityId;
  let replacedControlledSubject = false;
  const selectedSource: AuthoringSpecV4 = {
    ...parsed.value,
    nodes: parsed.value.nodes.map((node) => {
      if (node.kind !== "subject" || node.id !== controlledEntityId) return node;
      replacedControlledSubject = true;
      return { ...node, subjectDefinitionRef };
    }),
  };
  requireInvariant(
    replacedControlledSubject,
    "XIER120_CONTROLLED_SUBJECT_MISSING",
  );

  const normalized = normalizeAuthoringSpecV4(selectedSource);
  requireInvariant(
    normalized.ok &&
      normalized.value !== undefined &&
      normalized.normalizedWorldIrHash !== undefined,
    normalized.diagnostics[0]?.code ?? "XIER120_AUTHORING_NORMALIZE_FAILED",
  );
  const gameplayBootstrap = createGameplayBootstrap(normalized.value);
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
  });
  requireInvariant(
    compiled.ok && compiled.executionPlan !== undefined,
    compiled.diagnostics[0]?.code ?? "XIER120_COMPILE_FAILED",
  );
  return Object.freeze({
    executionPlan: compiled.executionPlan,
    controlledEntityId,
  });
}

async function verifyCacheLifecycle(
  subjectDefinitionRef: string,
  subjectAssetRef: string,
  colliderProfileRef: string,
  asset: ExecutionSubjectAssetV1,
  assetBytes: Uint8Array,
): Promise<Pick<
  Xier120SubjectActualUseResultV1,
  | "cacheResolveCount"
  | "leaseCount"
  | "instanceCount"
  | "mutationIsolationVerified"
  | "crossLeaseReleaseIsolationVerified"
  | "disposedInstanceCount"
  | "releasedLeaseCount"
  | "cacheDisposed"
  | "meshCountPerInstance"
>> {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  let cacheResolveCount = 0;
  const cache = new SubjectAssetCacheV1(scene, {
    async resolveSubjectAsset() {
      cacheResolveCount += 1;
      return {
        bytes: Uint8Array.from(assetBytes),
        sourceLabel: subjectAssetRef,
      };
    },
  });
  let firstLease: Awaited<ReturnType<typeof cache.acquire>> | undefined;
  let secondLease: Awaited<ReturnType<typeof cache.acquire>> | undefined;
  let stage: Xier120VerificationStage = "asset-cache-acquire";
  let primaryError: unknown;
  let result: Pick<
    Xier120SubjectActualUseResultV1,
    | "cacheResolveCount"
    | "leaseCount"
    | "instanceCount"
    | "mutationIsolationVerified"
    | "crossLeaseReleaseIsolationVerified"
    | "disposedInstanceCount"
    | "releasedLeaseCount"
    | "cacheDisposed"
    | "meshCountPerInstance"
  > | undefined;

  try {
    firstLease = await cache.acquire(asset);
    secondLease = await cache.acquire(asset);
    stage = "asset-instantiate";
    const firstInstance = firstLease.instantiate("xier120-verifier.first");
    const secondInstance = secondLease.instantiate("xier120-verifier.second");
    requireInvariant(
      firstInstance.rootNodes.length > 0 && secondInstance.rootNodes.length > 0,
      "XIER120_INSTANCE_ROOT_MISSING",
    );
    requireInvariant(
      firstInstance.meshes.length > 0 &&
        firstInstance.meshes.length === secondInstance.meshes.length,
      "XIER120_INSTANCE_MESH_COUNT_INVALID",
    );
    const firstRoot = firstInstance.rootNodes[0]!;
    const secondRoot = secondInstance.rootNodes[0]!;
    const secondPositionBeforeMutation = secondRoot.position.clone();
    const secondMeshIds = new Set(
      secondInstance.meshes.map((mesh) => mesh.uniqueId),
    );
    firstRoot.position.x += 7;
    firstRoot.computeWorldMatrix(true);
    requireInvariant(firstRoot !== secondRoot, "XIER120_INSTANCE_ROOT_SHARED");
    requireInvariant(
      secondRoot.position.equals(secondPositionBeforeMutation),
      "XIER120_INSTANCE_TRANSFORM_SHARED",
    );
    requireInvariant(
      firstInstance.meshes.every((mesh) => !secondMeshIds.has(mesh.uniqueId)),
      "XIER120_INSTANCE_MESH_SHARED",
    );

    stage = "asset-dispose";
    firstInstance.dispose();
    requireInvariant(firstRoot.isDisposed(), "XIER120_FIRST_INSTANCE_NOT_DISPOSED");
    requireInvariant(
      !secondRoot.isDisposed(),
      "XIER120_SECOND_INSTANCE_DISPOSED_EARLY",
    );
    requireInvariant(
      firstInstance.meshes.every((mesh) => mesh.isDisposed()),
      "XIER120_FIRST_INSTANCE_MESH_NOT_DISPOSED",
    );
    let observedReleasedLeaseCount = 0;
    firstLease.release();
    requireInvariant(
      firstRoot.isDisposed(),
      "XIER120_FIRST_INSTANCE_REVIVED_AFTER_LEASE_RELEASE",
    );
    requireInvariant(
      !secondRoot.isDisposed() &&
        secondInstance.meshes.every((mesh) => !mesh.isDisposed()),
      "XIER120_SECOND_INSTANCE_DISPOSED_BY_FIRST_LEASE_RELEASE",
    );
    const secondPositionBeforeReleaseMutation = secondRoot.position.clone();
    const secondMeshVisibilityBeforeReleaseMutation =
      secondInstance.meshes.map((mesh) => mesh.isVisible);
    secondRoot.position.z += 3;
    secondRoot.computeWorldMatrix(true);
    for (const [index, mesh] of secondInstance.meshes.entries()) {
      mesh.isVisible = !secondMeshVisibilityBeforeReleaseMutation[index];
      mesh.computeWorldMatrix(true);
    }
    requireInvariant(
      !secondRoot.position.equals(secondPositionBeforeReleaseMutation) &&
        secondInstance.meshes.every(
          (mesh, index) =>
            !mesh.isDisposed() &&
            mesh.isVisible !== secondMeshVisibilityBeforeReleaseMutation[index],
        ),
      "XIER120_SECOND_INSTANCE_NOT_MUTABLE_AFTER_FIRST_LEASE_RELEASE",
    );
    observedReleasedLeaseCount += 1;
    secondLease.release();
    requireInvariant(
      secondRoot.isDisposed() &&
        secondInstance.meshes.every((mesh) => mesh.isDisposed()),
      "XIER120_SECOND_INSTANCE_NOT_DISPOSED_ON_RELEASE",
    );
    observedReleasedLeaseCount += 1;
    requireInvariant(
      observedReleasedLeaseCount === 2,
      "XIER120_RELEASE_TRANSITION_COUNT_INVALID",
    );
    await cache.dispose();
    let closedCacheError: unknown;
    try {
      await cache.acquire(asset);
    } catch (error) {
      closedCacheError = error;
    }
    requireInvariant(
      isSubjectAssetRuntimeErrorV1(closedCacheError) &&
        closedCacheError.code === "SUBJECT_ASSET_CACHE_DISPOSED",
      "XIER120_CACHE_ACCEPTED_AFTER_DISPOSE",
    );
    requireInvariant(cacheResolveCount === 1, "XIER120_CACHE_RESOLVE_COUNT_INVALID");
    result = Object.freeze({
      cacheResolveCount: 1,
      leaseCount: 2,
      instanceCount: 2,
      mutationIsolationVerified: true,
      crossLeaseReleaseIsolationVerified: true,
      disposedInstanceCount: 2,
      releasedLeaseCount: observedReleasedLeaseCount,
      cacheDisposed: true,
      meshCountPerInstance: firstInstance.meshes.length,
    });
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      firstLease?.release();
      secondLease?.release();
      await cache.dispose();
    } catch (error) {
      primaryError ??= error;
      stage = "asset-dispose";
    }
    try {
      scene.dispose();
      engine.dispose();
    } catch (error) {
      primaryError ??= error;
      stage = "asset-dispose";
    }
  }

  if (primaryError !== undefined) {
    throw actualUseFailure(
      stage,
      subjectDefinitionRef,
      subjectAssetRef,
      colliderProfileRef,
      primaryError,
    );
  }
  requireInvariant(result !== undefined, "XIER120_CACHE_RESULT_MISSING");
  return result;
}

export async function verifyXier120SubjectActualUse(input: {
  readonly authoringSourceText: string;
  readonly subjectDefinitionRef: string;
  readonly assetBytes: Uint8Array;
}): Promise<Xier120SubjectActualUseResultV1> {
  let stage: Xier120VerificationStage = "registry-closure";
  let subjectAssetRef: string | undefined;
  let colliderProfileRef: string | undefined;
  try {
    const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
      input.subjectDefinitionRef,
    );
    requireInvariant(
      definition !== undefined &&
        "schemaVersion" in definition &&
        definition.schemaVersion === 3,
      "XIER120_SUBJECT_DEFINITION_MISSING",
    );
    const assetParts = definition.visualParts.filter(
      (part) => part.kind === "asset",
    );
    requireInvariant(
      assetParts.length === 1,
      "XIER120_SUBJECT_ASSET_PART_COUNT_INVALID",
    );
    subjectAssetRef = assetParts[0]!.subjectAssetRef;
    requireInvariant(
      definition.colliderPolicy.kind === "profile",
      "XIER120_COLLIDER_PROFILE_REQUIRED",
    );
    colliderProfileRef = definition.colliderPolicy.colliderProfileRef;
    const closure = resolveSubjectPresetClosureV1(
      builtInSubjectResourceRegistry,
      input.subjectDefinitionRef,
    );
    requireInvariant(
      closure.entries.some(
        (entry) =>
          entry.resourceKind === "subject-asset" &&
          entry.resourceRef === subjectAssetRef,
      ),
      "XIER120_SUBJECT_ASSET_NOT_IN_CLOSURE",
    );
    requireInvariant(
      closure.entries.some(
        (entry) =>
          entry.resourceKind === "collider-profile" &&
          entry.resourceRef === colliderProfileRef,
      ),
      "XIER120_COLLIDER_PROFILE_NOT_IN_CLOSURE",
    );
    const capabilityCatalogDiscoverable = builtInSubjectResourceRegistry
      .listCapabilitySubjectDefinitions()
      .some((candidate) => candidate.resourceRef === input.subjectDefinitionRef);
    requireInvariant(
      capabilityCatalogDiscoverable,
      "XIER120_SUBJECT_NOT_IN_CAPABILITY_CATALOG",
    );

    stage = "authoring-normalize";
    let compiledSelection: ReturnType<typeof compileSelectedSubject>;
    try {
      compiledSelection = compileSelectedSubject(
        input.authoringSourceText,
        input.subjectDefinitionRef,
      );
    } catch (error) {
      throw actualUseFailure(
        stage,
        input.subjectDefinitionRef,
        subjectAssetRef,
        colliderProfileRef,
        error,
      );
    }
    stage = "compiler";
    const subject = compiledSelection.executionPlan.subjects.find(
      (candidate) =>
        candidate.entityId === compiledSelection.controlledEntityId,
    );
    requireInvariant(
      subject?.subjectDefinitionRef === input.subjectDefinitionRef,
      "XIER120_COMPILED_SUBJECT_DEFINITION_MISMATCH",
    );
    requireInvariant(
      subject.visualParts.some(
        (part) =>
          part.kind === "asset" && part.subjectAssetRef === subjectAssetRef,
      ),
      "XIER120_COMPILED_SUBJECT_ASSET_MISMATCH",
    );
    const asset = compiledSelection.executionPlan.subjectAssets.find(
      (candidate) => candidate.subjectAssetRef === subjectAssetRef,
    );
    requireInvariant(asset !== undefined, "XIER120_COMPILED_ASSET_MISSING");

    stage = "asset-cache-acquire";
    const lifecycle = await verifyCacheLifecycle(
      input.subjectDefinitionRef,
      subjectAssetRef,
      colliderProfileRef,
      asset,
      input.assetBytes,
    );
    return Object.freeze({
      subjectDefinitionRef: input.subjectDefinitionRef,
      subjectAssetRef,
      colliderProfileRef,
      normalized: true,
      compiled: true,
      capabilityCatalogDiscoverable: true,
      ...lifecycle,
    });
  } catch (error) {
    throw actualUseFailure(
      stage,
      input.subjectDefinitionRef,
      subjectAssetRef,
      colliderProfileRef,
      error,
    );
  }
}

async function verifySourceHashes(repositoryRootPath: string): Promise<19> {
  const entries = sourceFbxContributorAssetInventory.filter(
    (entry) => entry.creatorId === "xier120",
  );
  requireInvariant(
    entries.length === EXPECTED_SUBJECT_COUNT,
    "XIER120_SOURCE_COUNT_INVALID",
  );
  for (const entry of entries) {
    const bytes = await readFile(
      resolve(repositoryRootPath, ...entry.repositoryRelativePath.split("/")),
    );
    if (
      bytes.byteLength !== entry.byteLength ||
      sha256Bytes(bytes) !== entry.contentHash
    ) {
      throw new VerificationInvariantError(
        `XIER120_SOURCE_HASH_MISMATCH:${entry.sourceId}`,
      );
    }
  }
  return 19;
}

export async function verifyXier120Subjects(input: {
  readonly repositoryRootPath: string;
  readonly fixtureRelativePath?: string;
}): Promise<Xier120ActualUseVerificationReportV1> {
  const fixtureRelativePath =
    input.fixtureRelativePath ?? DEFAULT_FIXTURE_RELATIVE_PATH;
  const authoringSourceText = await readFile(
    resolve(input.repositoryRootPath, fixtureRelativePath),
    "utf8",
  );
  const parsedFixture = parseAuthoringSpecV4(authoringSourceText);
  requireInvariant(
    parsedFixture.ok && parsedFixture.value !== undefined,
    parsedFixture.diagnostics[0]?.code ?? "XIER120_FIXTURE_INVALID",
  );
  const fixtureSubject = parsedFixture.value.nodes.find(
    (node) =>
      node.kind === "subject" &&
      node.id === parsedFixture.value!.startup.controlledEntityId,
  );
  requireInvariant(
    fixtureSubject?.kind === "subject" &&
      fixtureSubject.subjectDefinitionRef.startsWith(
        "worldkit://subject-definition/xier120.",
      ),
    "XIER120_FIXTURE_DIRECT_SUBJECT_REF_REQUIRED",
  );

  const sourceHashMatchCount = await verifySourceHashes(
    input.repositoryRootPath,
  );
  const bakeSummaries = await bakeXier120StaticSubjects({
    repositoryRootPath: input.repositoryRootPath,
    check: true,
  });
  requireInvariant(
    bakeSummaries.length === EXPECTED_SUBJECT_COUNT &&
      bakeSummaries.every((summary) => summary.matchedCommittedBytes),
    "XIER120_BAKE_CHECK_FAILED",
  );

  const definitions = [...XIER120_SUBJECT_DEFINITIONS].sort((left, right) =>
    left.resourceRef.localeCompare(right.resourceRef),
  );
  requireInvariant(
    definitions.length === EXPECTED_SUBJECT_COUNT,
    "XIER120_DEFINITION_COUNT_INVALID",
  );
  const results: Xier120SubjectActualUseResultV1[] = [];
  for (const definition of definitions) {
    const resolvedDefinition =
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        definition.resourceRef,
      );
    requireInvariant(
      resolvedDefinition !== undefined &&
        "schemaVersion" in resolvedDefinition &&
        resolvedDefinition.schemaVersion === 3,
      `XIER120_BUILT_IN_DEFINITION_MISSING:${definition.resourceRef}`,
    );
    const assetPart = resolvedDefinition.visualParts.find(
      (part) => part.kind === "asset",
    );
    requireInvariant(
      assetPart?.kind === "asset",
      `XIER120_DEFINITION_ASSET_MISSING:${definition.resourceRef}`,
    );
    const publicAssetUri =
      XIER120_SUBJECT_ASSET_URI_BY_REF_V1[assetPart.subjectAssetRef];
    requireInvariant(
      publicAssetUri !== undefined &&
        publicAssetUri.startsWith("/subject-assets/xier120/"),
      `XIER120_PLAYGROUND_ASSET_PATH_MISSING:${assetPart.subjectAssetRef}`,
    );
    const assetBytes = await readFile(
      resolve(
        input.repositoryRootPath,
        "apps/playground/public",
        publicAssetUri.slice(1),
      ),
    );
    results.push(
      await verifyXier120SubjectActualUse({
        authoringSourceText,
        subjectDefinitionRef: definition.resourceRef,
        assetBytes,
      }),
    );
  }

  return Object.freeze({
    kind: "xier120-subject-actual-use-verification",
    schemaVersion: 1,
    fixtureRelativePath,
    fixtureSubjectDefinitionRef: fixtureSubject.subjectDefinitionRef,
    selectionMode: "direct-fixture-ref-plus-capability-catalog",
    sourceHashMatchCount,
    exactBakeMatchCount: 19,
    subjectCount: 19,
    results: Object.freeze(results),
  });
}

async function main(): Promise<void> {
  const repositoryRootPath = fileURLToPath(new URL("../", import.meta.url));
  const report = await verifyXier120Subjects({ repositoryRootPath });
  console.table(
    report.results.map((result) => ({
      definitionRef: result.subjectDefinitionRef,
      assetRef: result.subjectAssetRef,
      colliderRef: result.colliderProfileRef,
      compiled: result.compiled,
      instances: result.instanceCount,
      isolated: result.mutationIsolationVerified,
      disposed: result.disposedInstanceCount,
    })),
  );
  console.log(
    `xier120 actual-use: ${report.subjectCount}/${EXPECTED_SUBJECT_COUNT} passed; ` +
      `source hashes ${report.sourceHashMatchCount}/${EXPECTED_SUBJECT_COUNT}; ` +
      `exact bakes ${report.exactBakeMatchCount}/${EXPECTED_SUBJECT_COUNT}; ` +
      "two instances and full lease/cache disposal verified for every Subject",
  );
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
