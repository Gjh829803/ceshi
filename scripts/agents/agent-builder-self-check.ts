import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  normalizeAuthoringSpecV4,
  parseAuthoringSpecV4,
  parseSceneBriefV1,
  stringifyCanonicalJson,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import {
  compileCanonicalWorldV1,
  sampleTerrainHeight,
} from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import {
  validateSceneBriefImplementationMapDraftV1,
  type CanonicalSceneExecutionPlanV1,
  type SceneBriefImplementationMapDraftV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

import {
  collectBuilderLargeWorldEvidenceV1,
  type BuilderLargeWorldEvidenceV1,
} from "../lib/builder-large-world-evidence";

export const BUILDER_SELF_CHECK_VERSION = "worldkit-builder-self-check-v6";

const SPAWN_GROUND_TOLERANCE_METERS = 0.15;

interface SelfCheckDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly instancePath?: string;
  readonly details?: unknown;
}

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

function contentHash(source: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function gameplayBootstrap(
  normalizedWorldIr: NormalizedWorldIRV4,
) {
  const entityDescriptors = normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) =>
          candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (isNil(definition)) {
        throw new Error(
          `BUILDER_SELF_CHECK_GAMEPLAY_SUBJECT_DEFINITION_MISSING: ${node.subjectDefinitionRef}`,
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

function whiteboxLightingDiagnostics(authoring: any): SelfCheckDiagnostic[] {
  const preset = authoring.world?.environment?.preset;
  if (preset === "clear-day") return [];
  return [{
    code: "WHITEBOX_LIGHTING_PRESET_INVALID",
    message: "Generated whitebox worlds must use the uniform clear-day inspection-light preset regardless of reference-image lighting.",
    instancePath: "/world/environment/preset",
    details: { actualPreset: preset, requiredPreset: "clear-day" },
  }];
}

export function hostedRelationshipAdmissionDiagnostics(authoring: {
  readonly relationships?: readonly unknown[];
  readonly resources?: {
    readonly subjectDefinitions?: readonly {
      readonly id?: string;
      readonly relationshipCapabilityRefs?: readonly string[];
    }[];
  };
}): SelfCheckDiagnostic[] {
  const diagnostics: SelfCheckDiagnostic[] = [];
  if ((authoring.relationships?.length ?? 0) > 0) {
    diagnostics.push({
      code: "HOSTED_RELATIONSHIP_NOT_PRODUCTION_AVAILABLE",
      message: "Hosted Builder production Authoring must not emit mount, seat, or tether relationships in the current phase.",
      instancePath: "/relationships",
    });
  }
  authoring.resources?.subjectDefinitions?.forEach((definition, index) => {
    if ((definition.relationshipCapabilityRefs?.length ?? 0) === 0) return;
    diagnostics.push({
      code: "HOSTED_RELATIONSHIP_CAPABILITY_NOT_PRODUCTION_AVAILABLE",
      message: "Hosted Builder production Subjects must assemble rider, body, and equipment as one Subject instead of declaring a reserved relationship capability.",
      instancePath: `/resources/subjectDefinitions/${index}/relationshipCapabilityRefs`,
      details: {
        subjectDefinitionId: definition.id,
        relationshipCapabilityRefs: definition.relationshipCapabilityRefs,
      },
    });
  });
  return diagnostics;
}

function subjectUsesGroundSupport(
  subject: WorldRuntimeBootstrapV1["subjectRuntimeDescriptors"][number],
): boolean {
  const assembly = subject.capabilityAssembly;
  if (assembly !== undefined) {
    const kernel = assembly.motionKernels.find(
      ({ resourceRef }) =>
        resourceRef === assembly.defaultMotionProfile.motionKernelRef,
    );
    return kernel?.supportedMediums.includes("ground") === true;
  }
  return subject.locomotion.allowWalk || subject.locomotion.allowRun;
}

function spawnGroundingDiagnostics(
  executionPlan: CanonicalSceneExecutionPlanV1,
  worldRuntimeBootstrap: WorldRuntimeBootstrapV1,
): SelfCheckDiagnostic[] {
  const diagnostics: SelfCheckDiagnostic[] = [];
  for (const subject of worldRuntimeBootstrap.subjectRuntimeDescriptors) {
    if (!subjectUsesGroundSupport(subject)) continue;
    const placement = executionPlan.subjectInstances.find(
      ({ entityId }) => entityId === subject.entityId,
    );
    if (isNil(placement)) {
      diagnostics.push({
        code: "SPAWN_PLACEMENT_MISSING",
        message: `Ground-controlled Subject '${subject.entityId}' has no Scene placement.`,
      });
      continue;
    }
    const hasVerifiedConstructedSupport = executionPlan.layout.layoutAssertions.some(
      (assertion) =>
        assertion.kind === "supported-by" &&
        assertion.supportedEntityId === placement.spawnAnchorEntityId &&
        assertion.supportingEntityId !== executionPlan.terrain.entityId,
    );
    if (hasVerifiedConstructedSupport) continue;
    const origin = placement.subjectOriginPositionMetersXYZ;
    const centerOffset = subject.collider.centerOffsetFromSubjectOriginMetersXYZ;
    const feetPosition = [
      origin[0] + centerOffset[0],
      origin[1] + centerOffset[1] - subject.collider.heightMeters / 2,
      origin[2] + centerOffset[2],
    ] as const;
    const terrainHeight = sampleTerrainHeight(executionPlan.terrain, [
      feetPosition[0],
      feetPosition[2],
    ]);
    if (!Number.isFinite(terrainHeight)) {
      diagnostics.push({
        code: "SPAWN_HAS_NO_GROUND",
        message: `Ground-controlled Subject '${subject.entityId}' has no finite terrain support beneath its spawn.`,
        instancePath: `/nodes/${subject.entityId}/spawnAnchorEntityId`,
        details: { subjectEntityId: subject.entityId, feetPositionMetersXYZ: feetPosition },
      });
      continue;
    }
    const supportGapMeters = feetPosition[1] - terrainHeight;
    if (Math.abs(supportGapMeters) <= SPAWN_GROUND_TOLERANCE_METERS) continue;
    diagnostics.push({
      code: supportGapMeters < 0 ? "SPAWN_BELOW_GROUND" : "SPAWN_ABOVE_GROUND",
      message: supportGapMeters < 0
        ? `Ground-controlled Subject '${subject.entityId}' starts ${Math.abs(supportGapMeters).toFixed(3)}m below terrain support.`
        : `Ground-controlled Subject '${subject.entityId}' starts ${supportGapMeters.toFixed(3)}m above terrain support and would fall on load.`,
      instancePath: `/nodes/${subject.entityId}/spawnAnchorEntityId`,
      details: {
        subjectEntityId: subject.entityId,
        spawnAnchorEntityId: placement.spawnAnchorEntityId,
        feetPositionMetersXYZ: feetPosition,
        terrainHeightMeters: terrainHeight,
        supportGapMeters,
        toleranceMeters: SPAWN_GROUND_TOLERANCE_METERS,
        requiredSubjectOriginYMeters:
          terrainHeight - centerOffset[1] + subject.collider.heightMeters / 2,
      },
    });
  }
  return diagnostics;
}

function implementationMapDiagnostics(options: {
  sceneId: string;
  draftSource: string;
  authoringId: string;
  visualTargetIds: readonly string[];
  controlledEntityId: string;
  runtimeEntityIds: ReadonlySet<string>;
}): SelfCheckDiagnostic[] {
  let draft: unknown;
  try {
    draft = JSON.parse(options.draftSource);
  } catch (error) {
    return [{ code: "IMPLEMENTATION_MAP_JSON_INVALID", message: error instanceof Error ? error.message : String(error) }];
  }
  const contractDiagnostics = validateSceneBriefImplementationMapDraftV1(draft);
  if (contractDiagnostics.length > 0) return [...contractDiagnostics];
  const implementationMap = draft as SceneBriefImplementationMapDraftV1;
  const diagnostics: SelfCheckDiagnostic[] = [];
  if (implementationMap.sceneId !== options.sceneId) {
    diagnostics.push({
      code: "IMPLEMENTATION_MAP_SCENE_ID_MISMATCH",
      message: "Implementation map sceneId does not match the requested scene.",
      instancePath: "/sceneId",
    });
  }
  if (implementationMap.authoringSpecId !== options.authoringId) {
    diagnostics.push({
      code: "IMPLEMENTATION_MAP_AUTHORING_SPEC_ID_MISMATCH",
      message: "Implementation map authoringSpecId does not match AuthoringSpec.",
      instancePath: "/authoringSpecId",
    });
  }
  const expected = new Set(options.visualTargetIds);
  const seenTargets = new Set<string>();
  const seenEntities = new Set<string>();
  for (const mapping of implementationMap.visualTargetMappings) {
    if (!expected.has(mapping?.visualTargetId) || seenTargets.has(mapping.visualTargetId) ||
        !Array.isArray(mapping?.runtimeEntityIds) || mapping.runtimeEntityIds.length === 0) {
      diagnostics.push({ code: "IMPLEMENTATION_MAP_TARGET_INVALID", message: `Invalid mapping for '${String(mapping?.visualTargetId)}'.` });
      continue;
    }
    seenTargets.add(mapping.visualTargetId);
    for (const entityId of mapping.runtimeEntityIds) {
      if (!options.runtimeEntityIds.has(entityId)) {
        diagnostics.push({ code: "IMPLEMENTATION_MAP_ENTITY_UNKNOWN", message: `Unknown runtime entity '${String(entityId)}'.` });
      }
      if (seenEntities.has(entityId)) {
        diagnostics.push({ code: "IMPLEMENTATION_MAP_ENTITY_DUPLICATE", message: `Runtime entity '${String(entityId)}' is mapped more than once.` });
      }
      seenEntities.add(entityId);
    }
  }
  for (const targetId of expected) {
    if (!seenTargets.has(targetId)) diagnostics.push({ code: "IMPLEMENTATION_MAP_TARGET_MISSING", message: `Visual target '${targetId}' is unmapped.` });
  }
  const primary = implementationMap.visualTargetMappings.find(
    (mapping) => mapping.visualTargetId === options.visualTargetIds[0],
  );
  if (!primary?.runtimeEntityIds?.includes(options.controlledEntityId)) {
    diagnostics.push({ code: "IMPLEMENTATION_MAP_PRIMARY_SUBJECT_INVALID", message: "Primary visual target must map the startup-controlled Subject." });
  }
  return diagnostics;
}

async function writeAtomic(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${stringifyCanonicalJson(value)}\n`, "utf8");
}

export async function runBuilderSelfCheck(options: {
  readonly sceneId: string;
  readonly briefPath: string;
  readonly worldPath: string;
  readonly mapDraftPath: string;
  readonly reportPath: string;
}): Promise<{
  readonly status: "passed" | "failed";
  readonly diagnostics: readonly SelfCheckDiagnostic[];
}> {
  const [briefSource, worldSource, mapDraftSource] = await Promise.all([
    readFile(options.briefPath, "utf8"),
    readFile(options.worldPath, "utf8"),
    readFile(options.mapDraftPath, "utf8"),
  ]);
  const diagnostics: SelfCheckDiagnostic[] = [];
  const brief = parseSceneBriefV1(briefSource);
  if (!brief.ok) {
    diagnostics.push(...brief.diagnostics.map((message) => ({
      code: message.split(":", 1)[0] || "SCENE_BRIEF_INVALID",
      message,
    })));
  }
  const parsed = parseAuthoringSpecV4(worldSource);
  let compiledExecutionPlan: CanonicalSceneExecutionPlanV1 | undefined;
  let compiledWorldRuntimeBootstrap: WorldRuntimeBootstrapV1 | undefined;
  let largeWorldEvidence: BuilderLargeWorldEvidenceV1 | undefined;
  if (!parsed.ok || parsed.value === undefined) {
    diagnostics.push(...parsed.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      instancePath: diagnostic.instancePath,
      details: diagnostic.details,
    })));
  } else {
    if (parsed.value.id !== options.sceneId) {
      diagnostics.push({
        code: "AUTHORING_SPEC_SCENE_ID_MISMATCH",
        message: "AuthoringSpec id must exactly equal the Host-provided scene id.",
        instancePath: "/id",
        details: {
          actualAuthoringSpecId: parsed.value.id,
          expectedSceneId: options.sceneId,
        },
      });
    }
    diagnostics.push(...whiteboxLightingDiagnostics(parsed.value));
    diagnostics.push(...hostedRelationshipAdmissionDiagnostics(parsed.value));
    const normalized = normalizeAuthoringSpecV4(parsed.value);
    if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
      diagnostics.push(...normalized.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        instancePath: diagnostic.instancePath,
        details: diagnostic.details,
      })));
    } else {
      largeWorldEvidence = collectBuilderLargeWorldEvidenceV1(parsed.value);
      diagnostics.push(...largeWorldEvidence.diagnostics);
      const compiled = compileCanonicalWorldV1({
        normalizedWorldIr: normalized.value,
        normalizedWorldIrHash: normalized.normalizedWorldIrHash,
        gameplayBootstrap: gameplayBootstrap(normalized.value),
        worldRuntimeBootstrapRef:
          `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
      });
      if (!compiled.ok) {
        diagnostics.push(...compiled.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          message: diagnostic.message,
          instancePath: diagnostic.instancePath,
          details: diagnostic.details,
        })));
      } else if (compiled.canonicalSceneExecutionPlan === undefined) {
        diagnostics.push({
          code: "COMPILER_EXECUTION_PLAN_MISSING",
          message: "Compiler reported success without an ExecutionPlan.",
        });
      } else {
        compiledExecutionPlan = compiled.canonicalSceneExecutionPlan;
        compiledWorldRuntimeBootstrap = compiled.worldRuntimeBootstrap;
        diagnostics.push(...spawnGroundingDiagnostics(
          compiled.canonicalSceneExecutionPlan,
          compiled.worldRuntimeBootstrap,
        ));
      }
    }
  }
  if (diagnostics.length === 0 && brief.ok && parsed.ok && parsed.value !== undefined && compiledExecutionPlan !== undefined && compiledWorldRuntimeBootstrap !== undefined) {
    diagnostics.push(...implementationMapDiagnostics({
      sceneId: options.sceneId,
      draftSource: mapDraftSource,
      authoringId: parsed.value.id,
      visualTargetIds: brief.value.visualTargets.map(({ id }) => id),
      controlledEntityId:
        compiledWorldRuntimeBootstrap.initialControlledEntityId,
      runtimeEntityIds: new Set([
        ...compiledWorldRuntimeBootstrap.subjectRuntimeDescriptors.map(
          ({ entityId }) => entityId,
        ),
        ...compiledExecutionPlan.objects.map(({ entityId }) => entityId),
      ]),
    }));
  }
  const report = {
    kind: "worldkit-builder-self-check",
    schemaVersion: 1,
    validatorVersion: BUILDER_SELF_CHECK_VERSION,
    sceneId: options.sceneId,
    status: diagnostics.length === 0 ? "passed" : "failed",
    requiresTrustedRouteValidation: parsed.ok &&
      parsed.value !== undefined &&
      parsed.value.constraints.connectivity.length > 0,
    ...(largeWorldEvidence === undefined
      ? {}
      : {
          terrainScaleEvidence: largeWorldEvidence.terrainScaleEvidence,
          routeBuildWindowEvidence: largeWorldEvidence.routeBuildWindowEvidence,
        }),
    inputs: {
      sceneBriefHash: contentHash(briefSource),
      authoringSpecHash: contentHash(worldSource),
      implementationMapDraftHash: contentHash(mapDraftSource),
    },
    diagnostics,
  } as const;
  await writeAtomic(options.reportPath, report);
  return { status: report.status, diagnostics };
}

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
  const result = await runBuilderSelfCheck({
    sceneId: option(arguments_, "--scene-id"),
    briefPath: path.resolve(option(arguments_, "--brief")),
    worldPath: path.resolve(option(arguments_, "--world")),
    mapDraftPath: path.resolve(option(arguments_, "--map-draft")),
    reportPath: path.resolve(option(arguments_, "--report")),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "passed") process.exitCode = 2;
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
