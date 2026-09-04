import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseSceneBriefV1,
  sceneBriefRequiresConnectedGroundV1,
  stringifyCanonicalJson,
} from "@whitebox-world/authoring";
import {
  validateCameraTuningV1,
  validateSceneBriefImplementationMapDraftV1,
} from "@whitebox-world/runtime-contracts";
import {
  BLOCK_LANDMARK_PRESET_BY_VISUAL_TARGET_INDEX_V1,
  resolveBlockPresetV1,
  blockWorldChunkCoordinateV2,
  blockBoundsMetersV2,
  type BlockInstanceV2,
} from "@whitebox-world/block-world";
import { compileBlockWorldV2 } from "@whitebox-world/block-world-compiler";

import {
  blockWorldCheckInputV2,
  loadBlockWorldModuleV2,
} from "../lib/block-world-module.js";
import {
  createAgentAuthoringCatalogV2,
  traversalEnvelopeFromRuntimeColliderV1,
} from "../lib/agent-authoring-catalog.js";

export const BLOCK_BUILDER_SELF_CHECK_VERSION = "worldkit-block-builder-self-check-v10";

function standPositionKey(position: readonly [number, number, number]): string {
  return position.join(",");
}

function spatialBlockMetrics(
  blocks: readonly BlockInstanceV2[],
  spawnStandPositionMetersXYZ: readonly [number, number, number],
) {
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  let maximumDistanceMeters = 0;
  const chunks = new Set<string>();
  for (const block of blocks) {
    const { positionMetersXYZ } = block;
    const bounds = blockBoundsMetersV2(block);
    minimumX = Math.min(minimumX, bounds.minimumMetersXYZ[0]);
    maximumX = Math.max(maximumX, bounds.maximumMetersXYZ[0]);
    minimumZ = Math.min(minimumZ, bounds.minimumMetersXYZ[2]);
    maximumZ = Math.max(maximumZ, bounds.maximumMetersXYZ[2]);
    maximumDistanceMeters = Math.max(
      maximumDistanceMeters,
      Math.hypot(
        positionMetersXYZ[0] - spawnStandPositionMetersXYZ[0],
        positionMetersXYZ[2] - spawnStandPositionMetersXYZ[2],
      ),
    );
    const coordinate = blockWorldChunkCoordinateV2(positionMetersXYZ);
    chunks.add(`${coordinate.chunkX},${coordinate.chunkZ}`);
  }
  return {
    maximumHorizontalSpanMeters: blocks.length === 0
      ? 0
      : Math.max(maximumX - minimumX, maximumZ - minimumZ),
    maximumDistanceMeters,
    chunkCount: chunks.size,
  };
}

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

