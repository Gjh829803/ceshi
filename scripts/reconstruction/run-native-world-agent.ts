import { spawn } from "node:child_process";
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import { isEqual, isNil } from "lodash-es";

import { parseWorldAgentArgumentsV1 } from "../agents/run-world-agent.js";
import {
  NATIVE_BLOCK_RECONSTRUCTION_DEFAULT_CLOUD_S3_ROOT_V1,
} from "./generation-request.js";
import { prepareNativeWorldCaseV1 } from "./native-world-case-preparation.js";

export function resolveNativeCaseMappingCloudOutputS3PrefixV1(input: Readonly<{
  backend: "cloud" | "local";
  sceneId: string;
  mappingTaskId: string;
  environment?: NodeJS.ProcessEnv;
}>): string | undefined {
  if (input.backend === "local") return undefined;
  const environment = input.environment ?? process.env;
  const root = (environment.WORLDKIT_LWDP_S3_ROOT ??
    NATIVE_BLOCK_RECONSTRUCTION_DEFAULT_CLOUD_S3_ROOT_V1).replace(/\/+$/, "");
  return `${root}/${input.sceneId}/${input.mappingTaskId}/native-case-mapping`;
}

function run(
  command: string,
  arguments_: readonly string[],
  cwd: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      if (signal !== null) {
        reject(new Error(`NATIVE_WORLD_CHILD_SIGNAL:${signal}`));
        return;
      }
      resolve(exitCode ?? 1);
    });
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function caseMappingInstruction(sceneId: string, prompt: string): string {
  return `You are the WorldKit Native Reconstruction Case Mapper for '${sceneId}'.

User request:
${prompt}

Read the frozen scene-brief.md created by the unified WorldKit Planner and the attached planning/reference images. Do not rewrite or reinterpret the Planner's provenance sections. Produce exactly one output, native-case-proposal.json, using this closed top-level shape:
{
  "kind": "native-world-case-proposal",
  "schemaVersion": 1,
  "sceneId": "${sceneId}",
  "expected": <WorldReconstructionExpectedV1>,
  "formalCaptureIntent": <FormalWorldCaptureIntentV1 with id '${sceneId}.formal-world-capture-intent'>,
  "worldBounds": {
    "centerMetersXZ": [<finite x meters>, <finite z meters>],
    "sizeMetersXZ": [<positive width meters>, <positive depth meters>],
    "heightRangeMeters": [<finite minimum y meters>, <finite maximum y meters>]
  }
}

Use the current contracts supplied in repository context. worldBounds has exactly the three fields shown above, every tuple is a dense two-number array, both size values are greater than zero, and heightRangeMeters[0] is less than heightRangeMeters[1]. Never use minimumMetersXYZ or maximumMetersXYZ for worldBounds; those fields belong only to downstream Formal Capture spatial bounds. The proposal owns semantic topology and measurable intent, not quality thresholds or hashes. Use 3-7 complete environment or structure visual groups with stable lowercase IDs. Every visual group must have one semantic silhouette target and one Formal Capture semantic binding. Never create a semantic silhouette target, visual group, topology node, or composition target for the controlled Subject described by the Planner, including its rider, mount, avatar, character, or body parts. The Host-owned SDK Subject remains visible in Runtime Capture without a Native Block binding. Keep target, region, anchor, node, collider, checkpoint, and acceptance identities bijective and internally closed. Every Collider ID, contribution ID, and checkpoint ID must be globally unique. Include a ground/step Collider for Spawn support, and bind it to the same acceptanceTargetRef as expected.spawnSupport. The acceptanceTargetRef of every pass traversal check must name a target with a ground or step Collider role; never bind a pass check to a blocker, cliff, wall, mountain, or other non-traversable landmark. The acceptanceTargetRef of every block traversal check must name a target with a blocker Collider role. A landmark-foot or pass-plane checkpoint may still measure proximity to that landmark inside Formal Capture. Every pass/block traversal check must have a physically reachable supported approach using only its declared fixed input. Formal Capture topology relations must use package-bounds or scripted-traversal exactly as the contract permits. Use a 1280x720 capture profile. Sort every collection where the parser requires stable order.

For a ground Spawn, expected.groundConnectivity is required and has exactly this shape:
{
  "requireSingleReachableComponent": true,
  "requiredTraversalBands": [{
    "acceptanceTargetRef": "<a declared pass-target acceptance ref>",
    "id": "<stable lowercase band id>",
    "centerlineStandPositionsXYZMeters": [
      { "xMeters": <spawn x>, "yMeters": <spawn support y>, "zMeters": <spawn z> },
      { "xMeters": <route waypoint x>, "yMeters": <support y>, "zMeters": <route waypoint z> }
    ],
    "halfWidthMeters": <positive actual usable half-width>
  }]
}
The first position of at least one band must exactly equal expected.spawnSupport.expectedPositionXYZMeters. Ground traversal bands and ground pass traversal targets form a one-to-one binding by acceptanceTargetRef: every band binds one pass target, every ground pass target has exactly one explicit band, and duplicate band target refs are forbidden. Every band must contain 2-256 distinct consecutive support-top positions, and all coordinates must use the Native Block stand lattice (0.25m X/Z and 0.25m Y). Current ground surfaces and analysis are bidirectional by construction; do not add an isBidirectional or one-way field. A band follows the intended bends, junctions, switchbacks, stairs, bridges, or corridors; never inflate its width to admit a remote detour. Ground connectivity is frozen Host intent, not Route/Nav and not Builder-owned policy. For an air Spawn, use requireSingleReachableComponent false and an empty requiredTraversalBands array; this does not claim that the current ground-only Traversal Envelope supports flight or water movement.

The Host will reject malformed output and will add hashes, fixed cross-case quality thresholds, resource identities, and all Runtime owners. Never copy the sample scene's geometry or target names; use it only to understand the current contract shape. Do not create or modify Scene Brief, Babylon code, physics, Package, Receipt, Runtime, Capture, or any Planner image.`;
}

