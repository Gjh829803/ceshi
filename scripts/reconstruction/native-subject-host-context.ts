import type { AuthoringDiagnostic, SceneBriefMovementModeV1 } from "@whitebox-world/authoring";
import { coreGameplayBootstrapResourceRefV1 } from "@whitebox-world/gameplay";
import { parseNativeBlockAuthoringManifestV1 } from "@whitebox-world/native-babylon-block-profile";
import { sha256Bytes, stringifyCanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import { parseBabylonNativeSceneBootstrapV1, worldResourceLockEntriesV1, worldRuntimeBootstrapCanonicalBytesV1, type WorldResourceLockEntryV1, type WorldRuntimeBootstrapV1 } from "@whitebox-world/runtime-contracts";
import { BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF, resolveTraversalSurfaceProfileV1 } from "@whitebox-world/traversal";
import {
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
  type SubjectRegistryResourceV3,
  type SubjectRegistryResourceInputV3,
  type SubjectResourceRegistryV3,
  type RegistrySubjectDefinitionV3,
} from "@whitebox-world/subject-registry";
import { assertWorldPackageAccessorFreeDataGraphV1 } from "@whitebox-world/world-package";
import { compileNativeSubjectHostClosureFromDesignV1, type NativeSubjectHostClosureResultV1 } from "./native-subject-host-closure.js";
import { deriveNativeBlockSubjectVisualReviewProxyV1, type NativeBlockSubjectVisualReviewProxyV1 } from "./native-block-subject-visual-review-proxy.js";

export const NATIVE_SUBJECT_MOVEMENT_DIAGNOSTIC_CODE_V1 = "NATIVE_BLOCK_BUILDER_SUBJECT_MOVEMENT_UNSATISFIED";

// Pinned 9e35ab53 agent-authoring-catalog mapping. Only evaluate after the
// selected definition has passed the real Normalizer/Compiler; names, visual
// shapes and supportedMediums do not establish an executable movement mode.
const MOVEMENT_CAPABILITIES = [
  ["ground-walk", ["worldkit://capability/locomotion.ground@1"]],
  ["ground-slide", ["worldkit://capability/locomotion.surface-slide@1"]],
  ["ground-ride", ["worldkit://capability/locomotion.forward-steer@1", "worldkit://capability/relationship.mounted-on@1"]],
  ["ground-drive", ["worldkit://capability/locomotion.wheeled@1"]],
  ["water-surface", ["worldkit://capability/locomotion.water-surface@1"]],
  ["flight", ["worldkit://capability/locomotion.unpowered-glide@1"]],
] as const satisfies readonly (readonly [SceneBriefMovementModeV1, readonly string[]])[];

type RuntimeSubject = WorldRuntimeBootstrapV1["subjectRuntimeDescriptors"][number];

export interface NativeSubjectAuthoringCatalogV1 {
  readonly subjects: readonly Readonly<{
    subjectDefinitionRef: string;
    subjectDefinitionHash: string;
    displayName: string;
    description: string;
    category: RegistrySubjectDefinitionV3["category"];
    bodyTopology: RegistrySubjectDefinitionV3["bodyTopology"];
    authoringAvailability: RegistrySubjectDefinitionV3["authoringAvailability"];
    semanticTags: readonly string[];
    executableMovementModes: readonly SceneBriefMovementModeV1[];
    executableCapabilityRefs: readonly string[];
    collider: RuntimeSubject["collider"];
    cameraContext: RuntimeSubject["capabilityAssembly"]["cameraContext"];
    visualReviewProxy: Pick<NativeBlockSubjectVisualReviewProxyV1, "cuboids">;
  }>[];
  readonly rejectedSubjects: readonly Readonly<{
    subjectDefinitionRef: string;
    diagnostics: readonly AuthoringDiagnostic[];
  }>[];
}

// One bounded memoized projection, keyed by every frozen dependency. Store only
// immutable canonical bytes so no caller can mutate another context's catalog.
let cachedAuthoringCatalog: Readonly<{ registryIdentityHash: string; canonicalJson: string }> | undefined;

/** Frozen inputs, not a selected Subject or a second Runtime bootstrap. */
export interface NativeSubjectHostContextV1 {
  readonly kind: "native-subject-host-context";
  readonly schemaVersion: 1;
  readonly worldId: string;
  readonly cameraEntityId: string;
  readonly resources: readonly SubjectRegistryResourceV3[];
  readonly authoringCatalog: NativeSubjectAuthoringCatalogV1;
  readonly traversalSurfaceProfileLock: WorldResourceLockEntryV1;
}

function restoreRegistry(resources: readonly SubjectRegistryResourceV3[]): SubjectResourceRegistryV3 {
  // Registry input schemas exclude the output-only contentHash field. Recompute
  // it with the Registry owner, then verify every frozen row instead of ignoring it.
  const registry = createSubjectResourceRegistry(resources.map(({ contentHash: _hash, ...source }) =>
    source as SubjectRegistryResourceInputV3));
  if (resources.some((resource) => registry.resolveResource(resource.resourceRef)?.contentHash !== resource.contentHash)) {
    throw new TypeError("NATIVE_SUBJECT_HOST_CONTEXT_INVALID: frozen Registry resource hash mismatch.");
  }
  return registry;
}

export function createNativeSubjectHostContextV1(
  worldId: string,
  cameraEntityId: string,
  registry: SubjectResourceRegistryV3 = builtInSubjectResourceRegistry,
): NativeSubjectHostContextV1 {
  const { profile: _profile, ...surface } = resolveTraversalSurfaceProfileV1(BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF);
  return parseNativeSubjectHostContextV1({
    kind: "native-subject-host-context", schemaVersion: 1, worldId, cameraEntityId,
    resources: registry.listDiscoverableResources(),
    authoringCatalog: createNativeSubjectAuthoringCatalogV1(registry),
    traversalSurfaceProfileLock: { ...surface, resourceKind: "traversal-surface-profile" },
  });
}

export function parseNativeSubjectHostContextV1(input: unknown): NativeSubjectHostContextV1 {
  assertWorldPackageAccessorFreeDataGraphV1(input);
  const value = structuredClone(input) as NativeSubjectHostContextV1;
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "authoringCatalog,cameraEntityId,kind,resources,schemaVersion,traversalSurfaceProfileLock,worldId" ||
    value.kind !== "native-subject-host-context" || value.schemaVersion !== 1 ||
    typeof value.worldId !== "string" || !/^[a-z0-9][a-z0-9.-]{2,127}$/.test(value.worldId) ||
    typeof value.cameraEntityId !== "string" || !/^[a-z0-9][a-z0-9.-]{2,127}$/.test(value.cameraEntityId) ||
    !Array.isArray(value.resources)) {
    throw new TypeError("NATIVE_SUBJECT_HOST_CONTEXT_INVALID: expected one frozen Host resource context.");
  }
  // The Registry owns validation, reference closure, canonicalization and freezing.
  const registry = restoreRegistry(value.resources);
  // Catalog rows are a readable projection of the same resources, never an
  // alternative selection authority. Recompute instead of trusting advertised modes.
  const authoringCatalog = createNativeSubjectAuthoringCatalogV1(registry);
  if (stringifyCanonicalJson(value.authoringCatalog) !== stringifyCanonicalJson(authoringCatalog)) {
    throw new TypeError("NATIVE_SUBJECT_HOST_CONTEXT_INVALID: authoring catalog differs from its frozen Registry.");
  }
  const surface = worldResourceLockEntriesV1([value.traversalSurfaceProfileLock])[0]!;
  if (surface.resourceKind !== "traversal-surface-profile" ||
    surface.resourceRef !== BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF) {
    throw new TypeError("NATIVE_SUBJECT_HOST_CONTEXT_INVALID: expected the Native ground surface resource lock.");
  }
  return Object.freeze({ ...value, resources: registry.listDiscoverableResources(), authoringCatalog, traversalSurfaceProfileLock: surface });
}

