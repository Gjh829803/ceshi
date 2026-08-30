import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseSceneBriefV1,
  stringifyCanonicalJson,
} from "@whitebox-world/authoring";

import { deriveVisualIdentityPalette } from "../scenes/finalize-spatial-build";

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

export async function writeVisualIdentityPalette(options: {
  sceneId: string;
  briefPath: string;
  outputPath: string;
}): Promise<void> {
  const briefResult = parseSceneBriefV1(await readFile(options.briefPath, "utf8"));
  if (!briefResult.ok) {
    throw new Error("Cannot derive a visual identity palette from an invalid Scene Brief.");
  }
  const value = {
    kind: "worldkit-visual-identity-palette",
    schemaVersion: 1,
    sceneId: options.sceneId,
    sceneBriefHash: briefResult.sceneBriefHash,
    movementModes: briefResult.value.movementModes.map(({ mode }) => mode),
    movementModeLabels: briefResult.value.movementModes.map(({ label }) => label),
    targets: deriveVisualIdentityPalette(briefResult.value),
  } as const;
  const outputPath = path.resolve(options.outputPath);
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, `${stringifyCanonicalJson(value)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  writeVisualIdentityPalette({
    sceneId: option(process.argv.slice(2), "--scene-id"),
    briefPath: path.resolve(option(process.argv.slice(2), "--brief")),
    outputPath: path.resolve(option(process.argv.slice(2), "--output")),
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
