import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseAuthoringSpecV4,
  parseSceneBriefV1,
} from "@whitebox-world/authoring";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  parseSceneAuthoringAttemptResultV1,
  parseSceneAuthoringAttemptV1,
  parseSceneAuthoringRouteDecisionV1,
  type SceneAuthoringAttemptResultV1,
  type SceneAuthoringAttemptV1,
  type SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";

const HOSTED_CANONICAL_TRUST_PROFILE_V1 = Object.freeze({
  kind: "worldkit-scene-authoring-trust-profile",
  schemaVersion: 1,
  id: "hosted-canonical",
  lane: "canonical",
  authoringInputTrust: "untrusted",
  publicationOwner: "trusted-host",
  nativeProductionAdmission: "rejected",
});

const HOSTED_CANONICAL_TRUST_PROFILE_REF =
  "worldkit://trust-profile/hosted-canonical@1";
const HOSTED_CANONICAL_AUTHORING_PROFILE_REF =
  "worldkit://authoring-profile/canonical-outdoor@1";

function validateIdentityPart(value: string, name: string): string {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`${name} must be a lowercase resource identity part.`);
  }
  return value;
}

async function readCanonicalAuthoringSpec(filePath: string): Promise<{
  id: string;
  seed: number;
  hash: Sha256HashV1;
}> {
  const result = parseAuthoringSpecV4(await readFile(filePath, "utf8"));
  if (!result.ok || result.value === undefined) {
    throw new Error(
      `SCENE_AUTHORING_INPUT_INVALID: ${result.diagnostics.map(({ code }) => code).join(", ")}`,
    );
  }
  return {
    id: result.value.id,
    seed: result.value.seed,
    hash: sha256CanonicalJson(result.value) as Sha256HashV1,
  };
}

async function writeCanonicalJsonAtomic(
  outputPath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${stringifyCanonicalJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, outputPath);
}

export async function beginHostedCanonicalSceneAuthoringAttemptV1(options: {
  sceneId: string;
  runId: string;
  sceneBriefPath: string;
  authoringInputPath: string;
  routeDecisionOutputPath: string;
  attemptOutputPath: string;
}): Promise<{
  routeDecision: SceneAuthoringRouteDecisionV1;
  attempt: SceneAuthoringAttemptV1;
}> {
  const sceneId = validateIdentityPart(options.sceneId, "sceneId");
  const runId = validateIdentityPart(options.runId, "runId");
  const [briefText, authoringInput] = await Promise.all([
    readFile(options.sceneBriefPath, "utf8"),
    readCanonicalAuthoringSpec(options.authoringInputPath),
  ]);
  const brief = parseSceneBriefV1(briefText);
  if (!brief.ok) {
    throw new Error(`SCENE_AUTHORING_BRIEF_INVALID: ${brief.diagnostics.join(", ")}`);
  }
  if (authoringInput.id !== sceneId) {
    throw new Error("SCENE_AUTHORING_INPUT_SCENE_ID_MISMATCH");
  }
  const sceneBriefRef = `worldkit://scene-brief/${sceneId}@1`;
  const routeDecisionRef =
    `worldkit://scene-authoring-route-decision/${sceneId}/${runId}@1`;
  const routeDecision = parseSceneAuthoringRouteDecisionV1({
    kind: "scene-authoring-route-decision",
    schemaVersion: 1,
    id: `route-${sceneId}-${runId}`,
    sceneBriefRef,
    sceneBriefHash: brief.sceneBriefHash,
    trustProfileRef: HOSTED_CANONICAL_TRUST_PROFILE_REF,
    trustProfileHash: sha256CanonicalJson(
      HOSTED_CANONICAL_TRUST_PROFILE_V1,
    ),
    requiredCapabilityRefs: [
      "worldkit://capability/canonical-authoring@1",
      "worldkit://capability/trusted-host-publication@1",
    ],
    decision: {
      kind: "canonical",
      authoringProfileRef: HOSTED_CANONICAL_AUTHORING_PROFILE_REF,
      reasonCodes: ["canonical-default"],
    },
  });
  const attempt = parseSceneAuthoringAttemptV1({
    kind: "scene-authoring-attempt",
    schemaVersion: 1,
    id: `attempt-${sceneId}-${runId}`,
    sceneAuthoringRouteDecisionRef: routeDecisionRef,
    sceneAuthoringRouteDecisionHash:
      hashSceneAuthoringRouteDecisionV1(routeDecision),
    sceneBriefRef,
    sceneBriefHash: brief.sceneBriefHash,
    sourceInput: {
      kind: "canonical",
      authoringInputRef: `worldkit://authoring-input/${sceneId}/${runId}@1`,
      authoringInputHash: authoringInput.hash,
    },
    selectedAssetResources: [],
    seed: authoringInput.seed,
    authoringProfileRef: HOSTED_CANONICAL_AUTHORING_PROFILE_REF,
    acceptanceTargetRefs: [
      "worldkit://acceptance-target/opening-frame@1",
      "worldkit://acceptance-target/playable-world@1",
    ],
    requiredEvidenceProfileRefs: [
      "worldkit://evidence-profile/runtime-snapshot@1",
      "worldkit://evidence-profile/whitebox-triview@1",
    ],
  });
  // Publish the dependency first so an interrupted run can never expose an
  // Attempt whose referenced Route Decision is absent.
  await writeCanonicalJsonAtomic(options.routeDecisionOutputPath, routeDecision);
  await writeCanonicalJsonAtomic(options.attemptOutputPath, attempt);
  return { routeDecision, attempt };
}

