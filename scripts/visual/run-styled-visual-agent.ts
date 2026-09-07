import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveFormalWhiteboxTriviewManifestV1, parseFormalWorldCaptureReceiptV1,
  validateWhiteboxTriviewManifestV1, type WhiteboxTriviewManifestV1 } from "@whitebox-world/runtime-contracts";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import type { WorldGenerationSceneSourceKindV1 } from "@whitebox-world/scene-authoring-contracts";
import { hashWorldReconstructionCaseV1, parseWorldReconstructionCaseV1 } from "@whitebox-world/validation";
import { finalizeStyledOpeningFrame } from "./finalize-styled-opening-frame.js";
import { finalizeStyledTriviews } from "./finalize-styled-triviews.js";
import { parseVisualGenerationPromptsV2 } from "./visual-generation-prompts.js";
import { visualCapturePaths } from "./visual-capture-paths.js";
import { writeAtomic } from "../lib/write-atomic.js";
import { spawnOwnedProcess } from "../lib/owned-process.mjs";
import { hashLocalTaskArguments, readLocalTaskDelivery } from "../agents/local-codex-delivery-evidence.mjs";

const skillPath = ".codex/skills/worldkit-visual-reconstructor/SKILL.md";
const promptFile = "visual-generation-prompts.json";
const openingFile = "styled-opening-frame.png";
const hash = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

interface StyledVisualOptions {
  readonly repoRoot: string;
  readonly sceneId: string;
  readonly userFramePath: string;
  readonly scope: "all" | "triviews";
  readonly backend: "local" | "cloud";
  readonly sceneSource?: WorldGenerationSceneSourceKindV1;
  readonly resume?: boolean;
  readonly signal?: AbortSignal;
}

async function readVisualFile(source: string, label: string): Promise<Buffer> {
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > 20 * 1024 * 1024 ||
      await realpath(source) !== path.resolve(source)) throw new Error(`Unsafe visual input: ${label}`);
  return readFile(source);
}

interface VisualTaskReference {
  readonly kind: "worldkit-visual-task-reference";
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly sceneSource: WorldGenerationSceneSourceKindV1;
  readonly scope: StyledVisualOptions["scope"];
  readonly backend: StyledVisualOptions["backend"];
  readonly taskRootRelative: string;
  readonly requestId: string;
  readonly outputS3Prefix: string | null;
  readonly instructionHash: string;
  readonly argumentsHash: string;
  readonly inputHashes: readonly { readonly path: string; readonly contentHash: string }[];
}

