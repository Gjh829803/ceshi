import {
  decideSceneAuthoringRouteV1,
  parseWorldGenerationSceneSourceKindV1,
  type SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const IDENTITY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const HOST_TRUST_PROFILE_REF =
  "worldkit://trust-profile/world-generation-host@1";
const HOST_TRUST_PROFILE_HASH = sha256CanonicalJson({
  kind: "worldkit-scene-authoring-trust-profile",
  schemaVersion: 1,
  id: "world-generation-host",
  publicationOwner: "trusted-host",
  nativeProductionAdmission: "admitted",
}) as Sha256HashV1;

export function createHostedCanonicalWorldGenerationRouteDecisionV1(input: Readonly<{
  sceneId: string;
  runId: string;
  sceneBriefHash: Sha256HashV1;
  requiredCapabilityRefs?: readonly string[];
}>): SceneAuthoringRouteDecisionV1 {
  if (!IDENTITY_PATTERN.test(input.sceneId) ||
    !IDENTITY_PATTERN.test(input.runId)) {
    throw new TypeError("WORLD_GENERATION_ROUTE_IDENTITY_INVALID");
  }
  return decideSceneAuthoringRouteV1({
    id: `route-${input.sceneId}-${input.runId}`,
    sceneBriefRef: `worldkit://scene-brief/${input.sceneId}@1`,
    sceneBriefHash: input.sceneBriefHash,
    trustProfileRef: HOST_TRUST_PROFILE_REF,
    trustProfileHash: HOST_TRUST_PROFILE_HASH,
    requiredCapabilityRefs: input.requiredCapabilityRefs ?? [],
    requestedSourceKind: "canonical",
    nativeTrustAdmitted: true,
    referenceDrivenDistinctiveSilhouette: false,
  });
}

export async function writeHostedCanonicalWorldGenerationRouteDecisionV1(input: Readonly<{
  sceneId: string;
  runId: string;
  sceneBriefPath: string;
  outputPath: string;
}>): Promise<SceneAuthoringRouteDecisionV1> {
  const brief = parseSceneBriefV1(await readFile(input.sceneBriefPath, "utf8"));
  if (!brief.ok) throw new TypeError("WORLD_GENERATION_ROUTE_BRIEF_INVALID");
  const route = createHostedCanonicalWorldGenerationRouteDecisionV1({
    sceneId: input.sceneId,
    runId: input.runId,
    sceneBriefHash: brief.sceneBriefHash,
  });
  await mkdir(path.dirname(input.outputPath), { recursive: true });
  const temporaryPath = `${input.outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${stringifyCanonicalJson(route)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, input.outputPath);
  return route;
}

function requiredOption(tokens: readonly string[], name: string): string {
  const index = tokens.indexOf(name);
  const value = index < 0 ? undefined : tokens[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new TypeError("WORLD_GENERATION_ROUTE_ARGUMENTS_INVALID");
  }
  return value;
}

async function main(): Promise<void> {
  const tokens = process.argv.slice(2);
  const source = parseWorldGenerationSceneSourceKindV1(
    requiredOption(tokens, "--scene-source"),
  );
  if (source !== "canonical") {
    throw new TypeError("WORLD_GENERATION_ROUTE_SOURCE_OWNER_INVALID");
  }
  await writeHostedCanonicalWorldGenerationRouteDecisionV1({
    sceneId: requiredOption(tokens, "--scene-id"),
    runId: requiredOption(tokens, "--run-id"),
    sceneBriefPath: path.resolve(requiredOption(tokens, "--brief")),
    outputPath: path.resolve(requiredOption(tokens, "--output")),
  });
}

if (process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  });
}
