import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  decideSceneAuthoringRouteV1,
  hashNativeBlockGenerationRequestV1,
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  type NativeBlockGenerationBudgetV1,
  type NativeBlockGenerationRequestV1,
  type SceneAuthoringAttemptV1,
  type SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import { sha256Bytes, sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";

const OUTPUTS = ["scene.ts", "native-block-authoring.json", "native-resources.json"] as const;

export interface PrepareNativeBlockGenerationTaskV1Input {
  readonly case: Readonly<{
    id: string;
    sceneBriefRef: string;
    sceneBriefHash: Sha256HashV1;
    referenceInputs: readonly Readonly<{ inputRef: string; contentHash: Sha256HashV1; mediaType: "image/png" | "image/jpeg"; }>[];
    evaluationProfileRef: string;
    evaluationProfileHash: Sha256HashV1;
    acceptanceTargetRefs: readonly string[];
    requiredEvidenceProfileRefs: readonly string[];
  }>;
  readonly profile: Readonly<{ id: string; maximumRepairAttemptCount: 1; builderSelfRepairAttemptCount: 0 }>;
  readonly routeDecision: SceneAuthoringRouteDecisionV1;
  readonly attemptIndex: 0 | 1 | number;
  readonly backend: "cloud" | "local";
  readonly runDirectoryPath: string;
  readonly inputDirectoryPath: string;
  readonly taskInstructionPath: string;
  readonly builderSkillPath: string;
  readonly nativeSceneApiPath: string;
  readonly nativeSceneProfilePath: string;
  readonly blockProfilePath: string;
  readonly bootstrapInputPath: string;
  readonly seed: number;
  readonly budgets: NativeBlockGenerationBudgetV1;
}

export interface PreparedNativeBlockGenerationTaskV1 {
  readonly generationRequest: NativeBlockGenerationRequestV1;
  readonly generationRequestHash: Sha256HashV1;
  readonly attempt: SceneAuthoringAttemptV1;
  readonly attemptHash: Sha256HashV1;
  readonly routerRequestId: string;
  readonly routerTaskPayloadHash: Sha256HashV1;
  readonly backend: "cloud" | "local";
  readonly routerExecutablePath: string;
  readonly routerArguments: readonly string[];
  readonly runDirectoryPath: string;
  readonly taskWorkspacePath: string;
  readonly stagingDirectoryPath: string;
  readonly sourceDirectoryPath: string;
}

interface FrozenFileV1 { readonly relativePath: string; readonly bytes: Uint8Array; readonly hash: Sha256HashV1; }

function within(root: string, candidate: string): string {
  const relativePath = path.relative(root, candidate);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new TypeError(`Generation input is outside its declared root: ${candidate}`);
  }
  return relativePath.split(path.sep).join("/");
}

async function freezeFile(root: string, candidate: string): Promise<FrozenFileV1> {
  const relativePath = within(root, candidate);
  const metadata = await lstat(candidate);
  if (metadata.isSymbolicLink()) throw new TypeError(`Generation input must not be a symbolic link: ${relativePath}`);
  if (!metadata.isFile()) throw new TypeError(`Generation input must be a regular file: ${relativePath}`);
  const bytes = await readFile(candidate);
  const after = await lstat(candidate);
  if (after.isSymbolicLink() || !after.isFile() || after.size !== metadata.size) {
    throw new TypeError(`Generation input changed while being frozen: ${relativePath}`);
  }
  return { relativePath, bytes, hash: sha256Bytes(bytes) as Sha256HashV1 };
}

async function copyFrozenFile(taskWorkspacePath: string, file: FrozenFileV1): Promise<void> {
  const destination = path.join(taskWorkspacePath, "inputs", file.relativePath);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  // The copied content comes from the byte snapshot, never a second read of the mutable input.
  await writeFile(destination, file.bytes, { mode: 0o600 });
}

function asRef(relativePath: string): string { return `inputs/${relativePath}`; }