/** One routed model task, with the existing Host finalizers after delivery. */
export async function runStyledVisualAgent(
  options: StyledVisualOptions,
  dispatch: (args: readonly string[], repoRoot: string) => Promise<void> = dispatchCodexTask,
): Promise<void> {
  options.signal?.throwIfAborted();
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(options.sceneId) ||
      !["all", "triviews"].includes(options.scope) || !["local", "cloud"].includes(options.backend)) {
    throw new Error("Invalid styled visual scene, scope or backend.");
  }
  const repoRoot = await realpath(options.repoRoot);
  const capturePaths = visualCapturePaths(options.sceneSource);
  const captureFile = capturePaths.manifest;
  const relativeScene = `artifacts/scenes/${options.sceneId}`;
  const sceneRoot = await realpath(path.join(repoRoot, relativeScene));
  if (sceneRoot !== path.join(repoRoot, relativeScene)) throw new Error("Visual scene root must not be linked.");
  const referencePath = path.join(sceneRoot, "visual-task.json");
  const prior = options.resume ? JSON.parse((await readVisualFile(referencePath, "visual-task.json")).toString()) as VisualTaskReference : undefined;
  if (options.resume && !prior) throw new Error("Visual task reference identity mismatch.");
  if (prior && (prior.kind !== "worldkit-visual-task-reference" || prior.schemaVersion !== 1 ||
      prior.sceneId !== options.sceneId || prior.sceneSource !== capturePaths.source || prior.scope !== options.scope ||
      prior.backend !== options.backend || !/^\.codex-tmp\/visual-reconstructor-[A-Za-z0-9]{6}$/.test(prior.taskRootRelative) ||
      !/^visual-[0-9]+-[a-z0-9]{6}$/.test(prior.requestId))) throw new Error("Visual task reference identity mismatch.");
  const inputs = new Map<string, { source: string; bytes: Buffer }>();
  async function snapshot(relative: string, source: string): Promise<Buffer> {
    const bytes = await readVisualFile(source, relative);
    inputs.set(relative, { source, bytes });
    return bytes;
  }
  for (const file of ["scene-brief.md", "visual-identity-palette.json",
    ...(capturePaths.receipt ? [capturePaths.receipt, "case.json"] : ["scene-implementation-map.json", "runtime-snapshot.json"]),
    capturePaths.opening, captureFile]) {
    const inputFile = capturePaths.receipt && ["scene-brief.md", "visual-identity-palette.json"].includes(file)
      ? `inputs/${file}` : file;
    await snapshot(`${relativeScene}/${file}`, path.join(sceneRoot, inputFile));
  }
  const capture = JSON.parse(inputs.get(`${relativeScene}/${captureFile}`)!.bytes.toString()) as WhiteboxTriviewManifestV1;
  const errors = validateWhiteboxTriviewManifestV1(capture);
  if (errors.length) throw new Error(`Invalid whitebox tri-view manifest: ${errors.map(e => e.code).join(",")}`);
  for (const target of capture.whiteboxTriviews) {
    const file = path.resolve(sceneRoot, capturePaths.triviewRoot, target.imageUri);
    const relative = path.relative(sceneRoot, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Tri-view input escaped scene root.");
    await snapshot(`${relativeScene}/${relative}`, file);
  }
  if (capturePaths.receipt) {
    const receipt = parseFormalWorldCaptureReceiptV1(JSON.parse(
      inputs.get(`${relativeScene}/${capturePaths.receipt}`)!.bytes.toString()));
    const expected = deriveFormalWhiteboxTriviewManifestV1(receipt);
    const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(inputs.get(`${relativeScene}/case.json`)!.bytes.toString()));
    const paletteInput = reconstructionCase.referenceInputs.find(row => row.inputRef === "visual-identity-palette.json");
    if (hashWorldReconstructionCaseV1(reconstructionCase) !== receipt.caseHash ||
        reconstructionCase.sceneBriefRef !== "scene-brief.md" ||
        reconstructionCase.sceneBriefHash !== hash(inputs.get(`${relativeScene}/scene-brief.md`)!.bytes) ||
        paletteInput?.mediaType !== "application/json" ||
        paletteInput.contentHash !== hash(inputs.get(`${relativeScene}/visual-identity-palette.json`)!.bytes) ||
        !expected || stringifyCanonicalJson(expected) !== stringifyCanonicalJson(capture) ||
        receipt.views.find(view => view.viewId === "opening")!.pngContentHash !==
          hash(inputs.get(`${relativeScene}/${capturePaths.opening}`)!.bytes) ||
        receipt.whiteboxTriviews.some((row, index) => row.pngContentHash !== hash(inputs.get(
          `${relativeScene}/${capturePaths.triviewRoot}/${capture.whiteboxTriviews[index]!.imageUri}`)!.bytes))) {
      throw new Error("Native visual capture identity mismatch.");
    }
  }
  await snapshot(skillPath, path.join(repoRoot, skillPath));
  const userBytes = await snapshot("inputs/user-first-frame", path.resolve(options.userFramePath));
  const userFormat = imageFormat(userBytes);
  const userRelative = `inputs/user-first-frame.${userFormat}`;
  inputs.set(userRelative, inputs.get("inputs/user-first-frame")!);
  inputs.delete("inputs/user-first-frame");
  for (const [relative, input] of inputs) {
    if (relative.endsWith(".png") && imageFormat(input.bytes) !== "png") throw new Error("Whitebox image must be PNG.");
  }
  if (options.scope === "triviews") {
    const opening = await snapshot(`${relativeScene}/${openingFile}`, path.join(sceneRoot, openingFile));
    const prompt = await snapshot(`${relativeScene}/${promptFile}`, path.join(sceneRoot, promptFile));
    const manifest = JSON.parse((await snapshot(`${relativeScene}/styled-opening-frame-manifest.json`,
      path.join(sceneRoot, "styled-opening-frame-manifest.json"))).toString());
    parseVisualGenerationPromptsV2(JSON.parse(prompt.toString()), {
      sceneId: options.sceneId, visualTargetIds: capture.whiteboxTriviews.map(t => t.visualTargetId),
    });
    if (manifest.status !== "passed" || manifest.sceneId !== options.sceneId ||
        manifest.styledOpeningFrame?.contentHash !== hash(opening) ||
        manifest.promptBundle?.contentHash !== hash(prompt) ||
        manifest.whiteboxOpeningFrame?.contentHash !== hash(inputs.get(`${relativeScene}/${capturePaths.opening}`)!.bytes) ||
        manifest.userFirstFrame?.contentHash !== hash(userBytes) ||
        !Array.isArray(manifest.supplementalTriviews) ||
        manifest.supplementalTriviews.length !== capture.whiteboxTriviews.length ||
        capture.whiteboxTriviews.some((target, index) => {
          const accepted = manifest.supplementalTriviews[index];
          const relative = `${capturePaths.triviewRoot}/${target.imageUri}`;
          return accepted?.visualTargetId !== target.visualTargetId || accepted?.path !== relative ||
            accepted?.contentHash !== hash(inputs.get(`${relativeScene}/${relative}`)!.bytes);
        })) {
      throw new Error("Styled opening acceptance is missing or stale.");
    }
  }

  const temporaryParent = path.join(repoRoot, ".codex-tmp");
  await mkdir(temporaryParent, { recursive: true });
  const taskRoot = prior ? path.join(repoRoot, prior.taskRootRelative) : await mkdtemp(path.join(temporaryParent, "visual-reconstructor-"));
  if (await realpath(taskRoot) !== taskRoot) throw new Error("Linked visual task root.");
  const stagedScene = path.join(taskRoot, relativeScene);
  const targets = capture.whiteboxTriviews;
  const outputs = [
    ...(options.scope === "all" ? [promptFile, openingFile] : []),
    ...targets.map(t => `triviews/${t.visualTargetId}/styled-triview.png`),
  ];
  try {
    for (const [relative, input] of inputs) {
      const destination = path.join(taskRoot, relative);
      if (prior) {
        if (!(await readVisualFile(destination, relative)).equals(input.bytes)) throw new Error(`Visual resume input changed: ${relative}`);
      } else {
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, input.bytes);
      }
    }
    const instruction = `Use ${skillPath} for scene ${options.sceneId}.
This is one ${options.scope === "all" ? "complete opening-and-tri-views" : "tri-views-only"} visual reconstruction task.
Read ${relativeScene}/scene-brief.md, ${relativeScene}/visual-identity-palette.json and ${relativeScene}/${captureFile}.
The actual-whitebox-opening fixes spatial composition and the visible movement envelope; user-first-frame fixes appearance only.
${options.scope === "all"
    ? "Generate and visually inspect the opening first. After its existing repair allowance, save and freeze that exact styled-opening-frame PNG as the appearance anchor for every tri-view. Never generate the opening and tri-views concurrently."
    : "The attached styled-opening-frame is already accepted. Keep it and the prompt bundle byte-for-byte unchanged; use this exact image as the appearance anchor for every tri-view."}
Inspect each image inside this same task. Allow at most one regeneration per failing image, preserving every other accepted image.
Every target sheet retains left=Front / center=Right / right=Back, its shared physical scale and baseline; do not infer directions from the opening camera.
Declared targets in exact order:
${targets.map((t, i) => `- ${t.visualTargetId}: whitebox-triview-${i + 1}; views=${t.views.join("/")}`).join("\n")}
Write only these declared output files:
${outputs.map(file => `- ${relativeScene}/${file}`).join("\n")}
Use built-in image generation; no subagents, second tasks or external image providers. Do not modify frozen inputs, Runtime, geometry or Camera.
The prompt artifact uses schemaVersion 2, no provider field, roles [actual-whitebox-opening,user-first-frame] for opening and [target-whitebox-triview,styled-opening-frame,user-first-frame] for tri-views.
After the existing allowance, save every final generated PNG at its declared path, even if visual differences remain. Report residual differences by target in the final response without claiming perfect alignment. Visual self-review is repair feedback, not a production delivery veto; do not withhold a valid required image or add a generation round. Missing, unreadable or corrupt outputs are still failures. Host file/hash/role finalization runs after this task returns; do not claim it yourself.
`;
    const instructionPath = path.join(taskRoot, "instruction.txt");
    if (!prior) await writeFile(instructionPath, instruction);
    const taskId = prior?.requestId ?? `visual-${Date.now()}-${path.basename(taskRoot).slice(-6).toLowerCase()}`;
    const outputS3Prefix = options.backend === "cloud" ? prior?.outputS3Prefix ??
      `${(process.env.WORLDKIT_LWDP_S3_ROOT || "s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk").replace(/\/$/, "")}/${options.sceneId}/${taskId}` : null;
    const args = ["--backend", options.backend, "--repo-root", taskRoot, "--task-id", taskId,
      "--request-id", taskId, "--stage", "visual-reconstruction", "--job-name", `WorldKit Visual Reconstructor ${options.sceneId}`,
      "--instruction-file", instructionPath, "--execution-profile", "formal", "--timeout-seconds", "1800",
      "--context", skillPath, "--context", `${relativeScene}/scene-brief.md`,
      "--context", `${relativeScene}/visual-identity-palette.json`, "--context", `${relativeScene}/${captureFile}`,
      "--asset", `actual-whitebox-opening::${stagedScene}/${capturePaths.opening}::image::image/png`,
      "--asset", `user-first-frame::${taskRoot}/${userRelative}::image::image/${userFormat === "jpg" ? "jpeg" : userFormat}`];
    if (capturePaths.receipt) args.push("--context", `${relativeScene}/${capturePaths.receipt}`);
    for (const [i, target] of targets.entries()) args.push("--asset", `whitebox-triview-${i + 1}::${stagedScene}/${capturePaths.triviewRoot}/${target.imageUri}::image::image/png`);
    if (options.scope === "triviews") args.push("--context", `${relativeScene}/${promptFile}`,
      "--asset", `styled-opening-frame::${stagedScene}/${openingFile}::image::image/png`);
    if (outputS3Prefix !== null) args.push("--output-s3-prefix", outputS3Prefix);
    else args.push("--failure-evidence-root", path.join(taskRoot, "local-failure"),
      "--delivery-evidence-root", path.join(taskRoot, "local-delivery"));
    for (const file of outputs) args.push("--output", `${relativeScene}/${file}::${stagedScene}/${file}::${file.endsWith(".png") ? "image/png" : "application/json"}`);
    // Host-only recovery data, never included in selected task context or assets.
    const argumentBytes = Buffer.from(`${JSON.stringify(args, null, 2)}\n`);
    const reference: VisualTaskReference = { kind: "worldkit-visual-task-reference", schemaVersion: 1,
      sceneId: options.sceneId, sceneSource: capturePaths.source, scope: options.scope, backend: options.backend,
      taskRootRelative: path.relative(repoRoot, taskRoot), requestId: taskId, outputS3Prefix,
      instructionHash: hash(Buffer.from(instruction)), argumentsHash: hash(argumentBytes),
      inputHashes: [...inputs].map(([path, input]) => ({ path, contentHash: hash(input.bytes) })),
    };
    if (prior) {
      if (stringifyCanonicalJson(prior) !== stringifyCanonicalJson(reference) ||
          !(await readVisualFile(path.join(taskRoot, "dispatch-args.json"), "dispatch args")).equals(argumentBytes) ||
          !(await readVisualFile(instructionPath, "instruction")).equals(Buffer.from(instruction))) {
        throw new Error("Visual task reference identity mismatch.");
      }
    } else {
      await writeFile(path.join(taskRoot, "dispatch-args.json"), argumentBytes);
      await writeAtomic(referencePath, `${stringifyCanonicalJson(reference)}\n`);
    }
    process.stdout.write(`WORLDKIT_VISUAL_TASK_EVIDENCE ${taskRoot}\n`);
    // Submit once. The router alone owns confirmed-terminal retry and unknown-request reconciliation.
    process.stdout.write("WORLDKIT_STAGE visual-imagegen\n");
    const deliveryPath = path.join(taskRoot, "dispatch-delivery.json");
    let delivered: { kind: string; schemaVersion: number; requestId: string; argumentsHash: string;
      outputs: { path: string; contentHash: string }[] } | undefined;
    if (prior) {
      try {
        delivered = JSON.parse((await readVisualFile(deliveryPath, "dispatch delivery")).toString());
        if (!delivered) throw new Error("Visual task delivery identity mismatch.");
      }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    if (delivered) {
      if (delivered.kind !== "worldkit-visual-task-delivery" || delivered.schemaVersion !== 1 ||
          delivered.requestId !== taskId || delivered.argumentsHash !== reference.argumentsHash ||
          !Array.isArray(delivered.outputs) || delivered.outputs.length !== outputs.length ||
          delivered.outputs.some((row, index) => row.path !== outputs[index])) throw new Error("Visual task delivery identity mismatch.");
      for (const row of delivered.outputs) {
        const staged = path.join(stagedScene, row.path);
        try {
          if (hash(await readVisualFile(staged, row.path)) !== row.contentHash) throw new Error("Visual delivered output changed.");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          const live = path.join(sceneRoot, row.path);
          const bytes = await readVisualFile(live, row.path);
          if (hash(bytes) !== row.contentHash) throw new Error("Visual delivered output changed.");
          await mkdir(path.dirname(staged), { recursive: true });
          await writeFile(staged, bytes);
        }
      }
    } else {
      // Local execution has no same-request remote reconciliation. Unknown local
      // execution must not silently become another model invocation.
      if (prior && options.backend === "local") {
        const delivery = await readLocalTaskDelivery({ evidenceRoot: path.join(taskRoot, "local-delivery"),
          // The first pair in our constructed args selects the router backend;
          // all following arguments are forwarded unchanged to the local adapter.
          requestId: taskId, taskId, argumentsHash: hashLocalTaskArguments(args.slice(2)),
          outputPaths: outputs.map(file => `${relativeScene}/${file}`) });
        if (!delivery) throw new Error("LOCAL_VISUAL_TASK_NOT_DELIVERED: reconcile the original local task before retrying.");
        for (const row of delivery) {
          const destination = path.join(taskRoot, row.path);
          await mkdir(path.dirname(destination), { recursive: true });
          if (await realpath(path.dirname(destination)) !== path.dirname(destination)) throw new Error("Linked visual delivery destination.");
          try {
            const metadata = await lstat(destination);
            if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) throw new Error("Unsafe visual delivery destination.");
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
          // Restore the exact router snapshot, not arbitrary residual/partial outputs.
          await writeAtomic(destination, row.bytes);
        }
      } else {
        options.signal?.throwIfAborted();
        await dispatch(args, repoRoot);
      }
      options.signal?.throwIfAborted();
      delivered = { kind: "worldkit-visual-task-delivery", schemaVersion: 1,
        requestId: taskId, argumentsHash: reference.argumentsHash,
        outputs: await Promise.all(outputs.map(async file => ({ path: file,
          contentHash: hash(await readVisualFile(path.join(stagedScene, file), file)) }))),
      };
      await writeAtomic(deliveryPath, `${stringifyCanonicalJson(delivered)}\n`);
    }
    for (const [relative, input] of inputs) {
      if (!(await readFile(path.join(taskRoot, relative))).equals(input.bytes) ||
          !(await readFile(input.source)).equals(input.bytes)) throw new Error(`Visual input changed during task: ${relative}`);
    }
    if ((await readVisualFile(referencePath, "visual-task.json")).toString() !== `${stringifyCanonicalJson(reference)}\n`) {
      throw new Error("Visual task reference changed during task.");
    }
    options.signal?.throwIfAborted();
    if (options.scope === "all") await finalizeStyledOpeningFrame({
      sceneId: options.sceneId, sceneRoot: stagedScene, userFramePath: path.join(taskRoot, userRelative),
      sceneSource: capturePaths.source,
    });
    await finalizeStyledTriviews({ sceneId: options.sceneId, sceneRoot: stagedScene, sceneSource: capturePaths.source });
    const delivery = [...outputs, "styled-triviews-manifest.json", "styled-triviews-report.json",
      ...(options.scope === "all" ? [`user-first-frame.${userFormat}`, "styled-opening-frame-manifest.json", "styled-opening-frame-report.json"] : [])];
    // All generated files are admitted before any live result is replaced.
    for (const file of delivery) {
      const target = path.join(sceneRoot, file);
      await mkdir(path.dirname(target), { recursive: true });
      if (await realpath(path.dirname(target)) !== path.dirname(target)) throw new Error("Linked visual output parent.");
      try { if ((await lstat(target)).isSymbolicLink()) throw new Error("Linked visual output."); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    options.signal?.throwIfAborted();
    for (const file of delivery) await rename(path.join(stagedScene, file), path.join(sceneRoot, file));
    // Keep the router's attempt ledger and frozen request even on success.
    // These are execution evidence, not another visual acceptance authority.
  } catch (error) {
    // Preserve isolated task input/output evidence, without resubmission or altering the whitebox outcome.
    process.stderr.write(`Visual task evidence retained at ${taskRoot}\n`);
    throw error;
  }
}

/** Recover the original delivery, never submit a new model task. Cloud download
 * belongs to the existing router's reconcile-only request/attempt owner. */
export async function replayDeliveredStyledVisualAgent(
  options: Omit<StyledVisualOptions, "resume">,
  reconcile: (args: readonly string[], repoRoot: string, signal?: AbortSignal) => Promise<void> = reconcileCodexTask,
): Promise<void> {
  await runStyledVisualAgent({ ...options, resume: true }, async (args, repoRoot) => {
    // Administrative switches only: leave frozen dispatch bytes and identities
    // unchanged. Local recovery uses its immutable delivery snapshot above.
    if (options.backend !== "cloud") throw new Error("LOCAL_VISUAL_TASK_NOT_DELIVERED");
    await reconcile([...args, "--reconcile-only", "--reconcile-no-wait"], repoRoot, options.signal);
  });
}

async function reconcileCodexTask(args: readonly string[], repoRoot: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const owned = spawnOwnedProcess(process.execPath,
    [path.join(repoRoot, "scripts/agents/run-codex-task.mjs"), ...args],
    { cwd: repoRoot, env: process.env, stdio: "inherit" });
  const onAbort = () => { void owned.terminate().catch(() => {}); };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) onAbort();
    const result = await owned.exited;
    signal?.throwIfAborted();
    if (result.error) throw result.error;
    if (result.code !== 0 || result.signal !== null) throw new Error(`Visual Codex reconciliation failed (${result.signal ?? result.code}).`);
  } finally {
    signal?.removeEventListener("abort", onAbort);
    // Also reap surviving descendants when their immediate parent already exited.
    // The shared owner preserves the existing TERM grace and KILL escalation.
    await owned.terminate();
  }
}