async function writeAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${stringifyCanonicalJson(value)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export async function runBlockBuilderSelfCheck(options: {
  readonly sceneId: string;
  readonly briefPath: string;
  readonly worldModulePath: string;
  readonly authoringOutputPath: string;
  readonly mapDraftOutputPath: string;
  readonly reportPath: string;
}) {
  const [briefSource, worldModuleSource] = await Promise.all([
    readFile(options.briefPath, "utf8"),
    readFile(options.worldModulePath, "utf8"),
  ]);
  const diagnostics: SelfCheckDiagnostic[] = [];
  const brief = parseSceneBriefV1(briefSource);
  if (!brief.ok) {
    diagnostics.push(...brief.diagnostics.map((message) => ({
      code: message.split(":", 1)[0] || "SCENE_BRIEF_INVALID",
      message,
    })));
  }

  const blockWorldInput = brief.ok
    ? blockWorldCheckInputV2(await loadBlockWorldModuleV2(options.worldModulePath))
    : undefined;
  const compiled = blockWorldInput === undefined
    ? undefined
    : compileBlockWorldV2(blockWorldInput);
  if (compiled?.ok === true) {
    await Promise.all([
      writeAtomic(options.authoringOutputPath, compiled.authoringSpec),
      writeAtomic(options.mapDraftOutputPath, compiled.implementationMapDraft),
    ]);
  }
  if (compiled !== undefined && !compiled.ok) {
    diagnostics.push(...compiled.diagnostics.map((row) => ({
      code: row.code,
      message: row.message,
      instancePath: row.instancePath,
      details: row.details,
    })));
  }

  if (brief.ok && compiled?.ok === true) {
    const requestedMovementModes = brief.value.movementModes.map(({ mode }) => mode);
    const subject = blockWorldInput!.controlledSubject;
    const runtimeSubject = compiled.worldRuntimeBootstrap.subjectRuntimeDescriptors.find(
      ({ entityId }) => entityId === subject.entityId,
    );
    if (runtimeSubject === undefined) {
      diagnostics.push({
        code: "BLOCK_WORLD_SUBJECT_RUNTIME_DESCRIPTOR_MISSING",
        message: "The controlled Subject has no compiled Runtime descriptor.",
        instancePath: "/controlledSubject",
      });
    } else {
      const expectedTraversalEnvelope = traversalEnvelopeFromRuntimeColliderV1(
        runtimeSubject.collider,
      );
      const actualTraversalEnvelope = blockWorldInput!.subjectTraversalProfile;
      if (stringifyCanonicalJson(actualTraversalEnvelope) !==
          stringifyCanonicalJson(expectedTraversalEnvelope)) {
        diagnostics.push({
          code: "BLOCK_WORLD_SUBJECT_TRAVERSAL_ENVELOPE_MISMATCH",
          message: "subjectTraversalProfile must exactly equal the Host-derived Runtime Subject collider envelope.",
          instancePath: "/subjectTraversalProfile",
          details: {
            expected: expectedTraversalEnvelope,
            actual: actualTraversalEnvelope,
          },
        });
      }
      const openingCamera = compiled.worldRuntimeBootstrap.initialCamera;
      const openingTuning = {
        distanceMeters: openingCamera.distanceMeters,
        targetHeightMeters: openingCamera.targetHeightMeters,
        pitchRadians: openingCamera.pitchRadians,
        baseFovDegrees: openingCamera.fovDegrees,
      };
      const invalidProfiles = runtimeSubject.capabilityAssembly.cameraContext
        .cameraRigProfiles
        .filter(({ algorithmRef }) =>
          !algorithmRef.endsWith("/socket-first-person@1"))
        .flatMap((profile) => {
          const validation = validateCameraTuningV1(
            { algorithmRef: profile.algorithmRef, parameters: profile.parameters },
            openingTuning,
          );
          return validation.ok
            ? []
            : [{
                cameraRigProfileRef: profile.resourceRef,
                code: validation.code,
                message: validation.message,
              }];
        });
      if (invalidProfiles.length > 0) {
        diagnostics.push({
          code: "BLOCK_WORLD_CAMERA_OPENING_TUNING_INVALID",
          message: "Builder Camera values must be valid Runtime tuning for every selectable third-person Camera Profile of the controlled Subject.",
          instancePath: "/camera",
          details: { openingTuning, invalidProfiles },
        });
      }
    }
    const authoringCatalog = createAgentAuthoringCatalogV2();
    const registeredSubject = subject.kind === "registered"
      ? authoringCatalog.subjectPacks.find(({ subjectDefinitionRef }) =>
          subjectDefinitionRef === subject.subjectDefinitionRef)
      : undefined;
    const assemblyBase = subject.kind === "assembly"
      ? subject.assembly.baseSubject
      : undefined;
    const assemblySubjectPack = assemblyBase?.kind === "subject-pack"
      ? authoringCatalog.subjectPacks.find(({ id }) =>
          id === assemblyBase.subjectPackId)
      : undefined;
    if (subject.kind === "registered" && registeredSubject === undefined) {
      diagnostics.push({
        code: "BLOCK_WORLD_SUBJECT_NOT_HOSTED_AUTHORING_ADMITTED",
        message: "The controlled registered Subject is not admitted for Hosted Builder authoring.",
        instancePath: "/controlledSubject/subjectDefinitionRef",
        details: {
          subjectDefinitionRef: subject.subjectDefinitionRef,
          rejectionDiagnostics: authoringCatalog.unavailableSubjectPacks.find(({ subjectDefinitionRef }) =>
            subjectDefinitionRef === subject.subjectDefinitionRef)?.diagnostics ?? [],
        },
      });
    }
    if (subject.kind === "assembly" &&
        subject.assembly.baseSubject.kind === "subject-pack" &&
        assemblySubjectPack === undefined) {
      diagnostics.push({
        code: "BLOCK_WORLD_SUBJECT_NOT_HOSTED_AUTHORING_ADMITTED",
        message: "The selected base Subject Pack is not admitted for Hosted Builder authoring.",
        instancePath: "/controlledSubject/assembly/baseSubject/subjectPackId",
        details: { subjectPackId: subject.assembly.baseSubject.subjectPackId },
      });
    }
    const selectedMotionPack = subject.kind === "assembly"
      ? authoringCatalog.motionPacks.find(({ id }) =>
          id === subject.assembly.motion.motionPackId)
      : undefined;
    const executableMovementModes = subject.kind === "registered"
      ? registeredSubject === undefined ? [] : ["ground-walk"] as const
      : subject.kind === "assembly"
        ? selectedMotionPack?.movementModes ?? []
        : ["ground-walk"] as const;
    const missingMovementModes = subject.kind === "registered" && registeredSubject === undefined
      ? []
      : requestedMovementModes.filter((mode) =>
          !executableMovementModes.includes(mode));
    if (missingMovementModes.length > 0) {
      diagnostics.push({
        code: "BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED",
        message: "The controlled Subject executable capability closure does not satisfy every Scene Brief movement mode.",
        instancePath: "/controlledSubject",
        details: {
          subjectKind: subject.kind,
          subjectDefinitionRef: subject.kind === "registered"
            ? subject.subjectDefinitionRef
            : null,
          subjectPackId: subject.kind === "assembly" &&
              subject.assembly.baseSubject.kind === "subject-pack"
            ? subject.assembly.baseSubject.subjectPackId
            : null,
          motionPackId: subject.kind === "assembly"
            ? subject.assembly.motion.motionPackId
            : null,
          requestedMovementModes,
          executableMovementModes,
          missingMovementModes,
        },
      });
    }
    const expectedConnectedGround = sceneBriefRequiresConnectedGroundV1(
      brief.value,
    );
    if (blockWorldInput!.requireSingleReachableComponent !== expectedConnectedGround) {
      diagnostics.push({
        code: "BLOCK_WORLD_GROUND_CONNECTIVITY_POLICY_MISMATCH",
        message: expectedConnectedGround
          ? "A ground-only Scene Brief requires one connected reachable ground component."
          : "A Scene Brief with flight, swimming, water-surface, or custom free-space movement must not require one connected ground component.",
        instancePath: "/requireSingleReachableComponent",
        details: {
          expected: expectedConnectedGround,
          actual: blockWorldInput!.requireSingleReachableComponent,
          movementModes: requestedMovementModes,
        },
      });
    }
    if (expectedConnectedGround) {
      const targetsByRole = new Map(
        (["middle", "remote"] as const).map((role) => [
          role,
          blockWorldInput!.requiredTargets.filter((target) =>
            target.navigationRole === role),
        ]),
      );
      for (const role of ["middle", "remote"] as const) {
        if ((targetsByRole.get(role) ?? []).length > 0) continue;
        diagnostics.push({
          code: "BLOCK_WORLD_NAVIGATION_TARGET_ROLE_MISSING",
          message: `A ground-only world requires at least one '${role}' navigation target in a real named exploration region.`,
          instancePath: "/requiredTargets",
          details: { missingNavigationRole: role },
        });
      }
      const middlePositionKeys = new Set(
        (targetsByRole.get("middle") ?? []).map((target) =>
          standPositionKey(target.standPositionMetersXYZ)),
      );
      const spawnKey = standPositionKey(
        blockWorldInput!.spawnStandPositionMetersXYZ,
      );
      const hasEntryTraversalBand = blockWorldInput!.requiredGroundTraversalBands.some(
        (band) => {
          const first = band.centerlineStandPositionsMetersXYZ[0];
          const last = band.centerlineStandPositionsMetersXYZ.at(-1);
          return first !== undefined && last !== undefined &&
            standPositionKey(first) === spawnKey &&
            middlePositionKeys.has(standPositionKey(last));
        },
      );
      if (!hasEntryTraversalBand) {
        diagnostics.push({
          code: "BLOCK_WORLD_ENTRY_TRAVERSAL_BAND_MISSING",
          message: "A ground-only world requires an invisible validation band from spawn through the intended entry movement area to a middle navigation target.",
          instancePath: "/requiredGroundTraversalBands",
        });
      }
    }
    if (compiled.authoringSpec.id !== options.sceneId) {
      diagnostics.push({
        code: "BLOCK_WORLD_SCENE_ID_MISMATCH",
        message: "The Block World module world.id must equal the requested scene ID.",
        instancePath: "/world/id",
        details: { expected: options.sceneId, actual: compiled.authoringSpec.id },
      });
    }
    diagnostics.push(...validateSceneBriefImplementationMapDraftV1(
      compiled.implementationMapDraft,
    ));
    const expectedTargetIds = new Set(brief.value.visualTargets.map(({ id }) => id));
    const mappedTargetIds = new Set(
      compiled.implementationMapDraft.visualTargetMappings.map(({ visualTargetId }) =>
        visualTargetId),
    );
    for (const visualTargetId of expectedTargetIds) {
      if (!mappedTargetIds.has(visualTargetId)) {
        diagnostics.push({
          code: "BLOCK_WORLD_VISUAL_TARGET_MISSING",
          message: `Visual target '${visualTargetId}' has no complete Block World visual group.`,
          instancePath: "/visualTargetMappings",
        });
      }
    }
    for (const visualTargetId of mappedTargetIds) {
      if (!expectedTargetIds.has(visualTargetId)) {
        diagnostics.push({
          code: "BLOCK_WORLD_VISUAL_TARGET_UNKNOWN",
          message: `Block World visual group '${visualTargetId}' is not declared by the Scene Brief.`,
          instancePath: "/visualTargetMappings",
        });
      }
    }
    for (let targetIndex = 1;
      targetIndex < brief.value.visualTargets.length;
      targetIndex += 1) {
      const visualTargetId = brief.value.visualTargets[targetIndex]!.id;
      const expectedPresetRef =
        BLOCK_LANDMARK_PRESET_BY_VISUAL_TARGET_INDEX_V1[targetIndex];
      const groupBlocks = blockWorldInput!.manifest.blocks.filter(
        ({ visualGroupId }) => visualGroupId === visualTargetId,
      );
      const actualLandmarkPresetRefs = [...new Set(
        groupBlocks
          .filter(({ presetRef }) => resolveBlockPresetV1(presetRef)?.family === "landmark")
          .map(({ presetRef }) => presetRef),
      )].sort();
      if (expectedPresetRef === undefined || expectedPresetRef === null ||
          !actualLandmarkPresetRefs.includes(expectedPresetRef) ||
          actualLandmarkPresetRefs.some((presetRef) => presetRef !== expectedPresetRef)) {
        diagnostics.push({
          code: "BLOCK_WORLD_VISUAL_TARGET_COLOR_MISMATCH",
          message: `Visual target '${visualTargetId}' must use its ordered landmark preset '${expectedPresetRef ?? "unavailable"}' and no other landmark preset.`,
          instancePath: "/manifest/blocks",
          details: {
            visualTargetId,
            expectedPresetRef,
            actualLandmarkPresetRefs,
          },
        });
      }
    }
    const primaryTarget = brief.value.visualTargets.find(
      ({ role }) => role === "primary-subject",
    );
    const primaryMapping = compiled.implementationMapDraft.visualTargetMappings.find(
      ({ visualTargetId }) => visualTargetId === primaryTarget?.id,
    );
    if (primaryTarget === undefined ||
        !primaryMapping?.runtimeEntityIds.includes(
          compiled.worldRuntimeBootstrap.initialControlledEntityId,
        )) {
      diagnostics.push({
        code: "BLOCK_WORLD_PRIMARY_SUBJECT_MAPPING_INVALID",
        message: "The primary visual target must map the startup-controlled Subject.",
        instancePath: "/controlledSubject/visualTargetId",
      });
    }
  }

  const report = {
    kind: "worldkit-block-builder-self-check",
    schemaVersion: 1,
    validatorVersion: BLOCK_BUILDER_SELF_CHECK_VERSION,
    sceneId: options.sceneId,
    status: diagnostics.length === 0 ? "passed" : "failed",
    requiresTrustedRouteValidation: false,
    inputs: {
      sceneBriefHash: contentHash(briefSource),
      worldModuleHash: contentHash(worldModuleSource),
      ...(compiled?.ok === true
        ? {
            authoringSpecHash: contentHash(
              `${stringifyCanonicalJson(compiled.authoringSpec)}\n`,
            ),
            implementationMapDraftHash: contentHash(
              `${stringifyCanonicalJson(compiled.implementationMapDraft)}\n`,
            ),
          }
        : {}),
    },
    ...(compiled?.ok === true && blockWorldInput !== undefined
      ? {
          observations: {
            blockWorldMetrics: compiled.checkReport.metrics,
            authoredSpatialMetrics: spatialBlockMetrics(
              blockWorldInput.manifest.blocks,
              blockWorldInput.spawnStandPositionMetersXYZ,
            ),
          },
        }
      : {}),
    diagnostics,
  } as const;
  await writeAtomic(options.reportPath, report);
  return { status: report.status, diagnostics } as const;
}

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
  const result = await runBlockBuilderSelfCheck({
    sceneId: option(arguments_, "--scene-id"),
    briefPath: path.resolve(option(arguments_, "--brief")),
    worldModulePath: path.resolve(option(arguments_, "--world")),
    authoringOutputPath: path.resolve(option(arguments_, "--authoring-output")),
    mapDraftOutputPath: path.resolve(option(arguments_, "--map-draft-output")),
    reportPath: path.resolve(option(arguments_, "--report")),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "passed") process.exitCode = 2;
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
const directEntryBaseName = path.basename(entryPath).replace(/\.(?:mjs|js|ts)$/, "");
if (entryPath === fileURLToPath(import.meta.url) &&
    directEntryBaseName === "agent-block-builder-self-check") {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
