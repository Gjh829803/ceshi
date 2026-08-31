import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { decideSceneAuthoringRouteV1 } from "@whitebox-world/scene-authoring-contracts";
import { sha256CanonicalJson, stringifyCanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import { hashWorldReconstructionCaseV1, hashWorldReconstructionEvaluationProfileV1, parseWorldReconstructionCaseV1, parseWorldReconstructionEvaluationProfileV1 } from "@whitebox-world/validation";
import { parseWorldPackageWorldBoundsV1 } from "@whitebox-world/world-package";

import { prepareNativeBlockGenerationTaskV1 } from "./generation-request.js";
import { runNativeBlockGenerationV1, type CodexTaskProcessPortV1 } from "./generation-runner.js";

function option(tokens: readonly string[], name: string): string {
  const index = tokens.indexOf(name);
  const value = index >= 0 ? tokens[index + 1] : undefined;
  if (value === undefined || value.startsWith("--")) throw new TypeError(`Missing ${name}.`);
  return value;
}

const processPort: CodexTaskProcessPortV1 = {
  run: async ({ executablePath, arguments: argumentsValue, cwd }) => new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [executablePath, ...argumentsValue], { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", (exitCode) => resolvePromise({ exitCode: exitCode ?? 1, stdout, stderr }));
  }),
};

async function main(): Promise<void> {
  const tokens = process.argv.slice(2);
  const casePath = path.resolve(option(tokens, "--case"));
  const outputPath = path.resolve(option(tokens, "--output"));
  const runId = path.basename(outputPath);
  const backend = option(tokens, "--backend");
  if (backend !== "cloud" && backend !== "local") throw new TypeError("--backend must be cloud or local.");
  const caseDirectoryPath = path.dirname(casePath);
  const inputDirectoryPath = path.join(caseDirectoryPath, "inputs");
  const [caseBytes, profileBytes, worldBoundsValue] = await Promise.all([
    readFile(casePath),
    readFile(path.join(caseDirectoryPath, "evaluation-profile.json")),
    readFile(path.join(inputDirectoryPath, "world-bounds.json"), "utf8").then(JSON.parse),
  ]);
  const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(new TextDecoder().decode(caseBytes)));
  const profile = parseWorldReconstructionEvaluationProfileV1(JSON.parse(new TextDecoder().decode(profileBytes)));
  const worldBounds = parseWorldPackageWorldBoundsV1(worldBoundsValue);
  if (reconstructionCase.evaluationProfileRef !== "evaluation-profile.json" || reconstructionCase.evaluationProfileHash !== hashWorldReconstructionEvaluationProfileV1(profile)) throw new TypeError("Case/Profile identity closure failed.");
  const routeDecision = decideSceneAuthoringRouteV1({
    id: `${reconstructionCase.id}-route`, sceneBriefRef: reconstructionCase.sceneBriefRef, sceneBriefHash: reconstructionCase.sceneBriefHash,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1", trustProfileHash: sha256CanonicalJson({ id: "trusted-local", version: 1 }) as Sha256HashV1,
    requiredCapabilityRefs: [], requestedSourceKind: "babylon-native", nativeTrustAdmitted: true, referenceDrivenDistinctiveSilhouette: true,
  });
  const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);
  const seed = Number.parseInt(caseHash.slice("sha256:".length, "sha256:".length + 8), 16);
  const hostClosureRootPath = path.resolve("apps/playground/public/world-packages/cloud-ridge");
  const prepared = await prepareNativeBlockGenerationTaskV1({
    case: {
      ...reconstructionCase,
      referenceInputs: reconstructionCase.referenceInputs.map((reference) => {
        if (reference.mediaType === "application/json") throw new TypeError("Native generation reference inputs must be images.");
        return reference;
      }) as readonly Readonly<{ inputRef: string; contentHash: Sha256HashV1; mediaType: "image/png" | "image/jpeg"; }>[],
    }, profile, routeDecision, runId, attemptIndex: 0, backend, runDirectoryPath: outputPath, inputDirectoryPath,
    taskInstructionPath: path.join(inputDirectoryPath, "task-instruction.md"), builderSkillPath: path.join(inputDirectoryPath, "builder-skill", "SKILL.md"),
    nativeSceneApiPath: path.join(inputDirectoryPath, "native-scene-api.json"), nativeSceneProfilePath: path.join(inputDirectoryPath, "native-scene-profile.json"), blockProfilePath: path.join(inputDirectoryPath, "block-profile.json"),
    hostClosureRootPath,
    gameplayBootstrapPath: path.join(hostClosureRootPath, "gameplay", "bootstrap.json"),
    worldRuntimeBootstrapPath: path.join(hostClosureRootPath, "runtime", "world-runtime-bootstrap.json"),
    worldRuntimeBootstrapRef: "worldkit://world-runtime-bootstrap/cloud-ridge@1",
    worldBounds,
    bootstrapId: `${reconstructionCase.id}.native`,
    sceneModuleRef: `worldkit://native-scene/${reconstructionCase.id}@1`,
    seed, budgets: { maximumBlockCount: 2000, maximumStaticColliderCount: 500, maximumStaticColliderVertexCount: 200000, maximumStaticColliderTriangleCount: 100000, maximumOutputBytes: 4000000, timeoutSeconds: 900 },
  });
  const checker = path.join(prepared.taskWorkspacePath, "inputs", "builder-skill", "scripts", "self-check.mjs");
  const result = await runNativeBlockGenerationV1(prepared, {
    process: processPort,
    selfCheck: async (workspacePath) => new Promise((resolvePromise) => {
      const child = spawn(process.execPath, [checker, "--workspace", workspacePath], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.once("error", () => resolvePromise({ ok: false, diagnosticCodes: ["self-check-failed"] }));
      child.once("close", (exitCode) => {
        try {
          const report = JSON.parse(stdout || "{}");
          resolvePromise({ ok: exitCode === 0 && report.ok === true && Array.isArray(report.diagnosticCodes), diagnosticCodes: Array.isArray(report.diagnosticCodes) ? report.diagnosticCodes : ["self-check-failed"] });
        } catch { resolvePromise({ ok: false, diagnosticCodes: ["self-check-failed"] }); }
      });
    }),
    // A create timeout stays durable-unknown here; no second submission is permitted.
    reconcile: async () => ({ outcome: "missing" }),
    cleanup: async () => { await rm(prepared.taskWorkspacePath, { recursive: true, force: true }); return { outcome: "completed" as const }; },
  });
  await writeFile(path.join(outputPath, "attempts", "0", "generation-receipt.json"), `${stringifyCanonicalJson(result.receipt)}\n`);
  process.stdout.write(`${stringifyCanonicalJson({ outcome: result.receipt.outcome, receiptPath: path.join(outputPath, "attempts", "0", "generation-receipt.json") })}\n`);
}

void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