function imageFormat(bytes: Buffer): "png" | "jpg" | "webp" {
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  if (bytes.subarray(0, 3).toString("hex") === "ffd8ff") return "jpg";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "webp";
  throw new Error("Unsupported visual input image signature.");
}

async function dispatchCodexTask(args: readonly string[], repoRoot: string): Promise<void> {
  const child = spawn(process.execPath, [path.join(repoRoot, "scripts/agents/run-codex-task.mjs"), ...args], {
    cwd: repoRoot, env: process.env, stdio: "inherit", shell: false,
  });
  const onInterrupt = () => child.kill("SIGINT");
  const onTerminate = () => child.kill("SIGTERM");
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => code === 0 && signal === null
        ? resolve() : reject(new Error(`Visual Codex task failed (${signal ?? code}).`)));
    });
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = new Map<string, string>();
  let resume = false;
  for (let i = 0; i < args.length;) {
    if (args[i] === "--resume") { resume = true; i += 1; continue; }
    if (!["--scene-id", "--user-frame", "--scope", "--backend", "--scene-source"].includes(args[i]!) || !args[i + 1]) throw new Error("Invalid styled visual option.");
    options.set(args[i]!, args[i + 1]!);
    i += 2;
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const sceneId = options.get("--scene-id") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sceneId)) throw new Error("Invalid scene-id.");
  const scope = (options.get("--scope") ?? "all") as StyledVisualOptions["scope"];
  const sceneSource = visualCapturePaths(options.get("--scene-source")).source;
  let userFramePath = options.get("--user-frame");
  if (!userFramePath) {
    const base = scope === "triviews" ? `artifacts/scenes/${sceneId}/user-first-frame` : `apps/playground/public/scene-plans/${sceneId}/reference-0`;
    for (const format of ["png", "jpg", "webp"]) {
      const candidate = path.join(repoRoot, `${base}.${format}`);
      try { await lstat(candidate); userFramePath = candidate; break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  }
  if (!userFramePath) throw new Error("A user appearance reference is required.");
  await runStyledVisualAgent({ repoRoot, sceneId, scope, userFramePath,
    sceneSource, resume,
    backend: (options.get("--backend") ?? process.env.WORLDKIT_CODEX_BACKEND ?? "cloud") as StyledVisualOptions["backend"] });
  process.stdout.write("WORLDKIT_STAGE visual-imagegen-ready\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
}