async function readAttempt(
  attemptPath: string,
  sceneId: string,
  runId: string,
): Promise<SceneAuthoringAttemptV1> {
  const attempt = parseSceneAuthoringAttemptV1(
    JSON.parse(await readFile(attemptPath, "utf8")),
  );
  if (attempt.id !== `attempt-${sceneId}-${runId}`) {
    throw new Error("SCENE_AUTHORING_ATTEMPT_IDENTITY_MISMATCH");
  }
  return attempt;
}

export async function completeHostedCanonicalSceneAuthoringAttemptV1(options: {
  sceneId: string;
  runId: string;
  attemptPath: string;
  authoredSourcePath: string;
  evidenceRefs: readonly string[];
  resultOutputPath: string;
}): Promise<SceneAuthoringAttemptResultV1> {
  const sceneId = validateIdentityPart(options.sceneId, "sceneId");
  const runId = validateIdentityPart(options.runId, "runId");
  const [attempt, authoredSource] = await Promise.all([
    readAttempt(options.attemptPath, sceneId, runId),
    readCanonicalAuthoringSpec(options.authoredSourcePath),
  ]);
  if (authoredSource.id !== sceneId) {
    throw new Error("SCENE_AUTHORING_SOURCE_SCENE_ID_MISMATCH");
  }
  const result = parseSceneAuthoringAttemptResultV1({
    kind: "scene-authoring-attempt-result",
    schemaVersion: 1,
    id: `attempt-result-${sceneId}-${runId}`,
    sceneAuthoringAttemptRef:
      `worldkit://scene-authoring-attempt/${sceneId}/${runId}@1`,
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(attempt),
    outcome: "completed",
    authoredSourceRef:
      `worldkit://canonical-authoring-source/${sceneId}/${runId}@1`,
    authoredSourceHash: authoredSource.hash,
    evidenceRefs: [...options.evidenceRefs],
  });
  await writeCanonicalJsonAtomic(options.resultOutputPath, result);
  return result;
}

export async function rejectHostedCanonicalSceneAuthoringAttemptV1(options: {
  sceneId: string;
  runId: string;
  attemptPath: string;
  outcome: "rejected" | "tool-error";
  diagnosticRefs: readonly string[];
  resultOutputPath: string;
}): Promise<SceneAuthoringAttemptResultV1> {
  const sceneId = validateIdentityPart(options.sceneId, "sceneId");
  const runId = validateIdentityPart(options.runId, "runId");
  const attempt = await readAttempt(options.attemptPath, sceneId, runId);
  const result = parseSceneAuthoringAttemptResultV1({
    kind: "scene-authoring-attempt-result",
    schemaVersion: 1,
    id: `attempt-result-${sceneId}-${runId}`,
    sceneAuthoringAttemptRef:
      `worldkit://scene-authoring-attempt/${sceneId}/${runId}@1`,
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(attempt),
    outcome: options.outcome,
    diagnosticRefs: [...options.diagnosticRefs],
  });
  await writeCanonicalJsonAtomic(options.resultOutputPath, result);
  return result;
}

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function options(arguments_: readonly string[], name: string): readonly string[] {
  return arguments_.flatMap((value, index) =>
    value === name && arguments_[index + 1] !== undefined
      ? [arguments_[index + 1]!]
      : [],
  );
}

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const action = arguments_[0];
  const sceneId = option(arguments_, "--scene-id");
  const runId = option(arguments_, "--run-id");
  if (action === "begin") {
    await beginHostedCanonicalSceneAuthoringAttemptV1({
      sceneId,
      runId,
      sceneBriefPath: option(arguments_, "--brief"),
      authoringInputPath: option(arguments_, "--authoring-input"),
      routeDecisionOutputPath: option(arguments_, "--route-decision-output"),
      attemptOutputPath: option(arguments_, "--attempt-output"),
    });
  } else if (action === "complete") {
    await completeHostedCanonicalSceneAuthoringAttemptV1({
      sceneId,
      runId,
      attemptPath: option(arguments_, "--attempt"),
      authoredSourcePath: option(arguments_, "--authored-source"),
      evidenceRefs: options(arguments_, "--evidence-ref"),
      resultOutputPath: option(arguments_, "--result-output"),
    });
  } else if (action === "reject") {
    const outcome = option(arguments_, "--outcome");
    if (outcome !== "rejected" && outcome !== "tool-error") {
      throw new Error("--outcome must be rejected or tool-error.");
    }
    await rejectHostedCanonicalSceneAuthoringAttemptV1({
      sceneId,
      runId,
      attemptPath: option(arguments_, "--attempt"),
      outcome,
      diagnosticRefs: options(arguments_, "--diagnostic-ref"),
      resultOutputPath: option(arguments_, "--result-output"),
    });
  } else {
    throw new Error("Action must be begin, complete, or reject.");
  }
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
