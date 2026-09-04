import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  checkBlockWorldV2,
  type BlockWorldCheckReportV2,
  type CheckBlockWorldInputV2,
} from "@whitebox-world/block-world";
import {
  extractThreeBlockWorldV2,
  installBlockWorldAuthoringGlobalsV1,
  type BuildThreeBlockWorldV2,
  type ExtractThreeBlockWorldResultV2,
  type ThreeBlockWorldAuthoringResultV2,
} from "@whitebox-world/block-world-three";

interface BlockWorldModuleV2 {
  readonly buildBlockWorld?: BuildThreeBlockWorldV2;
}

export interface LoadedBlockWorldModuleV2 {
  readonly authored: ThreeBlockWorldAuthoringResultV2;
  readonly extraction: ExtractThreeBlockWorldResultV2;
  readonly sourceText: string;
}

export function blockWorldCheckInputV2(
  loaded: LoadedBlockWorldModuleV2,
): CheckBlockWorldInputV2 {
  const { authored, extraction } = loaded;
  return {
    manifest: extraction.manifest,
    world: authored.world,
    controlledSubject: authored.controlledSubject,
    camera: authored.camera,
    subjectMeshParts: extraction.subjectMeshParts,
    subjectTraversalProfile: authored.subjectTraversalProfile,
    spawnStandPositionMetersXYZ: authored.spawnStandPositionMetersXYZ,
    requiredTargets: authored.requiredTargets,
    requiredGroundTraversalBands: authored.requiredGroundTraversalBands ?? [],
    visualTargetFacings: authored.visualTargetFacings ?? [],
    spaceTransitions: authored.spaceTransitions ?? [],
    requireSingleReachableComponent: authored.requireSingleReachableComponent,
    sourceDiagnostics: extraction.diagnostics,
  };
}

export async function loadBlockWorldModuleV2(
  modulePath: string,
): Promise<LoadedBlockWorldModuleV2> {
  const absoluteModulePath = path.resolve(modulePath);
  const sourceText = await readFile(absoluteModulePath, "utf8");
  installBlockWorldAuthoringGlobalsV1();
  const sourceHash = createHash("sha256").update(sourceText).digest("hex");
  const imported = await import(
    `${pathToFileURL(absoluteModulePath).href}?worldkit=${sourceHash}`
  ) as BlockWorldModuleV2;
  if (typeof imported.buildBlockWorld !== "function") {
    throw new Error(
      "BLOCK_WORLD_MODULE_INVALID: module must export buildBlockWorld().",
    );
  }
  const authored = await imported.buildBlockWorld();
  const extraction = extractThreeBlockWorldV2(authored.scene);
  return Object.freeze({ authored, extraction, sourceText });
}

export async function checkBlockWorldModuleV2(
  modulePath: string,
): Promise<BlockWorldCheckReportV2> {
  return checkBlockWorldV2(
    blockWorldCheckInputV2(await loadBlockWorldModuleV2(modulePath)),
  );
}