export async function prepareNativeBlockGenerationTaskV1(
  input: PrepareNativeBlockGenerationTaskV1Input,
): Promise<PreparedNativeBlockGenerationTaskV1> {
  if (input.attemptIndex !== 0 && input.attemptIndex !== 1) throw new TypeError("Native generation supports only initial attempt 0 or repair attempt 1.");
  const routeDecision = decideSceneAuthoringRouteV1({
    id: input.routeDecision.id,
    sceneBriefRef: input.routeDecision.sceneBriefRef,
    sceneBriefHash: input.routeDecision.sceneBriefHash,
    trustProfileRef: input.routeDecision.trustProfileRef,
    trustProfileHash: input.routeDecision.trustProfileHash,
    requiredCapabilityRefs: input.routeDecision.requiredCapabilityRefs,
    requestedSourceKind: input.routeDecision.decision.kind === "babylon-native" ? "babylon-native" : "canonical",
    nativeTrustAdmitted: input.routeDecision.decision.kind === "babylon-native",
    referenceDrivenDistinctiveSilhouette: input.routeDecision.decision.kind === "babylon-native",
  });
  if (routeDecision.decision.kind !== "babylon-native" || input.routeDecision.decision.kind !== "babylon-native") {
    throw new TypeError("Native generation requires an admitted Babylon Native route decision.");
  }
  const inputRoot = path.resolve(input.inputDirectoryPath);
  const runDirectoryPath = path.resolve(input.runDirectoryPath);
  const caseRootPath = path.resolve(inputRoot, "..");
  const runRelativePath = path.relative(caseRootPath, runDirectoryPath);
  if (!runRelativePath || runRelativePath.startsWith("..") || path.isAbsolute(runRelativePath)) {
    throw new TypeError("Generation run directory must remain inside the Case root.");
  }
  const [sceneBrief, taskInstruction, builderSkill, nativeSceneApi, nativeSceneProfile, blockProfile, bootstrap, ...references] = await Promise.all([
    freezeFile(inputRoot, path.resolve(inputRoot, input.case.sceneBriefRef)),
    freezeFile(inputRoot, input.taskInstructionPath),
    freezeFile(inputRoot, input.builderSkillPath),
    freezeFile(inputRoot, input.nativeSceneApiPath),
    freezeFile(inputRoot, input.nativeSceneProfilePath),
    freezeFile(inputRoot, input.blockProfilePath),
    freezeFile(inputRoot, input.bootstrapInputPath),
    ...input.case.referenceInputs.map((reference) => freezeFile(inputRoot, path.resolve(inputRoot, reference.inputRef))),
  ]);
  if (sceneBrief.hash !== input.case.sceneBriefHash) throw new TypeError("Frozen Scene Brief bytes do not match the Case hash.");
  for (let index = 0; index < references.length; index += 1) {
    if (references[index]!.hash !== input.case.referenceInputs[index]!.contentHash) throw new TypeError("Frozen reference bytes do not match the Case hash.");
  }
  const files = [sceneBrief, taskInstruction, builderSkill, nativeSceneApi, nativeSceneProfile, blockProfile, bootstrap, ...references];
  const taskWorkspacePath = path.join(runDirectoryPath, "attempts", String(input.attemptIndex), ".task");
  const stagingDirectoryPath = path.join(runDirectoryPath, "attempts", String(input.attemptIndex), ".staging");
  const sourceDirectoryPath = path.join(runDirectoryPath, "attempts", String(input.attemptIndex), "source");
  await mkdir(taskWorkspacePath, { recursive: true, mode: 0o700 });
  await Promise.all(files.map((file) => copyFrozenFile(taskWorkspacePath, file)));
  const contextInputs = [nativeSceneApi, nativeSceneProfile, blockProfile, bootstrap]
    .map((file) => ({ inputRef: asRef(file.relativePath), contentHash: file.hash }))
    .sort((left, right) => left.inputRef.localeCompare(right.inputRef));
  const workspaceContextManifest = { kind: "native-block-generation-context", schemaVersion: 1, inputs: contextInputs };
  const workspaceContextManifestHash = sha256CanonicalJson(workspaceContextManifest) as Sha256HashV1;
  const routeDecisionHash = hashSceneAuthoringRouteDecisionV1(input.routeDecision);
  const generationRequest: NativeBlockGenerationRequestV1 = {
    kind: "native-block-generation-request", schemaVersion: 1,
    id: `${input.case.id}.attempt-${input.attemptIndex}`,
    routeDecisionRef: `worldkit://scene-authoring-route-decision/${input.routeDecision.id}@1`, routeDecisionHash,
    sceneBriefRef: input.case.sceneBriefRef, sceneBriefHash: input.case.sceneBriefHash,
    referenceInputs: input.case.referenceInputs.map((reference) => ({ ...reference })),
    codexExecutionProfileRef: "worldkit://codex-execution-profile/formal@1",
    codexExecutionProfileHash: sha256CanonicalJson({ resourceRef: "worldkit://codex-execution-profile/formal@1", model: "gpt-5.6-sol", reasoningEffort: "xhigh" }) as Sha256HashV1,
    taskInstructionRef: asRef(taskInstruction.relativePath), taskInstructionHash: taskInstruction.hash,
    builderSkillRef: asRef(builderSkill.relativePath), builderSkillHash: builderSkill.hash,
    workspaceContextManifestRef: "workspace-context-manifest.json", workspaceContextManifestHash,
    contextInputs, nativeSceneApiRef: asRef(nativeSceneApi.relativePath), nativeSceneApiHash: nativeSceneApi.hash,
    nativeSceneProfileRef: asRef(nativeSceneProfile.relativePath), nativeSceneProfileHash: nativeSceneProfile.hash,
    blockProfileRef: asRef(blockProfile.relativePath), blockProfileHash: blockProfile.hash,
    bootstrapInputRef: asRef(bootstrap.relativePath), bootstrapInputHash: bootstrap.hash,
    seed: input.seed, budgets: input.budgets, declaredOutputPaths: OUTPUTS,
  };
  const generationRequestHash = hashNativeBlockGenerationRequestV1(generationRequest);
  const attempt: SceneAuthoringAttemptV1 = {
    kind: "scene-authoring-attempt", schemaVersion: 1, id: `${input.case.id}-attempt-${input.attemptIndex}`,
    sceneAuthoringRouteDecisionRef: generationRequest.routeDecisionRef, sceneAuthoringRouteDecisionHash: routeDecisionHash,
    sceneBriefRef: generationRequest.sceneBriefRef, sceneBriefHash: generationRequest.sceneBriefHash,
    sourceInput: { kind: "babylon-native", bootstrapInputRef: generationRequest.bootstrapInputRef, bootstrapInputHash: generationRequest.bootstrapInputHash, generationRequestRef: `generation-request.json`, generationRequestHash },
    selectedAssetResources: [], seed: input.seed, authoringProfileRef: routeDecision.decision.authoringProfileRef,
    acceptanceTargetRefs: input.case.acceptanceTargetRefs, requiredEvidenceProfileRefs: input.case.requiredEvidenceProfileRefs,
  };
  const routerRequestId = `native-block-generation-${input.case.id}-attempt-${input.attemptIndex}`;
  const routerArguments = [
    "--backend", input.backend, "--repo-root", ".", "--task-id", routerRequestId,
    "--stage", "native-block-generation", "--job-name", `Native Block Generation ${input.case.id}`,
    "--request-id", routerRequestId, "--execution-profile", "formal", "--submit-attempts", "1",
    "--timeout-seconds", String(generationRequest.budgets.timeoutSeconds),
    "--instruction-file", `attempts/${input.attemptIndex}/.task/inputs/${taskInstruction.relativePath}`,
    "--context", `attempts/${input.attemptIndex}/.task/inputs`,
    ...references.flatMap((reference, index) => ["--asset", `reference-${index}::attempts/${input.attemptIndex}/.task/inputs/${reference.relativePath}::file::${input.case.referenceInputs[index]!.mediaType}`]),
    "--output", `scene.ts::attempts/${input.attemptIndex}/.staging/scene.ts::text/typescript`,
    "--output", `native-block-authoring.json::attempts/${input.attemptIndex}/.staging/native-block-authoring.json::application/json`,
    "--output", `native-resources.json::attempts/${input.attemptIndex}/.staging/native-resources.json::application/json`,
    ...(input.backend === "cloud" ? ["--output-s3-prefix", `${input.case.id}/${path.basename(runDirectoryPath)}/attempt-${input.attemptIndex}`] : []),
  ];
  const routerTaskPayloadHash = sha256CanonicalJson({ request: generationRequest, routerRequestId, routerArguments }) as Sha256HashV1;
  return Object.freeze({ generationRequest, generationRequestHash, attempt, attemptHash: hashSceneAuthoringAttemptV1(attempt), routerRequestId, routerTaskPayloadHash, backend: input.backend, routerExecutablePath: path.resolve("scripts/agents/run-codex-task.mjs"), routerArguments: Object.freeze(routerArguments), runDirectoryPath, taskWorkspacePath, stagingDirectoryPath, sourceDirectoryPath });
}