async function main(): Promise<void> {
  const request = parseWorldAgentArgumentsV1(process.argv.slice(2));
  if (request.sceneSourceKind !== "babylon-native") {
    throw new TypeError("NATIVE_WORLD_AGENT_SOURCE_INVALID");
  }
  if (process.env.WORLDKIT_PROMPT_SMOKE === "1") {
    process.stdout.write(
      "WORLDKIT_NATIVE_WORLD_SMOKE_OK unified-planning native-case-mapping native-generation native-check package runtime capture evaluation repair final-publication\n",
    );
    return;
  }
  const backend = process.env.WORLDKIT_CODEX_BACKEND ?? "cloud";
  if (backend !== "cloud" && backend !== "local") {
    throw new TypeError("WORLDKIT_CODEX_BACKEND must be cloud or local.");
  }
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const artifactRoot = path.join(repositoryRoot, "artifacts/scenes", request.sceneId);
  const publicPlanRoot = path.join(
    repositoryRoot,
    "apps/playground/public/scene-plans",
    request.sceneId,
  );
  const casePath = path.join(artifactRoot, "case.json");
  const temporaryRoot = path.join(repositoryRoot, ".codex-tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const taskRoot = await mkdtemp(path.join(temporaryRoot, "native-world-agent."));
  let stagedCaseRoot: string | undefined;
  let ownsPlannerOutputs = false;
  try {
    const references = await Promise.all(request.imagePaths.map(
      async (sourcePath, index) => {
        const extension = path.extname(sourcePath).toLowerCase();
        if (extension !== ".png" && extension !== ".jpg" &&
          extension !== ".jpeg") {
          throw new TypeError("NATIVE_WORLD_REFERENCE_MEDIA_TYPE_INVALID");
        }
        const bytes = await readFile(sourcePath);
        return Object.freeze({
          sourcePath,
          bytes,
          inputRef: `reference-${index}${extension === ".jpeg" ? ".jpg" : extension}`,
          contentHash: sha256Bytes(bytes),
        });
      },
    ));
    const inputIdentity = Object.freeze({
      kind: "native-world-generation-input",
      schemaVersion: 1,
      sceneId: request.sceneId,
      sceneSourceKind: "babylon-native",
      prompt: request.prompt,
      references: references.map(({ inputRef, contentHash }) => ({
        inputRef,
        contentHash,
      })),
    });
    const inputIdentityPath = path.join(artifactRoot, "native-world-input.json");
    if (await exists(casePath)) {
      let frozenIdentity: unknown;
      try {
        frozenIdentity = JSON.parse(await readFile(inputIdentityPath, "utf8"));
      } catch {
        throw new Error("NATIVE_WORLD_CASE_INPUT_IDENTITY_MISSING");
      }
      if (!isEqual(frozenIdentity, inputIdentity)) {
        throw new Error("NATIVE_WORLD_CASE_INPUT_IDENTITY_MISMATCH");
      }
    } else {
      if (await pathExists(artifactRoot) || await pathExists(publicPlanRoot)) {
        throw new Error("NATIVE_WORLD_CASE_PARTIAL_EXISTS");
      }
      const artifactParent = path.dirname(artifactRoot);
      await mkdir(artifactParent, { recursive: true });
      stagedCaseRoot = await mkdtemp(path.join(
        artifactParent,
        `.${request.sceneId}.native-case-`,
      ));
      ownsPlannerOutputs = true;
      const plannerArguments = [
        "scripts/agents/run-canonical-world-agent.sh",
        "--scene-source",
        "babylon-native",
        "--plan-only",
        "--",
        "--scene-id",
        request.sceneId,
      ];
      for (const sourcePath of request.imagePaths) {
        plannerArguments.push("--image", sourcePath);
      }
      plannerArguments.push(request.prompt);
      const plannerExit = await run("bash", plannerArguments, repositoryRoot);
      if (plannerExit !== 0) {
        throw new Error(`NATIVE_WORLD_UNIFIED_PLANNING_FAILED:${plannerExit}`);
      }

      const briefPath = path.join(artifactRoot, "scene-brief.md");
      const worldPlanPath = path.join(publicPlanRoot, "world-plan.png");
      const entryTargetPath = path.join(
        publicPlanRoot,
        "entry-whitebox-target.png",
      );
      const instructionPath = path.join(taskRoot, "native-case-mapping.md");
      await writeFile(
        instructionPath,
        caseMappingInstruction(request.sceneId, request.prompt),
        "utf8",
      );
      const stagedReferences = await Promise.all(references.map(
        async ({ bytes, inputRef }) => {
          const stagedPath = path.join(
            taskRoot,
            inputRef,
          );
          await writeFile(stagedPath, bytes, { flag: "wx" });
          return stagedPath;
        },
      ));
      const proposalPath = path.join(stagedCaseRoot, "native-case-proposal.json");
      const identitySuffix = sha256CanonicalJson(inputIdentity).slice(-12);
      const mappingTaskId =
        `native-case-map-${request.sceneId.slice(0, 40)}-${identitySuffix}`;
      const mappingOutputS3Prefix =
        resolveNativeCaseMappingCloudOutputS3PrefixV1({
          backend,
          sceneId: request.sceneId,
          mappingTaskId,
        });
      const outputArguments = [
        "--backend", backend,
        "--repo-root", repositoryRoot,
        "--task-id", mappingTaskId,
        "--stage", "native-case-mapping",
        "--job-name", `Native Case Mapping ${request.sceneId}`,
        "--request-id", mappingTaskId,
        "--execution-profile", "formal",
        "--submit-attempts", "1",
        "--instruction-file", instructionPath,
        "--context", `artifacts/scenes/${request.sceneId}/scene-brief.md`,
        "--context", "packages/validation/src/reconstruction-contracts.ts",
        "--context", "packages/runtime-contracts/src/formal-world-capture.ts",
        "--context", "packages/world-package/src/package-contract.ts",
        "--context", "artifacts/scenes/cloud-temple-t-gate-native-block/case.json",
        "--context", "artifacts/scenes/cloud-temple-t-gate-native-block/inputs/world-bounds.json",
        "--context", "artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json",
        "--asset", `world-plan::${worldPlanPath}::image::image/png`,
        "--asset", `entry-whitebox-target::${entryTargetPath}::image::image/png`,
        ...stagedReferences.flatMap((referencePath, index) => [
          "--asset",
          `reference-${index}::${referencePath}::image::${path.extname(referencePath) === ".png" ? "image/png" : "image/jpeg"}`,
        ]),
        "--output", `native-case-proposal.json::${proposalPath}::application/json`,
        ...(isNil(mappingOutputS3Prefix) ? [] : [
          "--output-s3-prefix",
          mappingOutputS3Prefix,
        ]),
      ];
      const mappingExit = await run(
        process.execPath,
        ["scripts/agents/run-codex-task.mjs", ...outputArguments],
        repositoryRoot,
      );
      if (mappingExit !== 0) {
        throw new Error(`NATIVE_WORLD_CASE_MAPPING_FAILED:${mappingExit}`);
      }
      await prepareNativeWorldCaseV1({
        repositoryRoot,
        sceneId: request.sceneId,
        proposalPath,
        sceneBriefPath: briefPath,
        referenceImagePaths: stagedReferences,
        outputCaseRoot: stagedCaseRoot,
      });
      for (const fileName of [
        "scene-brief.md",
        "planner-self-check.json",
        "visual-identity-palette.json",
      ]) {
        await copyFile(
          path.join(artifactRoot, fileName),
          path.join(stagedCaseRoot, fileName),
          constants.COPYFILE_EXCL,
        );
      }
      await writeFile(
        path.join(stagedCaseRoot, "native-world-input.json"),
        stringifyCanonicalJson(inputIdentity),
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      await rm(artifactRoot, { recursive: true, force: true });
      await rename(stagedCaseRoot, artifactRoot);
      stagedCaseRoot = undefined;
      ownsPlannerOutputs = false;
    }

    const runId = `run-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${process.pid}`;
    const outputDirectoryPath = path.join(artifactRoot, "runs", runId);
    const exitCode = await run(
      "pnpm",
      [
        "worldkit",
        "reconstruct",
        "run",
        casePath,
        "--output",
        outputDirectoryPath,
        "--backend",
        backend,
        "--json",
      ],
      repositoryRoot,
    );
    if (exitCode !== 0) process.exitCode = exitCode;
    process.stdout.write(`${stringifyCanonicalJson({
      kind: "native-world-agent-result",
      schemaVersion: 1,
      sceneId: request.sceneId,
      sceneSourceKind: "babylon-native",
      casePath,
      outputDirectoryPath,
      exitCode,
    })}\n`);
  } finally {
    if (stagedCaseRoot !== undefined) {
      await rm(stagedCaseRoot, { recursive: true, force: true });
    }
    if (ownsPlannerOutputs) {
      await Promise.all([
        rm(artifactRoot, { recursive: true, force: true }),
        rm(publicPlanRoot, { recursive: true, force: true }),
      ]);
    }
    await rm(taskRoot, { recursive: true, force: true });
  }
}

if (!isNil(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
