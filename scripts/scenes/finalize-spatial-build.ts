import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseAuthoringSpecV4,
  parseCanonicalJson,
  parseSceneBriefV1,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type SceneBriefV1,
} from "@whitebox-world/authoring";
import {
  validateSceneBriefImplementationMapDraftV1,
  validateSceneBriefImplementationMapV1,
  type HostedVisualContractDiagnosticV1,
  type SceneBriefImplementationMapDraftV1,
  type SceneBriefImplementationMapV1,
  type VisualCaptureGroupV1,
} from "@whitebox-world/runtime-contracts";

import { loadWorldkitRoutePipeline } from "../lib/worldkit-pipeline";

function formatHostedDiagnostic(diagnostic: HostedVisualContractDiagnosticV1): string {
  const location = diagnostic.instancePath ? ` at ${diagnostic.instancePath}` : "";
  return `${diagnostic.code}${location}: ${diagnostic.message}`;
}

export const VISUAL_IDENTITY_COLORS = [
  "#E85D5D",
  "#F28E2B",
  "#8E6CCF",
  "#D45087",
  "#D6B84C",
] as const;

export interface VisualIdentityPaletteTargetV1 {
  id: string;
  visualTargetId: string;
  targetKind: SceneBriefV1["visualTargets"][number]["kind"];
  name: string;
  description: string;
  role: VisualCaptureGroupV1["role"];
  semanticClassId: string;
  identityColor: `#${string}`;
}

export function deriveVisualIdentityPalette(
  brief: SceneBriefV1,
): readonly VisualIdentityPaletteTargetV1[] {
  return brief.visualTargets.map((target, index) => ({
    id: target.id,
    visualTargetId: target.id,
    targetKind: target.kind,
    name: target.name,
    description: target.description,
    role: target.role,
    semanticClassId: target.semanticClassId,
    identityColor: VISUAL_IDENTITY_COLORS[index]!,
  }));
}

export function deriveVisualCaptureGroups(options: {
  brief: SceneBriefV1;
  visualTargetMappings: SceneBriefImplementationMapDraftV1["visualTargetMappings"];
}): readonly VisualCaptureGroupV1[] {
  const mappingByVisualTargetId = new Map(
    options.visualTargetMappings.map((mapping) => [mapping.visualTargetId, mapping] as const),
  );
  return deriveVisualIdentityPalette(options.brief).flatMap((target) => {
    const mapping = mappingByVisualTargetId.get(target.visualTargetId);
    return mapping === undefined
      ? []
      : [{
          visualTargetId: target.visualTargetId,
          runtimeEntityIds: [...mapping.runtimeEntityIds],
          role: target.role,
          semanticClassId: target.semanticClassId,
          identityColor: target.identityColor,
        }];
  });
}