/** The checker, renderer and Package owner compile the same output proposal. */
export function resolveNativeSubjectAuthoringClosureV1(input: Readonly<{
  context: unknown;
  bootstrap: unknown;
  authoring: unknown;
}>) {
  const context = parseNativeSubjectHostContextV1(input.context);
  const bootstrap = parseBabylonNativeSceneBootstrapV1(input.bootstrap);
  const authoring = parseNativeBlockAuthoringManifestV1(input.authoring);
  if (bootstrap.gameplayBootstrapRef !== coreGameplayBootstrapResourceRefV1({
    worldId: context.worldId, worldSeed: bootstrap.seed,
  })) throw new TypeError("NATIVE_SUBJECT_HOST_CONTEXT_INVALID: Gameplay resource identity mismatch.");
  const registry = restoreRegistry(context.resources);
  const closure = compileNativeSubjectHostClosureFromDesignV1({
    worldId: context.worldId,
    seed: bootstrap.seed,
    controlledEntityId: bootstrap.initialControlledEntityId,
    subjectDesign: authoring.controlledSubject.design,
    gravityMetersPerSecondSquaredXYZ: bootstrap.gravityMetersPerSecondSquaredXYZ,
    initialCamera: {
      ...bootstrap.initialCamera,
      cameraEntityId: context.cameraEntityId,
      manualSwitchAllowed: true,
    },
  }, registry);
  if (!closure.ok) throw new TypeError(closure.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("\n"));
  return completeNativeSubjectAuthoringClosureV1(closure, registry);
}

