import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateWhiteboxTriviewManifestV1, type WhiteboxTriviewManifestV1 } from "@whitebox-world/runtime-contracts";
import { finalizeStyledOpeningFrame } from "./finalize-styled-opening-frame.js";
import { finalizeStyledTriviews } from "./finalize-styled-triviews.js";
import { parseVisualGenerationPromptsV2 } from "./visual-generation-prompts.js";

const skillPath = ".codex/skills/worldkit-visual-reconstructor/SKILL.md";
const promptFile = "visual-generation-prompts.json";
const openingFile = "styled-opening-frame.png";
const captureFile = "triviews/whitebox-triview-manifest.json";
const hash = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

interface StyledVisualOptions {
  readonly repoRoot: string;
  readonly sceneId: string;
  readonly userFramePath: string;
  readonly scope: "all" | "triviews";
  readonly backend: "local" | "cloud";
}

/** One routed model task, with the existing Host finalizers after delivery. */
export async function runStyledVisualAgent(
  options: StyledVisualOptions,
  dispatch: (args: readonly string[], repoRoot: string) => Promise<void> = dispatchCodexTask,
): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(options.sceneId) ||
      !["all", "triviews"].includes(options.scope) || !["local", "cloud"].includes(options.backend)) {
    throw new Error("Invalid styled visual scene, scope or backend.");
  }
  const repoRoot = await realpath(options.repoRoot);
  const relativeScene = `artifacts/scenes/${options.sceneId}`;
  const sceneRoot = await realpath(path.join(repoRoot, relativeScene));
  if (sceneRoot !== path.join(repoRoot, relativeScene)) throw new Error("Visual scene root must not be linked.");
  const inputs = new Map<string, { source: string; bytes: Buffer }>();
  async function snapshot(relative: string, source: string): Promise<Buffer> {
    const info = await lstat(source);
    if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > 20 * 1024 * 1024 ||
        await realpath(source) !== path.resolve(source)) throw new Error(`Unsafe visual input: ${relative}`);
    const bytes = await readFile(source);
    inputs.set(relative, { source, bytes });
    return bytes;
  }
  for (const file of ["scene-brief.md", "visual-identity-palette.json", "scene-implementation-map.json",
    "runtime-snapshot.json", "opening-frame.png", captureFile]) {
    await snapshot(`${relativeScene}/${file}`, path.join(sceneRoot, file));
  }
  const capture = JSON.parse(inputs.get(`${relativeScene}/${captureFile}`)!.bytes.toString()) as WhiteboxTriviewManifestV1;
  const errors = validateWhiteboxTriviewManifestV1(capture);
  if (errors.length) throw new Error(`Invalid whitebox tri-view manifest: ${errors.map(e => e.code).join(",")}`);
  for (const target of capture.whiteboxTriviews) {
    const file = path.resolve(sceneRoot, "triviews", target.imageUri);
    const relative = path.relative(sceneRoot, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Tri-view input escaped scene root.");
    await snapshot(`${relativeScene}/${relative}`, file);
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
        manifest.whiteboxOpeningFrame?.contentHash !== hash(inputs.get(`${relativeScene}/opening-frame.png`)!.bytes) ||
        manifest.userFirstFrame?.contentHash !== hash(userBytes) ||
        !Array.isArray(manifest.supplementalTriviews) ||
        manifest.supplementalTriviews.length !== capture.whiteboxTriviews.length ||
        capture.whiteboxTriviews.some((target, index) => {
          const accepted = manifest.supplementalTriviews[index];
          const relative = `triviews/${target.imageUri}`;
          return accepted?.visualTargetId !== target.visualTargetId || accepted?.path !== relative ||
            accepted?.contentHash !== hash(inputs.get(`${relativeScene}/${relative}`)!.bytes);
        })) {
      throw new Error("Styled opening acceptance is missing or stale.");
    }
  }

  const temporaryParent = path.join(repoRoot, ".codex-tmp");
  await mkdir(temporaryParent, { recursive: true });
  const taskRoot = await mkdtemp(path.join(temporaryParent, "visual-reconstructor-"));
  const stagedScene = path.join(taskRoot, relativeScene);
  const targets = capture.whiteboxTriviews;
  const outputs = [
    ...(options.scope === "all" ? [promptFile, openingFile] : []),
    ...targets.map(t => `triviews/${t.visualTargetId}/styled-triview.png`),
  ];
  try {
    for (const [relative, input] of inputs) {
      const destination = path.join(taskRoot, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, input.bytes);
    }
    const instruction = `Use ${skillPath} for scene ${options.sceneId}.
This is one ${options.scope === "all" ? "complete opening-and-tri-views" : "tri-views-only"} visual reconstruction task.
Read ${relativeScene}/scene-brief.md, ${relativeScene}/visual-identity-palette.json and ${relativeScene}/${captureFile}.
The actual-whitebox-opening fixes spatial composition and the visible movement envelope; user-first-frame fixes appearance only.
${options.scope === "all"
    ? "Generate and visually inspect the opening first. Only after accepting it, use that exact styled-opening-frame PNG as the appearance anchor for every tri-view. Never generate the opening and tri-views concurrently."
    : "The attached styled-opening-frame is already accepted. Keep it and the prompt bundle byte-for-byte unchanged; use this exact image as the appearance anchor for every tri-view."}
Inspect each image inside this same task. Allow at most one regeneration per failing image, preserving every other accepted image.
Every target sheet retains left=Front / center=Right / right=Back, its shared physical scale and baseline; do not infer directions from the opening camera.
Declared targets in exact order:
${targets.map((t, i) => `- ${t.visualTargetId}: whitebox-triview-${i + 1}; views=${t.views.join("/")}`).join("\n")}
Write only these declared output files:
${outputs.map(file => `- ${relativeScene}/${file}`).join("\n")}
Use built-in image generation; no subagents, second tasks or external image providers. Do not modify frozen inputs, Runtime, geometry or Camera.
The prompt artifact uses schemaVersion 2, no provider field, roles [actual-whitebox-opening,user-first-frame] for opening and [target-whitebox-triview,styled-opening-frame,user-first-frame] for tri-views.
Host file/hash/role finalization runs after this task returns; do not claim it yourself. If an image still fails after its allowed regeneration, report the failure rather than deliver it as accepted.
`;
    const instructionPath = path.join(taskRoot, "instruction.txt");
    await writeFile(instructionPath, instruction);
    const taskId = `visual-${Date.now()}-${path.basename(taskRoot).slice(-6).toLowerCase()}`;
    const args = ["--backend", options.backend, "--repo-root", taskRoot, "--task-id", taskId,
      "--request-id", taskId, "--stage", "visual-imagegen", "--job-name", `WorldKit Visual Reconstructor ${options.sceneId}`,
      "--instruction-file", instructionPath, "--execution-profile", "formal", "--timeout-seconds", "1800",
      "--context", skillPath, "--context", `${relativeScene}/scene-brief.md`,
      "--context", `${relativeScene}/visual-identity-palette.json`, "--context", `${relativeScene}/${captureFile}`,
      "--asset", `actual-whitebox-opening::${stagedScene}/opening-frame.png::image::image/png`,
      "--asset", `user-first-frame::${taskRoot}/${userRelative}::image::image/${userFormat === "jpg" ? "jpeg" : userFormat}`];
    for (const [i, target] of targets.entries()) args.push("--asset", `whitebox-triview-${i + 1}::${stagedScene}/triviews/${target.imageUri}::image::image/png`);
    if (options.scope === "triviews") args.push("--context", `${relativeScene}/${promptFile}`,
      "--asset", `styled-opening-frame::${stagedScene}/${openingFile}::image::image/png`);
    if (options.backend === "cloud") args.push("--output-s3-prefix",
      `${(process.env.WORLDKIT_LWDP_S3_ROOT || "s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk").replace(/\/$/, "")}/${options.sceneId}/${taskId}`);
    else args.push("--failure-evidence-root", path.join(taskRoot, "local-failure"));
    for (const file of outputs) args.push("--output", `${relativeScene}/${file}::${stagedScene}/${file}::${file.endsWith(".png") ? "image/png" : "application/json"}`);
    // Host-only recovery data, never included in selected task context or assets.
    await writeFile(path.join(taskRoot, "dispatch-args.json"), `${JSON.stringify(args, null, 2)}\n`);
    // Submit once. The router alone owns confirmed-terminal retry and unknown-request reconciliation.
    process.stdout.write("WORLDKIT_STAGE visual-imagegen\n");
    await dispatch(args, repoRoot);
    for (const [relative, input] of inputs) {
      if (!(await readFile(path.join(taskRoot, relative))).equals(input.bytes) ||
          !(await readFile(input.source)).equals(input.bytes)) throw new Error(`Visual input changed during task: ${relative}`);
    }
    if (options.scope === "all") await finalizeStyledOpeningFrame({
      sceneId: options.sceneId, sceneRoot: stagedScene, userFramePath: path.join(taskRoot, userRelative),
    });
    await finalizeStyledTriviews({ sceneId: options.sceneId, sceneRoot: stagedScene });
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
    for (const file of delivery) await rename(path.join(stagedScene, file), path.join(sceneRoot, file));
    // Keep the router's attempt ledger and frozen request even on success.
    // These are execution evidence, not another visual acceptance authority.
    process.stdout.write(`WORLDKIT_VISUAL_TASK_EVIDENCE ${taskRoot}\n`);
  } catch (error) {
    // Preserve isolated task input/output evidence, without resubmission or altering the whitebox outcome.
    process.stderr.write(`Visual task evidence retained at ${taskRoot}\n`);
    throw error;
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
  for (let i = 0; i < args.length; i += 2) {
    if (!["--scene-id", "--user-frame", "--scope", "--backend"].includes(args[i]!) || !args[i + 1]) throw new Error("Invalid styled visual option.");
    options.set(args[i]!, args[i + 1]!);
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const sceneId = options.get("--scene-id") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sceneId)) throw new Error("Invalid scene-id.");
  const scope = (options.get("--scope") ?? "all") as StyledVisualOptions["scope"];
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
    backend: (options.get("--backend") ?? process.env.WORLDKIT_CODEX_BACKEND ?? "cloud") as StyledVisualOptions["backend"] });
  process.stdout.write("WORLDKIT_STAGE visual-imagegen-ready\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
}
