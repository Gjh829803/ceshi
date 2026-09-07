import {
  normalizeSubjectDefinitionV2,
  ResourceLockBuilderV1,
  validatePackageSubjectDefinition,
  validateSubjectDesignV1,
  type AuthoringDiagnostic,
  type AuthoringDocumentBase,
  type NormalizeSubjectDefinitionRequestV2,
  type NormalizedSubjectDefinitionV2,
  type PackageSubjectDefinitionV1,
} from "@whitebox-world/authoring";
import { compileNormalizedSubjectResourcesV1, type CompiledSubjectResourcesV1, type NormalizedSubjectTraversalResourcesV1 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import {
  createGameplayBootstrapResourceLockEntryV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import type { Sha256HashV1 } from "@whitebox-world/protocol";
import {
  createWorldRuntimeBootstrapV1,
  parseWorldRuntimeBootstrapV1,
  worldResourceLockEntriesV1,
  type RuntimeResourceKindV1,
  type WorldResourceLockEntryV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import type { SubjectResourceRegistryV3 } from "@whitebox-world/subject-registry";
import { assertWorldPackageAccessorFreeDataGraphV1 } from "@whitebox-world/world-package";
import { checkNativeComposedSubjectDesignV1, compileNativeComposedSubjectDefinitionV1 } from "./native-composed-subject-definition.js";

export interface NativeSubjectHostClosureInputV1 {
  readonly worldId: string;
  readonly seed: number;
  readonly controlledEntityId: string;
  readonly subject:
    | Readonly<{ source: "registry"; subjectDefinitionRef: string }>
    | Readonly<{ source: "package"; definition: PackageSubjectDefinitionV1 }>;
  readonly resourceBudget?: AuthoringDocumentBase["world"]["resourceBudget"];
  readonly gravityMetersPerSecondSquaredXYZ:
    WorldRuntimeBootstrapV1["gravityMetersPerSecondSquaredXYZ"];
  readonly initialCamera: Omit<WorldRuntimeBootstrapV1["initialCamera"], "targetEntityId" | "cameraRigProfileRef">;
}

export type NativeSubjectHostClosureResultV1 =
  | Readonly<{ ok: false; diagnostics: readonly AuthoringDiagnostic[] }>
  | Readonly<{
      ok: true;
      gameplayBootstrap: GameplayBootstrapV1;
      worldRuntimeBootstrapRef: string;
      worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
      registryLock: readonly WorldResourceLockEntryV1[];
      normalizedSubjectResources: NormalizedSubjectTraversalResourcesV1;
      subjectResourceCost: Readonly<{ vertices: number; triangles: number; colliders: number }>;
    }>;

export type NativeSubjectHostDesignInputV1 = Omit<NativeSubjectHostClosureInputV1, "subject"> & {
  readonly subjectDesign: unknown;
};

/** Shape proposal -> the same Host constructor; no name matching or fallback. */
export function compileNativeSubjectHostClosureFromDesignV1(
  input: NativeSubjectHostDesignInputV1,
  registry: SubjectResourceRegistryV3,
): NativeSubjectHostClosureResultV1 {
  let snapshot: NativeSubjectHostDesignInputV1;
  try {
    assertWorldPackageAccessorFreeDataGraphV1(input);
    snapshot = structuredClone(input);
  } catch {
    return failure("NATIVE_SUBJECT_HOST_INPUT_INVALID", "Host Subject design input must be an accessor-free data graph.");
  }
  const { subjectDesign, ...hostInput } = snapshot;
  const proposal = validateSubjectDesignV1(subjectDesign);
  if (!proposal.ok || proposal.value === undefined) return { ok: false, diagnostics: proposal.diagnostics };
  if (proposal.value.kind === "registered") {
    return compileNativeSubjectHostClosureV1({ ...hostInput, subject: {
      source: "registry", subjectDefinitionRef: proposal.value.subjectDefinitionRef,
    } }, registry);
  }
  const policyDiagnostics = checkNativeComposedSubjectDesignV1(proposal.value.definition);
  if (policyDiagnostics.length > 0) return { ok: false, diagnostics: policyDiagnostics };
  const composed = compileNativeComposedSubjectDefinitionV1(proposal.value.definition);
  if (!composed.ok || composed.value === undefined) return { ok: false, diagnostics: composed.diagnostics };
  return compileNativeSubjectHostClosureV1({ ...hostInput, subject: {
    source: "package", definition: composed.value,
  } }, registry);
}

function failure(code: string, message: string): Readonly<{ ok: false; diagnostics: readonly AuthoringDiagnostic[] }> {
  return { ok: false, diagnostics: [{ severity: "error", code, instancePath: "/subject", message }] };
}

export interface NativeSubjectProjectionInputV1 {
  readonly controlledEntityId: string;
  readonly subject: NativeSubjectHostClosureInputV1["subject"];
  readonly resourceBudget?: NativeSubjectHostClosureInputV1["resourceBudget"];
}

export type NativeSubjectProjectionResultV1 =
  | Readonly<{ ok: false; diagnostics: readonly AuthoringDiagnostic[] }>
  | Readonly<{
      ok: true;
      definition: NormalizedSubjectDefinitionV2;
      resources: ReturnType<ResourceLockBuilderV1["finish"]>;
      projection: CompiledSubjectResourcesV1;
    }>;

/** One normalization/compilation owner shared by Host closure and Registry replay. */
export function compileNativeSubjectProjectionV1(
  input: NativeSubjectProjectionInputV1,
  registry: SubjectResourceRegistryV3,
): NativeSubjectProjectionResultV1 {
  let snapshot: NativeSubjectProjectionInputV1;
  try {
    assertWorldPackageAccessorFreeDataGraphV1(input);
    snapshot = structuredClone(input);
  } catch {
    return failure("NATIVE_SUBJECT_HOST_INPUT_INVALID", "Host Subject input must be an accessor-free data graph.");
  }
  try {
    const diagnostics: AuthoringDiagnostic[] = [];
    const resourceLockBuilder = new ResourceLockBuilderV1();
    const common = {
      instancePath: "/subject",
      subjectResourceRegistry: registry,
      resourceLockBuilder,
      diagnostics,
      ...(snapshot.resourceBudget === undefined ? {} : { resourceBudget: snapshot.resourceBudget }),
    };
    let request: NormalizeSubjectDefinitionRequestV2;
    if (snapshot.subject.source === "registry") {
      const definition = registry.resolveSubjectDefinition(snapshot.subject.subjectDefinitionRef);
      if (definition === undefined || !("schemaVersion" in definition) || definition.schemaVersion !== 3 ||
        definition.resourceRef !== snapshot.subject.subjectDefinitionRef) {
        return failure("AUTHORING_REFERENCE_NOT_FOUND", "The exact selected Subject Definition is unavailable.");
      }
      request = { ...common, source: "registry", definition, subjectDefinitionRef: definition.resourceRef };
    } else if (snapshot.subject.source === "package") {
      const parsed = validatePackageSubjectDefinition(snapshot.subject.definition);
      if (!parsed.ok || parsed.value === undefined) return { ok: false, diagnostics: parsed.diagnostics };
      request = {
        ...common,
        source: "package",
        definition: parsed.value,
        subjectDefinitionRef: `package://subject-definition/${parsed.value.id}@${parsed.value.version}`,
      };
    } else {
      return failure("NATIVE_SUBJECT_HOST_INPUT_INVALID", "Host Subject input must select one explicit source.");
    }
    const definition = normalizeSubjectDefinitionV2(request);
    if (definition === undefined || diagnostics.some(({ severity }) => severity === "error")) {
      return { ok: false, diagnostics };
    }
    const resources = resourceLockBuilder.finish();
    // Subject-local origin for compilation only. The Native contribution remains
    // the sole world Spawn source; this anchor is never published as scene data.
    const originAnchorId = `${snapshot.controlledEntityId}.subject-origin`;
    const projection = compileNormalizedSubjectResourcesV1({
      resources: { ...resources, subjectDefinitions: [definition] },
      nodes: [
        {
          id: originAnchorId,
          kind: "anchor",
          transform: {
            positionMetersXYZ: [0, 0, 0],
            rotationEulerRadiansXYZ: [0, 0, 0],
            scaleXYZ: [1, 1, 1],
          },
        },
        {
          id: snapshot.controlledEntityId,
          kind: "subject",
          subjectDefinitionRef: definition.subjectDefinitionRef,
          spawnAnchorEntityId: originAnchorId,
        },
      ],
    });
    return { ok: true, definition, resources, projection };
  } catch {
    return failure("NATIVE_SUBJECT_HOST_CLOSURE_INVALID", "Selected Subject resources could not produce a valid Host projection.");
  }
}

/**
 * Compiles an explicitly selected Subject through the existing Host owners.
 * It does not interpret Planner prose, select an approximation, certify requested
 * movement modes, or admit the whole Native Package resource budget. Callers
 * retain those responsibilities and bind the returned identities to their run.
 */
export function compileNativeSubjectHostClosureV1(
  input: NativeSubjectHostClosureInputV1,
  registry: SubjectResourceRegistryV3,
): NativeSubjectHostClosureResultV1 {
  let snapshot: NativeSubjectHostClosureInputV1;
  try {
    assertWorldPackageAccessorFreeDataGraphV1(input);
    snapshot = structuredClone(input);
  } catch {
    return failure("NATIVE_SUBJECT_HOST_INPUT_INVALID", "Host Subject input must be an accessor-free data graph.");
  }
  try {
    const compiled = compileNativeSubjectProjectionV1(snapshot, registry);
    if (!compiled.ok) return compiled;
    const { definition, resources, projection } = compiled;
    const gameplayBootstrap = createCoreGameplayBootstrapV1({
      worldId: snapshot.worldId,
      worldSeed: snapshot.seed,
      entityDescriptors: [{
        id: snapshot.controlledEntityId,
        entityDefinitionRef: definition.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      }],
      initialRelationshipStates: [],
    });
    const runtimeResourceLockEntries = worldResourceLockEntriesV1([
      ...resources.resourceLock,
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
    ]).map((row) => ({
      resourceRef: row.resourceRef,
      resourceKind: row.resourceKind as RuntimeResourceKindV1,
      resolvedVersion: row.resolvedVersion,
      contentHash: row.contentHash as Sha256HashV1,
    }));
    const worldRuntimeBootstrap = parseWorldRuntimeBootstrapV1(createWorldRuntimeBootstrapV1({
      kind: "world-runtime-bootstrap",
      schemaVersion: 1,
      id: `${snapshot.worldId}.runtime-bootstrap`,
      gameplayBootstrapRef: gameplayBootstrap.resourceRef,
      gameplayBootstrapHash: gameplayBootstrap.contentHash,
      initialControlledEntityId: snapshot.controlledEntityId,
      gravityMetersPerSecondSquaredXYZ: snapshot.gravityMetersPerSecondSquaredXYZ,
      initialCamera: {
        ...snapshot.initialCamera,
        cameraRigProfileRef: projection.subjects[0]!.capabilityAssembly.cameraContext.defaultCameraRigProfileRef,
        targetEntityId: snapshot.controlledEntityId,
      },
      subjectAssets: projection.subjectAssets,
      rigProfiles: projection.rigProfiles,
      animationSets: projection.animationSets,
      colliderProfiles: projection.colliderProfiles,
      actionPresentationRegistry: { schemaVersion: 1, bindings: [], rootMotionSources: [] },
      subjectRuntimeDescriptors: projection.subjects.map((subject) => {
        const { spawnAnchorEntityId: _anchor, spawnSubjectOriginPositionMetersXYZ: _position, spawnSubjectFacingRadians: _facing, ...descriptor } = subject;
        return descriptor;
      }),
      runtimeResourceLockEntries,
    }));
    const worldRuntimeBootstrapRef = `worldkit://world-runtime-bootstrap/${snapshot.worldId}@1`;
    const registryLock = worldResourceLockEntriesV1([
      ...runtimeResourceLockEntries,
      {
        resourceKind: "world-runtime-bootstrap",
        resourceRef: worldRuntimeBootstrapRef,
        resolvedVersion: "1",
        contentHash: worldRuntimeBootstrap.contentHash,
      },
    ]);
    return Object.freeze({
      ok: true,
      gameplayBootstrap,
      worldRuntimeBootstrapRef,
      worldRuntimeBootstrap,
      registryLock,
      subjectResourceCost: Object.freeze(projection.resourceCost),
      normalizedSubjectResources: { ...resources, subjectDefinitions: [definition] },
    });
  } catch {
    return failure("NATIVE_SUBJECT_HOST_CLOSURE_INVALID", "Selected Subject resources could not produce a valid Host closure.");
  }
}