function completeNativeSubjectAuthoringClosureV1(
  closure: Extract<NativeSubjectHostClosureResultV1, { ok: true }>,
  registry: SubjectResourceRegistryV3,
) {
  const definition = closure.normalizedSubjectResources.subjectDefinitions[0]!;
  const registered = definition.source === "registry" ? registry.resolveSubjectDefinition(definition.subjectDefinitionRef) : undefined;
  const capabilities = new Set([
    ...closure.normalizedSubjectResources.subjectDefinitions[0]!.capabilityRefs,
    ...(registered?.relationshipCapabilityRefs ?? []),
  ]);
  const executableMovementModes: readonly SceneBriefMovementModeV1[] = Object.freeze(definition.source === "package"
    ? ["ground-walk"]
    : MOVEMENT_CAPABILITIES.filter(([, requiredRefs]) => requiredRefs.every((ref) => capabilities.has(ref))).map(([mode]) => mode));
  const worldRuntimeBootstrapBytes = worldRuntimeBootstrapCanonicalBytesV1(closure.worldRuntimeBootstrap);
  const subjectVisualReviewProxy = deriveNativeBlockSubjectVisualReviewProxyV1({
    worldRuntimeBootstrap: closure.worldRuntimeBootstrap,
    worldRuntimeBootstrapRef: closure.worldRuntimeBootstrapRef,
    worldRuntimeBootstrapBytesHash: sha256Bytes(worldRuntimeBootstrapBytes) as Sha256HashV1,
  }, registry);
  return Object.freeze({
    ...closure, executableMovementModes, subjectVisualReviewProxy, worldRuntimeBootstrapBytes,
    subjectVisualReviewProxyBytes: new TextEncoder().encode(stringifyCanonicalJson(subjectVisualReviewProxy)),
  });
}

/** Same-task check and trusted Host replay, never pre-dispatch admission. */
export function checkNativeSubjectHostedSelectionV1(
  closure: ReturnType<typeof resolveNativeSubjectAuthoringClosureV1>,
  requestedMovementModes: readonly SceneBriefMovementModeV1[],
): readonly AuthoringDiagnostic[] {
  const definition = closure.normalizedSubjectResources.subjectDefinitions[0]!;
  const hostedDiagnostics = definition.source === "registry"
    ? hostedRegisteredSubjectDiagnosticsV1(definition, definition.subjectDefinitionRef) : [];
  if (hostedDiagnostics.length > 0) return hostedDiagnostics;
  const missingMovementModes = requestedMovementModes.filter((mode) => !closure.executableMovementModes.includes(mode));
  if (missingMovementModes.length === 0) return [];
  return [{
    code: NATIVE_SUBJECT_MOVEMENT_DIAGNOSTIC_CODE_V1,
    severity: "error",
    message: "The controlled Subject executable capability closure does not satisfy every Scene Brief movement mode.",
    instancePath: "/controlledSubject",
    details: {
      subjectKind: definition.source === "registry" ? "registered" : "composed",
      subjectDefinitionRef: definition.source === "registry" ? definition.subjectDefinitionRef : null,
      requestedMovementModes: [...requestedMovementModes],
      executableMovementModes: [...closure.executableMovementModes],
      missingMovementModes,
    },
  }];
}