export async function finalizeSceneBuild(options: {
  sceneId: string;
  briefPath: string;
  worldPath: string;
  mapDraftPath: string;
}): Promise<SceneBriefImplementationMapV1> {
  const [briefText, worldText, draftText] = await Promise.all([
    readFile(options.briefPath, "utf8"),
    readFile(options.worldPath, "utf8"),
    readFile(options.mapDraftPath, "utf8"),
  ]);
  const briefResult = parseSceneBriefV1(briefText);
  if (!briefResult.ok) {
    throw new Error(`Scene Brief is invalid: ${briefResult.diagnostics.join(", ")}`);
  }
  const worldResult = parseAuthoringSpecV4(worldText);
  if (!worldResult.ok || worldResult.value === undefined) {
    throw new Error(`AuthoringSpec is invalid: ${worldResult.diagnostics.map(({ code }) => code).join(", ")}`);
  }
  const draftResult = parseCanonicalJson(draftText);
  if (!draftResult.ok || draftResult.value === undefined) {
    throw new Error(`Implementation map draft is invalid JSON: ${draftResult.diagnostics.map(({ code }) => code).join(", ")}`);
  }
  const draftDiagnostics = validateSceneBriefImplementationMapDraftV1(draftResult.value);
  if (draftDiagnostics.length > 0) {
    throw new Error(draftDiagnostics.map(formatHostedDiagnostic).join("\n"));
  }
  const draft = draftResult.value as SceneBriefImplementationMapDraftV1;
  const pipeline = await loadWorldkitRoutePipeline(options.worldPath);
  if (!pipeline.ok) {
    throw new Error(`AuthoringSpec does not compile: ${pipeline.diagnostics.map(({ code }) => code).join(", ")}`);
  }
  const value: SceneBriefImplementationMapV1 = {
    kind: "worldkit-scene-brief-implementation-map",
    schemaVersion: draft.schemaVersion,
    sceneId: draft.sceneId,
    sceneBriefHash: briefResult.sceneBriefHash,
    authoringSpecId: draft.authoringSpecId,
    authoringSpecHash: sha256CanonicalJson(worldResult.value) as `sha256:${string}`,
    visualTargetMappings: draft.visualTargetMappings,
    visualCaptureGroups: deriveVisualCaptureGroups({
      brief: briefResult.value,
      visualTargetMappings: draft.visualTargetMappings,
    }),
  };
  const errors = validateSceneBriefImplementationMapV1(value).map(formatHostedDiagnostic);
  if (value.sceneId !== options.sceneId) errors.push("Implementation map sceneId does not match the requested scene.");
  if (value.authoringSpecId !== worldResult.value.id) errors.push("Implementation map authoringSpecId does not match AuthoringSpec.");
  const primaryVisualGroup = value.visualCaptureGroups.find(
    ({ role }) => role === "primary-subject",
  );
  if (!primaryVisualGroup?.runtimeEntityIds.includes(
    pipeline.worldRuntimeBootstrap.initialControlledEntityId,
  )) {
    errors.push("The primary subject visual group must contain the startup-controlled Subject.");
  }
  const selectedVisualTargets = deriveVisualIdentityPalette(briefResult.value);
  const mappedVisualTargetIds = new Set(value.visualCaptureGroups.map(({ visualTargetId }) => visualTargetId));
  for (const target of selectedVisualTargets) {
    if (!mappedVisualTargetIds.has(target.visualTargetId)) {
      errors.push(`Selected visual target '${target.visualTargetId}' must have a complete implementation mapping.`);
    }
  }

  const targetIds = new Set(selectedVisualTargets.map(({ visualTargetId }) => visualTargetId));
  const unmappedTargetIds = new Set(targetIds);
  const runtimeEntityIds = new Set([
    ...pipeline.worldRuntimeBootstrap.subjectRuntimeDescriptors.map(
      ({ entityId }) => entityId,
    ),
    ...pipeline.executionPlan.objects.map(({ entityId }) => entityId),
  ]);
  const mappedRuntimeEntityIds = new Set<string>();
  for (const mapping of value.visualTargetMappings) {
    if (!targetIds.has(mapping.visualTargetId)) {
      errors.push(`Unknown Scene Brief visual target '${mapping.visualTargetId}'.`);
    }
    unmappedTargetIds.delete(mapping.visualTargetId);
    for (const entityId of mapping.runtimeEntityIds) {
      if (!runtimeEntityIds.has(entityId)) errors.push(`Unknown runtime entity '${entityId}'.`);
      if (mappedRuntimeEntityIds.has(entityId)) errors.push(`Runtime entity '${entityId}' is mapped more than once.`);
      mappedRuntimeEntityIds.add(entityId);
    }
  }
  if (unmappedTargetIds.size > 0) {
    errors.push(`Scene Brief visual targets are unmapped: ${[...unmappedTargetIds].sort().join(", ")}.`);
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return value;
}

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
  const outputPath = path.resolve(option(arguments_, "--output"));
  const value = await finalizeSceneBuild({
    sceneId: option(arguments_, "--scene-id"),
    briefPath: option(arguments_, "--brief"),
    worldPath: option(arguments_, "--world"),
    mapDraftPath: option(arguments_, "--map-draft"),
  });
  const { mkdir, rename, writeFile } = await import("node:fs/promises");
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${stringifyCanonicalJson(value)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  process.stdout.write(`${outputPath}\n`);
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