// Exact 9e35ab53 Hosted catalog policy, not an SDK/Runtime restriction.
function hostedRegisteredSubjectDiagnosticsV1(definition: Readonly<{
  category: string; bodyTopology: string;
  visualParts: readonly Readonly<{ kind: string }>[];
  visualBinding: Readonly<{ mode: string }>;
}>, subjectDefinitionRef: string): readonly AuthoringDiagnostic[] {
  if (definition.category === "human" && definition.bodyTopology === "biped" &&
    !(definition.visualParts.some(({ kind }) => kind === "asset") && definition.visualBinding.mode === "rigged")) {
    return [{
      code: "NATIVE_BLOCK_BUILDER_SUBJECT_NOT_HOSTED_AUTHORING_ADMITTED", severity: "error",
      message: "The controlled registered Subject is not admitted for Hosted Builder authoring.",
      instancePath: "/controlledSubject/subjectDefinitionRef",
      details: { subjectDefinitionRef,
        rejectionDiagnostics: ["Hosted ordinary-human authoring requires an asset-backed rigged Subject; primitive humanoid proxies remain SDK test/runtime fixtures."],
      },
    }];
  }
  return [];
}

/** Readable pre-dispatch catalog, as in the old Builder; not a selected world. */
export function createNativeSubjectAuthoringCatalogV1(registry: SubjectResourceRegistryV3): NativeSubjectAuthoringCatalogV1 {
  const registryIdentityHash = sha256Bytes(new TextEncoder().encode(stringifyCanonicalJson(
    registry.listDiscoverableResources().map(({ resourceRef, contentHash }) => ({ resourceRef, contentHash })),
  )));
  if (cachedAuthoringCatalog?.registryIdentityHash === registryIdentityHash) {
    return Object.freeze(JSON.parse(cachedAuthoringCatalog.canonicalJson) as NativeSubjectAuthoringCatalogV1);
  }
  const subjects: NativeSubjectAuthoringCatalogV1["subjects"][number][] = [];
  const rejectedSubjects: NativeSubjectAuthoringCatalogV1["rejectedSubjects"][number][] = [];
  for (const definition of registry.listDiscoverableResources({ kind: "subject-definition" })) {
    const hostedDiagnostics = hostedRegisteredSubjectDiagnosticsV1(definition, definition.resourceRef);
    if (hostedDiagnostics.length > 0) {
      rejectedSubjects.push({ subjectDefinitionRef: definition.resourceRef, diagnostics: hostedDiagnostics });
      continue;
    }
    // These are the pinned old catalog probe values, not production defaults or
    // a fallback Subject. Native geography is never compiled through a fake Scene.
    const compiled = compileNativeSubjectHostClosureFromDesignV1({
      worldId: "agent-authoring-catalog-probe", seed: 1, controlledEntityId: "player",
      subjectDesign: { kind: "registered", subjectDefinitionRef: definition.resourceRef },
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      initialCamera: { cameraEntityId: "camera-main", mode: "third-person", manualSwitchAllowed: true,
        pitchRadians: 0.12, distanceMeters: 5, targetHeightMeters: 1.25, fovDegrees: 56 },
    }, registry);
    if (!compiled.ok) {
      rejectedSubjects.push({ subjectDefinitionRef: definition.resourceRef, diagnostics: compiled.diagnostics });
      continue;
    }
    const closure = completeNativeSubjectAuthoringClosureV1(compiled, registry);
    const subject = closure.worldRuntimeBootstrap.subjectRuntimeDescriptors[0]!;
    subjects.push({
      subjectDefinitionRef: definition.resourceRef, subjectDefinitionHash: subject.subjectDefinitionHash,
      displayName: definition.aiMetadata.displayName, description: definition.aiMetadata.description,
      category: definition.category, bodyTopology: definition.bodyTopology, semanticTags: definition.aiMetadata.semanticTags,
      authoringAvailability: definition.authoringAvailability,
      executableMovementModes: closure.executableMovementModes,
      executableCapabilityRefs: Object.freeze([...definition.capabilityRefs, ...definition.relationshipCapabilityRefs]),
      collider: subject.collider, cameraContext: subject.capabilityAssembly.cameraContext,
      visualReviewProxy: Object.freeze({ cuboids: closure.subjectVisualReviewProxy.cuboids }),
    });
  }
  const canonicalJson = stringifyCanonicalJson({ subjects, rejectedSubjects });
  cachedAuthoringCatalog = Object.freeze({ registryIdentityHash, canonicalJson });
  return Object.freeze(JSON.parse(canonicalJson) as NativeSubjectAuthoringCatalogV1);
}
