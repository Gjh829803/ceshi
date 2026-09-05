import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runStyledVisualAgent, replayDeliveredStyledVisualAgent } from "./run-styled-visual-agent.js";
import { hashLocalTaskArguments, retainLocalTaskDelivery } from "../agents/local-codex-delivery-evidence.mjs";
import { createEvidenceSetFixtureInputV1 } from "../reconstruction/evaluate-fixture.test-support.js";
import { deriveFormalWhiteboxTriviewManifestV1, parseFormalWorldCaptureReceiptV1 } from "@whitebox-world/runtime-contracts";
import { sha256Bytes } from "@whitebox-world/protocol";
import { hashWorldReconstructionCaseV1, parseWorldReconstructionCaseV1 } from "@whitebox-world/validation";
import { hashFormalWorldCaptureRequestV1, hashFormalSemanticCaptureMapV1 } from "@whitebox-world/runtime-contracts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const sceneId = "visual-agent-fixture";
const targetIds = ["traveler", "palace"];
const png = new PNG({ width: 2, height: 2 });
png.data.fill(255);
const pixels = PNG.sync.write(png);
const bundle = (ids = targetIds) => ({ kind: "worldkit-visual-generation-prompts", schemaVersion: 2, sceneId,
  openingFrame: { referenceRoles: ["actual-whitebox-opening", "user-first-frame"], prompt: "o".repeat(200) },
  styledTriviews: ids.map(visualTargetId => ({ visualTargetId,
    referenceRoles: ["target-whitebox-triview", "styled-opening-frame", "user-first-frame"], prompt: "t".repeat(150) })) });
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "styled-agent-test-")));
  roots.push(root);
  const sceneRoot = path.join(root, "artifacts/scenes", sceneId);
  const skill = ".codex/skills/worldkit-visual-reconstructor/SKILL.md";
  await mkdir(path.dirname(path.join(root, skill)), { recursive: true });
  await writeFile(path.join(root, skill), await readFile(path.resolve(skill)));
  for (const id of targetIds) {
    await mkdir(path.join(sceneRoot, "triviews", id), { recursive: true });
    await writeFile(path.join(sceneRoot, "triviews", id, "whitebox-triview.png"), pixels);
  }
  for (const [file, content] of Object.entries({
    "scene-brief.md": "A traveler walking toward a palace.",
    "scene-implementation-map.json": "{}",
    "runtime-snapshot.json": "{}",
    "visual-identity-palette.json": JSON.stringify({ targets: targetIds.map(visualTargetId => ({ visualTargetId })) }),
    "triviews/whitebox-triview-manifest.json": JSON.stringify({ kind: "worldkit-whitebox-triview-manifest", schemaVersion: 1,
      worldBuildIdentityHash: `sha256:${"a".repeat(64)}`, whiteboxTriviews: targetIds.map((visualTargetId, index) => ({
        visualTargetId, runtimeEntityIds: [visualTargetId], frontDirectionWorldXZ: [0, -1], role: index ? "primary-landmark" : "primary-subject",
        semanticClassId: index ? "landmark.palace" : "subject.traveler", identityColor: index ? "#5D9FE8" : "#E85D5D",
        views: ["front", "right", "back"], imageUri: `${visualTargetId}/whitebox-triview.png`,
      })) }),
  })) await writeFile(path.join(sceneRoot, file), content);
  await writeFile(path.join(sceneRoot, "opening-frame.png"), pixels);
  const userFramePath = path.join(root, "appearance.png");
  await writeFile(userFramePath, pixels);
  return { repoRoot: root, sceneId, userFramePath, sceneRoot, backend: "local" as const, scope: "all" as const };
}
function argument(args: readonly string[], key: string) { return args[args.indexOf(key) + 1]!; }
async function deliver(args: readonly string[], ids = targetIds) {
  for (let i = 0; i < args.length; i++) if (args[i] === "--output") {
    const [, local] = args[++i]!.split("::");
    await mkdir(path.dirname(local!), { recursive: true });
    await writeFile(local!, local!.endsWith(".json") ? JSON.stringify(bundle(ids)) : pixels);
  }
}

async function nativeFixture() {
  const input = await fixture();
  const evidence = createEvidenceSetFixtureInputV1({ includeWhiteboxTriviews: true });
  await mkdir(path.join(input.sceneRoot, "inputs"));
  for (const file of ["scene-brief.md", "visual-identity-palette.json"])
    await writeFile(path.join(input.sceneRoot, "inputs", file), await readFile(path.join(input.sceneRoot, file)));
  const reconstructionCase = parseWorldReconstructionCaseV1({ ...evidence.reconstructionCase,
    sceneBriefRef: "scene-brief.md", sceneBriefHash: sha256Bytes(await readFile(path.join(input.sceneRoot, "scene-brief.md"))),
    referenceInputs: [{ inputRef: "visual-identity-palette.json", mediaType: "application/json",
      contentHash: sha256Bytes(await readFile(path.join(input.sceneRoot, "visual-identity-palette.json"))) }],
  });
  await writeFile(path.join(input.sceneRoot, "case.json"), JSON.stringify(reconstructionCase));
  const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);
  const semanticCaptureMap = { ...evidence.captureReceipt.formalRequest.semanticCaptureMap, caseHash };
  const semanticCaptureMapHash = hashFormalSemanticCaptureMapV1(semanticCaptureMap);
  const formalRequest = { ...evidence.captureReceipt.formalRequest, caseHash, semanticCaptureMap, semanticCaptureMapHash };
  const receipt = parseFormalWorldCaptureReceiptV1({ ...evidence.captureReceipt,
    caseHash, semanticCaptureMapHash, formalRequest, formalRequestHash: hashFormalWorldCaptureRequestV1(formalRequest),
    views: evidence.captureReceipt.views.map(view => ({ ...view, pngContentHash: sha256Bytes(pixels) })),
  });
  const manifest = deriveFormalWhiteboxTriviewManifestV1(receipt)!;
  const captureRoot = path.join(input.sceneRoot, "final/capture");
  await mkdir(path.join(captureRoot, "triviews"), { recursive: true });
  await writeFile(path.join(captureRoot, "opening.png"), pixels);
  await writeFile(path.join(captureRoot, "formal-world-capture-receipt.json"), JSON.stringify(receipt));
  await writeFile(path.join(captureRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify(manifest));
  for (const [index, target] of manifest.whiteboxTriviews.entries()) {
    const file = path.join(captureRoot, "triviews", target.imageUri);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, evidence.whiteboxTriviewPngs[index]!);
  }
  // A Native scene has no Canonical artifacts or root whitebox aliases.
  for (const file of ["scene-implementation-map.json", "runtime-snapshot.json", "opening-frame.png", "triviews"])
    await rm(path.join(input.sceneRoot, file), { recursive: true });
  return { ...input, sceneSource: "babylon-native" as const, captureRoot,
    ids: manifest.whiteboxTriviews.map(target => target.visualTargetId) };
}

describe("single-task styled visual production", () => {
  it.each(["local", "cloud"] as const)("replays completed %s delivery after old-pixel or partial promotion without dispatch", async backend => {
    const input = { ...await nativeFixture(), backend };
    const captureBefore = await readFile(path.join(input.captureRoot, "formal-world-capture-receipt.json"));
    await runStyledVisualAgent(input, args => deliver(args, input.ids));
    const reference = JSON.parse(await readFile(path.join(input.sceneRoot, "visual-task.json"), "utf8"));
    const root = path.join(input.repoRoot, reference.taskRootRelative);
    const delivery = JSON.parse(await readFile(path.join(root, "dispatch-delivery.json"), "utf8"));
    for (const row of delivery.outputs) await utimes(path.join(input.sceneRoot, row.path), new Date(0), new Date(0));
    // Restore one promoted output to its retained task location: interrupted promotion.
    const file = delivery.outputs.at(-1).path;
    await mkdir(path.dirname(path.join(root, "artifacts/scenes", sceneId, file)), { recursive: true });
    await rename(path.join(input.sceneRoot, file), path.join(root, "artifacts/scenes", sceneId, file));
    await replayDeliveredStyledVisualAgent(input);
    expect(await readFile(path.join(input.sceneRoot, file))).toEqual(pixels);
    await replayDeliveredStyledVisualAgent(input);
    expect(await readFile(path.join(input.sceneRoot, "visual-task.json"), "utf8")).toContain(reference.requestId);
    expect(await readFile(path.join(root, "dispatch-delivery.json"), "utf8")).toContain(reference.argumentsHash);
    expect(await readFile(path.join(input.captureRoot, "formal-world-capture-receipt.json"))).toEqual(captureBefore);
  });

  it.each(["local", "cloud"] as const)("does not dispatch an undelivered %s task during automatic replay", async backend => {
    const input = { ...await nativeFixture(), backend };
    await expect(runStyledVisualAgent(input, async () => { throw new Error("not delivered"); })).rejects.toThrow("not delivered");
    const reconcile = vi.fn(async () => { throw new Error("VISUAL_TASK_NOT_DELIVERED"); });
    await expect(replayDeliveredStyledVisualAgent(input, reconcile)).rejects.toThrow(
      backend === "local" ? "LOCAL_VISUAL_TASK_NOT_DELIVERED" : "VISUAL_TASK_NOT_DELIVERED");
    expect(reconcile).toHaveBeenCalledTimes(backend === "local" ? 0 : 1);
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame.png"))).rejects.toThrow();
  });

  it("reconciles Cloud delivery with the original frozen arguments and only administrative switches", async () => {
    const input = { ...await nativeFixture(), backend: "cloud" as const };
    let original: readonly string[] = [];
    await expect(runStyledVisualAgent(input, async args => {
      original = [...args]; throw new Error("response lost");
    })).rejects.toThrow("response lost");
    const referenceBefore = await readFile(path.join(input.sceneRoot, "visual-task.json"));
    const reconcile = vi.fn(async (args: readonly string[], repoRoot: string) => {
      expect(args).toEqual([...original, "--reconcile-only", "--reconcile-no-wait"]);
      expect(repoRoot).toBe(input.repoRoot);
      await deliver(args, input.ids);
    });
    await replayDeliveredStyledVisualAgent(input, reconcile);
    await replayDeliveredStyledVisualAgent(input, reconcile);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(await readFile(path.join(input.sceneRoot, "styled-opening-frame.png"))).toEqual(pixels);
    expect(await readFile(path.join(input.sceneRoot, "visual-task.json"))).toEqual(referenceBefore);
  });

  it("does not reconcile stale Cloud inputs or publish a delivery cancelled in flight", async () => {
    const input = { ...await nativeFixture(), backend: "cloud" as const };
    await expect(runStyledVisualAgent(input, async () => { throw new Error("pending"); })).rejects.toThrow("pending");
    const original = await readFile(input.userFramePath);
    await writeFile(input.userFramePath, Buffer.concat([original, Buffer.from("changed")]));
    const reconcile = vi.fn(async () => {});
    await expect(replayDeliveredStyledVisualAgent(input, reconcile)).rejects.toThrow();
    expect(reconcile).not.toHaveBeenCalled();
    await writeFile(input.userFramePath, original);
    const controller = new AbortController();
    let deliveries = 0;
    await expect(replayDeliveredStyledVisualAgent({ ...input, signal: controller.signal }, async args => {
      deliveries++;
      await deliver(args, input.ids); controller.abort();
    })).rejects.toThrow();
    expect(deliveries).toBe(1);
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame.png"))).rejects.toThrow();
    await expect(replayDeliveredStyledVisualAgent({ ...input, signal: controller.signal }, reconcile)).rejects.toThrow();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("cancels the actual reconciliation child even when it ignores SIGTERM", async () => {
    const input = { ...await nativeFixture(), backend: "cloud" as const };
    await expect(runStyledVisualAgent(input, async () => { throw new Error("pending"); })).rejects.toThrow("pending");
    const script = path.join(input.repoRoot, "scripts/agents/run-codex-task.mjs");
    const ready = path.join(input.repoRoot, "reconcile-ready.json");
    await mkdir(path.dirname(script), { recursive: true });
    await writeFile(script, `import { writeFileSync } from 'node:fs';
      process.on('SIGTERM', () => {});
      writeFileSync(${JSON.stringify(ready)}, JSON.stringify({ pid: process.pid, args: process.argv.slice(2) }));
      setInterval(() => {}, 1000);`);
    const controller = new AbortController();
    const operation = replayDeliveredStyledVisualAgent({ ...input, signal: controller.signal });
    const outcome = operation.then(() => null, error => error);
    try {
      await vi.waitFor(async () => { await access(ready); });
      const running = JSON.parse(await readFile(ready, "utf8"));
      expect(running.args.slice(-2)).toEqual(["--reconcile-only", "--reconcile-no-wait"]);
      controller.abort();
      expect((await outcome)?.name).toBe("AbortError");
      expect(() => process.kill(running.pid, 0)).toThrow();
      await expect(access(path.join(input.sceneRoot, "styled-opening-frame.png"))).rejects.toThrow();
    } finally { controller.abort(); await outcome; }
  }, 10_000);

  it("forwards no-submit and no-wait through the real router before finalizing downloaded Cloud outputs", async () => {
    const input = { ...await nativeFixture(), backend: "cloud" as const };
    await expect(runStyledVisualAgent(input, async () => { throw new Error("pending"); })).rejects.toThrow("pending");
    const scripts = path.join(input.repoRoot, "scripts/agents");
    const calls = path.join(input.repoRoot, "download-calls.txt");
    await mkdir(scripts, { recursive: true });
    await copyFile(path.resolve("scripts/agents/run-codex-task.mjs"), path.join(scripts, "run-codex-task.mjs"));
    // Only the remote adapter is a local fixture. The production router, owned
    // process, frozen input checks, finalizers and output promotion all execute.
    await writeFile(path.join(scripts, "run-lwdp-codex-task.mjs"), `
      import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
      import path from 'node:path';
      const args = process.argv.slice(2);
      if (!args.includes('--reconcile-only') || !args.includes('--reconcile-no-wait')) throw new Error('unexpected submission');
      appendFileSync(${JSON.stringify(calls)}, 'download\\n');
      for (let i = 0; i < args.length; i++) if (args[i] === '--output') {
        const [, local] = args[++i].split('::');
        mkdirSync(path.dirname(local), {recursive: true});
        writeFileSync(local, local.endsWith('.json') ? ${JSON.stringify(JSON.stringify(bundle(input.ids)))}
          : Buffer.from(${JSON.stringify(pixels.toString("base64"))}, 'base64'));
      }`);
    await replayDeliveredStyledVisualAgent(input);
    await replayDeliveredStyledVisualAgent(input);
    expect(await readFile(calls, "utf8")).toBe("download\n");
    expect(await readFile(path.join(input.sceneRoot, "styled-opening-frame.png"))).toEqual(pixels);
    expect(JSON.parse(await readFile(path.join(input.sceneRoot, "styled-triviews-report.json"), "utf8")).status).toBe("passed");
  });

  it.each(["all", "partial-promotion", "changed-snapshot", "foreign-request", "linked-destination", "partial-receipt"])("restores or rejects local %s delivery without invoking a model again", async mode => {
    const input = await nativeFixture();
    const captureBefore = await readFile(path.join(input.captureRoot, "formal-world-capture-receipt.json"));
    let taskRoot = "";
    await expect(runStyledVisualAgent(input, async args => {
      taskRoot = argument(args, "--repo-root");
      await deliver(args, input.ids);
      const outputs = args.flatMap((value, index) => value === "--output" ? [{ remotePath: args[index + 1]!.split("::")[0]! }] : []);
      const stagingRoot = path.join(taskRoot, "local-child");
      for (const row of outputs) {
        await mkdir(path.dirname(path.join(stagingRoot, row.remotePath)), { recursive: true });
        await copyFile(path.join(taskRoot, row.remotePath), path.join(stagingRoot, row.remotePath));
      }
      await retainLocalTaskDelivery({ stagingRoot, evidenceRoot: argument(args, "--delivery-evidence-root"),
        childExitCode: 0, requestId: argument(args, "--request-id"), taskId: argument(args, "--task-id"),
        argumentsHash: hashLocalTaskArguments(args.slice(2)), outputs });
      await rm(stagingRoot, { recursive: true });
      const evidenceRoot = argument(args, "--delivery-evidence-root");
      if (mode === "changed-snapshot") await writeFile(path.join(evidenceRoot, "outputs", outputs[0]!.remotePath), "changed snapshot");
      if (mode === "foreign-request") {
        const report = JSON.parse(await readFile(path.join(evidenceRoot, "report.json"), "utf8"));
        await writeFile(path.join(evidenceRoot, "report.json"), JSON.stringify({ ...report, requestId: "foreign-request" }));
      }
      if (mode === "linked-destination") {
        const destination = path.join(taskRoot, outputs[0]!.remotePath);
        await rm(destination);
        await symlink(input.userFramePath, destination);
      }
      if (mode === "partial-receipt") await rm(path.join(evidenceRoot, "report.json"));
      if (mode === "partial-promotion") {
        for (const row of outputs.slice(1)) await rm(path.join(taskRoot, row.remotePath));
      }
      throw new Error("wrapper interrupted before recording delivery");
    })).rejects.toThrow("wrapper interrupted");
    await expect(access(path.join(taskRoot, "dispatch-delivery.json"))).rejects.toThrow();
    const dispatch = vi.fn();
    const expectedFailure = { "changed-snapshot": "Local delivered output changed or missing",
      "foreign-request": "Local delivery identity mismatch", "linked-destination": "Unsafe visual delivery destination",
      "partial-receipt": "LOCAL_VISUAL_TASK_NOT_DELIVERED" }[mode];
    if (expectedFailure) {
      await expect(runStyledVisualAgent({ ...input, resume: true }, dispatch)).rejects.toThrow(expectedFailure);
      expect(dispatch).not.toHaveBeenCalled();
      expect(await readFile(input.userFramePath)).toEqual(pixels);
      expect(await readFile(path.join(input.captureRoot, "formal-world-capture-receipt.json"))).toEqual(captureBefore);
      await expect(access(path.join(input.sceneRoot, "styled-opening-frame.png"))).rejects.toThrow();
      return;
    }
    await runStyledVisualAgent({ ...input, resume: true }, dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(await readFile(path.join(input.sceneRoot, "styled-opening-frame.png"))).toEqual(pixels);
    expect(await readFile(path.join(input.captureRoot, "formal-world-capture-receipt.json"))).toEqual(captureBefore);
    await runStyledVisualAgent({ ...input, resume: true }, dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("resumes an unknown Cloud task with the same frozen request, task root, arguments and output prefix", async () => {
    const input = { ...await fixture(), backend: "cloud" as const };
    let firstArgs: readonly string[] = [];
    await expect(runStyledVisualAgent(input, async args => {
      firstArgs = [...args];
      const reference = JSON.parse(await readFile(path.join(input.sceneRoot, "visual-task.json"), "utf8"));
      expect(reference.requestId).toBe(argument(args, "--request-id"));
      expect(path.join(input.repoRoot, reference.taskRootRelative)).toBe(argument(args, "--repo-root"));
      throw new Error("creation-outcome-unknown");
    })).rejects.toThrow("creation-outcome-unknown");
    const previousPrefix = process.env.WORLDKIT_LWDP_S3_ROOT;
    process.env.WORLDKIT_LWDP_S3_ROOT = "s3://different/ignored-on-resume";
    try {
      const dispatch = vi.fn(async (args: readonly string[]) => {
        expect(args).toEqual(firstArgs);
        await deliver(args);
      });
      await runStyledVisualAgent({ ...input, resume: true }, dispatch);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(await readFile(path.join(input.sceneRoot, "styled-opening-frame.png"))).toEqual(pixels);
    } finally {
      if (previousPrefix === undefined) delete process.env.WORLDKIT_LWDP_S3_ROOT;
      else process.env.WORLDKIT_LWDP_S3_ROOT = previousPrefix;
    }
  });

  it("replays completed local delivery and Host finalizers without another model invocation", async () => {
    const input = await fixture();
    const output = path.join(input.sceneRoot, "styled-opening-frame.png");
    await symlink(input.userFramePath, output);
    const dispatch = vi.fn((args: readonly string[]) => deliver(args));
    await expect(runStyledVisualAgent(input, dispatch)).rejects.toThrow("Linked visual output");
    await rm(output);
    await runStyledVisualAgent({ ...input, resume: true }, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    // Successful delivery moved the staging outputs; replay restores only exact
    // receipt-hashed live copies, never arbitrary residual images.
    await runStyledVisualAgent({ ...input, resume: true }, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await readFile(output)).toEqual(pixels);
  });

  it("does not turn unknown local execution into another model invocation", async () => {
    const input = await fixture();
    await expect(runStyledVisualAgent(input, async () => { throw new Error("interrupted"); })).rejects.toThrow("interrupted");
    const dispatch = vi.fn();
    await expect(runStyledVisualAgent({ ...input, resume: true }, dispatch)).rejects.toThrow("LOCAL_VISUAL_TASK_NOT_DELIVERED");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(["instruction.txt", "dispatch-args.json", "reference"])("rejects changed %s without resetting the original request", async file => {
    const input = { ...await fixture(), backend: "cloud" as const };
    let taskRoot = "";
    await expect(runStyledVisualAgent(input, async args => {
      taskRoot = argument(args, "--repo-root");
      throw new Error("interrupted");
    })).rejects.toThrow("interrupted");
    if (file === "reference") {
      const referencePath = path.join(input.sceneRoot, "visual-task.json");
      const reference = JSON.parse(await readFile(referencePath, "utf8"));
      await writeFile(referencePath, JSON.stringify({ ...reference, argumentsHash: `sha256:${"0".repeat(64)}` }));
    } else await writeFile(path.join(taskRoot, file), "changed");
    const dispatch = vi.fn();
    await expect(runStyledVisualAgent({ ...input, resume: true }, dispatch)).rejects.toThrow("Visual task reference identity mismatch");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(["receipt-null", "receipt-request", "receipt-output-path", "live-output", "staged-output"])(
    "rejects delivered %s corruption instead of dispatching or accepting residual files", async mutation => {
      const input = { ...await fixture(), backend: "cloud" as const };
      const dispatch = vi.fn((args: readonly string[]) => deliver(args));
      await runStyledVisualAgent(input, dispatch);
      const taskRoot = argument(dispatch.mock.calls[0]![0], "--repo-root");
      const receiptPath = path.join(taskRoot, "dispatch-delivery.json");
      if (mutation.startsWith("receipt")) {
        const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
        if (mutation === "receipt-request") receipt.requestId = "visual-1-abcdef";
        if (mutation === "receipt-output-path") receipt.outputs[0].path = "../../outside.png";
        await writeFile(receiptPath, JSON.stringify(mutation === "receipt-null" ? null : receipt));
      } else {
        const root = mutation === "live-output" ? input.sceneRoot : path.join(taskRoot, `artifacts/scenes/${sceneId}`);
        await writeFile(path.join(root, "styled-opening-frame.png"), "unrelated image");
      }
      dispatch.mockClear();
      await expect(runStyledVisualAgent({ ...input, resume: true }, dispatch)).rejects.toThrow(
        mutation.startsWith("receipt") ? "Visual task delivery identity mismatch" : "Visual delivered output changed");
      expect(dispatch).not.toHaveBeenCalled();
    });

  it("rejects a replaced task reference before finalizing or promoting the original delivery", async () => {
    const input = await fixture();
    await expect(runStyledVisualAgent(input, async args => {
      await deliver(args);
      await writeFile(path.join(input.sceneRoot, "visual-task.json"), "{}");
    })).rejects.toThrow("Visual task reference changed during task");
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame.png"))).rejects.toThrow();
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame-report.json"))).rejects.toThrow();
  });

  it("replays Native full and tri-only deliveries without changing the accepted opening or Capture", async () => {
    const input = await nativeFixture();
    const receiptPath = path.join(input.captureRoot, "formal-world-capture-receipt.json");
    const receiptBefore = await readFile(receiptPath);
    const dispatch = vi.fn((args: readonly string[]) => deliver(args, input.ids));
    await runStyledVisualAgent(input, dispatch);
    await runStyledVisualAgent({ ...input, resume: true }, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const openingBefore = await readFile(path.join(input.sceneRoot, "styled-opening-frame-manifest.json"));
    await runStyledVisualAgent({ ...input, scope: "triviews" }, dispatch);
    await runStyledVisualAgent({ ...input, scope: "triviews", resume: true }, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(await readFile(path.join(input.sceneRoot, "styled-opening-frame-manifest.json"))).toEqual(openingBefore);
    expect(await readFile(receiptPath)).toEqual(receiptBefore);
  });

  it.each(["live", "snapshot"])("rejects %s input drift on resume before invoking the router", async where => {
    const input = { ...await fixture(), backend: "cloud" as const };
    let taskRoot = "";
    await expect(runStyledVisualAgent(input, async args => {
      taskRoot = argument(args, "--repo-root");
      throw new Error("interrupted");
    })).rejects.toThrow("interrupted");
    const file = path.join(where === "live" ? input.repoRoot : taskRoot, `artifacts/scenes/${sceneId}/scene-brief.md`);
    await writeFile(file, "changed brief");
    const dispatch = vi.fn();
    await expect(runStyledVisualAgent({ ...input, resume: true }, dispatch)).rejects.toThrow("Visual resume input changed");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([null, { kind: "worldkit-visual-task-reference", schemaVersion: 1,
    sceneId, scope: "all", sceneSource: "canonical", backend: "cloud", taskRootRelative: "../foreign", requestId: "visual-1-abcdef" }])(
    "rejects invalid resume references without falling back to a fresh task", async reference => {
      const input = { ...await fixture(), backend: "cloud" as const };
      await writeFile(path.join(input.sceneRoot, "visual-task.json"), JSON.stringify(reference));
      const dispatch = vi.fn();
      await expect(runStyledVisualAgent({ ...input, resume: true }, dispatch)).rejects.toThrow("Visual task reference identity mismatch");
      expect(dispatch).not.toHaveBeenCalled();
    });

  it("consumes Native receipt-bound captures without Canonical artifacts and keeps real paths in visual manifests", async () => {
    const input = await nativeFixture();
    const receiptBefore = await readFile(path.join(input.captureRoot, "formal-world-capture-receipt.json"));
    const dispatch = vi.fn(async (args: readonly string[]) => {
      const root = argument(args, "--repo-root");
      const scene = path.join(root, `artifacts/scenes/${sceneId}`);
      expect(args).toContain(`artifacts/scenes/${sceneId}/final/capture/formal-world-capture-receipt.json`);
      await expect(access(path.join(scene, "scene-implementation-map.json"))).rejects.toThrow();
      await expect(access(path.join(scene, "runtime-snapshot.json"))).rejects.toThrow();
      expect(await readFile(path.join(scene, "final/capture/opening.png"))).toEqual(pixels);
      await deliver(args, input.ids);
    });
    await runStyledVisualAgent(input, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const opening = JSON.parse(await readFile(path.join(input.sceneRoot, "styled-opening-frame-manifest.json"), "utf8"));
    expect(opening.whiteboxOpeningFrame.path).toBe("final/capture/opening.png");
    const tri = JSON.parse(await readFile(path.join(input.sceneRoot, "styled-triviews-manifest.json"), "utf8"));
    expect(tri.targets.map((target: { visualTargetId: string }) => target.visualTargetId)).toEqual(input.ids);
    for (const target of tri.targets) {
      expect(target.whiteboxTriview.path).toBe(`final/capture/triviews/${target.visualTargetId}/whitebox-triview.png`);
      expect(sha256Bytes(await readFile(path.join(input.sceneRoot, target.whiteboxTriview.path))))
        .toBe(target.whiteboxTriview.contentHash);
    }
    await runStyledVisualAgent({ ...input, scope: "triviews" }, args => deliver(args, input.ids));
    expect(await readFile(path.join(input.captureRoot, "formal-world-capture-receipt.json"))).toEqual(receiptBefore);
    await expect(access(path.join(input.sceneRoot, "opening-frame.png"))).rejects.toThrow();
  });

  it.each(["opening.png", "triviews/visual-target-1/whitebox-triview.png", "triviews/whitebox-triview-manifest.json"])(
    "rejects stale Native %s before dispatch", async file => {
      const input = await nativeFixture();
      const target = path.join(input.captureRoot, file);
      if (file.endsWith(".json")) {
        const manifest = JSON.parse(await readFile(target, "utf8"));
        manifest.worldBuildIdentityHash = `sha256:${"e".repeat(64)}`;
        await writeFile(target, JSON.stringify(manifest));
      } else await writeFile(target, Buffer.concat([await readFile(target), Buffer.from("changed")]));
      const dispatch = vi.fn();
      await expect(runStyledVisualAgent(input, dispatch)).rejects.toThrow("Native visual capture identity mismatch");
      expect(dispatch).not.toHaveBeenCalled();
    });

  it.each(["scene-brief.md", "visual-identity-palette.json"])("binds Native %s to the frozen Case, not root presentation copies", async file => {
    const input = await nativeFixture();
    await writeFile(path.join(input.sceneRoot, file), "unrelated root copy");
    await runStyledVisualAgent(input, args => deliver(args, input.ids));
    await writeFile(path.join(input.sceneRoot, "inputs", file), "stale frozen input");
    const dispatch = vi.fn();
    await expect(runStyledVisualAgent(input, dispatch)).rejects.toThrow("Native visual capture identity mismatch");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(["live", "snapshot"])("rejects %s Native receipt mutation without changing accepted whitebox or styled results", async where => {
    const input = await nativeFixture();
    const receiptPath = path.join(input.captureRoot, "formal-world-capture-receipt.json");
    const receiptBytes = await readFile(receiptPath);
    const prior = path.join(input.sceneRoot, "styled-opening-frame.png");
    await writeFile(prior, "prior accepted styling");
    const dispatch = vi.fn(async (args: readonly string[]) => {
      await deliver(args, input.ids);
      const target = where === "live" ? receiptPath : path.join(argument(args, "--repo-root"),
        `artifacts/scenes/${sceneId}/final/capture/formal-world-capture-receipt.json`);
      await writeFile(target, Buffer.concat([receiptBytes, Buffer.from("\n")]));
    });
    await expect(runStyledVisualAgent(input, dispatch)).rejects.toThrow("Visual input changed during task");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await readFile(prior, "utf8")).toBe("prior accepted styling");
    expect(await readFile(path.join(input.captureRoot, "opening.png"))).toEqual(pixels);
    if (where === "snapshot") expect(await readFile(receiptPath)).toEqual(receiptBytes);
  });

  it("dispatches once with frozen evidence and the opening-first Skill, then finalizes every output", async () => {
    const input = await fixture();
    const dispatch = vi.fn(async (args: readonly string[]) => {
      expect(argument(args, "--execution-profile")).toBe("formal");
      expect(argument(args, "--backend")).toBe("local");
      expect(argument(args, "--stage")).toBe("visual-reconstruction");
      expect(args.filter(x => x === "--output")).toHaveLength(4);
      const root = argument(args, "--repo-root");
      expect(root).not.toBe(input.repoRoot);
      const instruction = await readFile(argument(args, "--instruction-file"), "utf8");
      expect(instruction).toContain("Only after accepting it, use that exact styled-opening-frame PNG");
      expect(instruction).toContain("at most one regeneration per failing image");
      const skill = await readFile(path.join(root, ".codex/skills/worldkit-visual-reconstructor/SKILL.md"), "utf8");
      expect(skill).toContain("Do not start tri-view generation before inspecting and accepting it");
      expect(skill).not.toContain('"provider":');
      for (let i = 0; i < args.length; i++) if (args[i] === "--asset") {
        const [, source] = args[++i]!.split("::");
        expect(source!.startsWith(root + path.sep)).toBe(true);
        expect(await readFile(source!)).toEqual(pixels);
      }
      await expect(access(path.join(input.sceneRoot, "styled-opening-frame-manifest.json"))).rejects.toThrow();
      await deliver(args);
    });
    await runStyledVisualAgent(input, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const manifest = JSON.parse(await readFile(path.join(input.sceneRoot, "styled-triviews-manifest.json"), "utf8"));
    expect(manifest.targets.map((t: { visualTargetId: string }) => t.visualTargetId)).toEqual(targetIds);
    expect(manifest.targets[0].views).toEqual(["front", "right", "back"]);
    const taskRoot = argument(dispatch.mock.calls[0]![0], "--repo-root");
    expect(JSON.parse(await readFile(path.join(taskRoot, "dispatch-args.json"), "utf8")))
      .toEqual(dispatch.mock.calls[0]![0]);
    await expect(access(path.join(taskRoot, `artifacts/scenes/${sceneId}/styled-opening-frame.png`))).rejects.toThrow();
  });

  it("does not redispatch after the router fails or replace existing accepted visuals", async () => {
    const input = await fixture();
    await writeFile(path.join(input.sceneRoot, "styled-opening-frame.png"), "prior accepted bytes");
    const dispatch = vi.fn(async () => { throw new Error("provider terminal"); });
    await expect(runStyledVisualAgent(input, dispatch)).rejects.toThrow("provider terminal");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await readFile(path.join(input.sceneRoot, "styled-opening-frame.png"), "utf8")).toBe("prior accepted bytes");
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame-report.json"))).rejects.toThrow();
  });

  it("preserves old Cloud retries, timeout cap, prior attempts and backoff through the actual dispatched stage", async () => {
    const input = await fixture();
    const dispatch = vi.fn(async (args: readonly string[]) => {
      const stage = argument(args, "--stage");
      // Exercise the router's actual Node ESM policy, without a model or network.
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
        import { canRetryTerminalTask, resolveTerminalTaskRetryPolicy, terminalTaskRetryDelayMs }
          from "./scripts/agents/lwdp-codex-task-retry.mjs";
        const stage = process.argv[1];
        const policy = resolveTerminalTaskRetryPolicy(stage, undefined, {});
        const configured = resolveTerminalTaskRetryPolicy(stage, undefined, {
          WORLDKIT_VISUAL_RECONSTRUCTION_MAX_ATTEMPTS: "2",
          WORLDKIT_LWDP_VISUAL_PRIOR_ATTEMPTS: "1",
          WORLDKIT_VISUAL_RECONSTRUCTION_RETRY_DELAY_MS: "42",
        });
        console.log(JSON.stringify({ maximumAttempts: policy.maximumAttempts,
          delays: [1, 2].map(i => terminalTaskRetryDelayMs(policy, i)),
          capacity: [1, 2, 3].map(i => canRetryTerminalTask(policy, i, "capacity")),
          timeout: [1, 2].map(i => canRetryTerminalTask(policy, i, "task-timeout")),
          unknown: canRetryTerminalTask(policy, 1, null), configured,
          exhausted: canRetryTerminalTask(configured, 1, "capacity") }));
      `, stage], { encoding: "utf8", timeout: 10_000 });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ maximumAttempts: 3,
        delays: [30_000, 120_000], capacity: [true, true, false], timeout: [true, false],
        unknown: false, configured: { stage, maximumAttempts: 2, priorAttempts: 1, baseDelayMs: 42 },
        exhausted: false,
      });
      await deliver(args);
    });
    await runStyledVisualAgent({ ...input, backend: "cloud" }, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it.each(["live", "snapshot"])("rejects changed %s input before replacing any visual output", async (where) => {
    const input = await fixture();
    await expect(runStyledVisualAgent(input, async args => {
      await deliver(args);
      const root = where === "live" ? input.repoRoot : argument(args, "--repo-root");
      await writeFile(path.join(root, `artifacts/scenes/${sceneId}/scene-brief.md`), "changed");
    })).rejects.toThrow("Visual input changed during task");
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame.png"))).rejects.toThrow();
  });

  it("rejects an incomplete delivery before promoting opening or writing passed", async () => {
    const input = await fixture();
    await expect(runStyledVisualAgent(input, async args => {
      await deliver(args);
      await rm(path.join(argument(args, "--repo-root"), `artifacts/scenes/${sceneId}/triviews/palace/styled-triview.png`));
    })).rejects.toThrow();
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame.png"))).rejects.toThrow();
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame-report.json"))).rejects.toThrow();
  });

  it("reuses the accepted opening exactly for tri-views-only and rejects a stale anchor before dispatch", async () => {
    const input = await fixture();
    await runStyledVisualAgent(input, args => deliver(args));
    const before = await readFile(path.join(input.sceneRoot, "styled-opening-frame-manifest.json"));
    const dispatch = vi.fn(async (args: readonly string[]) => {
      expect(args.filter(x => x === "--output")).toHaveLength(2);
      expect(args.some(x => x.startsWith("styled-opening-frame::"))).toBe(true);
      expect(await readFile(argument(args, "--instruction-file"), "utf8")).toContain("already accepted");
      await deliver(args);
    });
    await runStyledVisualAgent({ ...input, scope: "triviews" }, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await readFile(path.join(input.sceneRoot, "styled-opening-frame-manifest.json"))).toEqual(before);
    await writeFile(path.join(input.sceneRoot, "styled-opening-frame.png"), Buffer.concat([pixels, Buffer.from("changed")]));
    await expect(runStyledVisualAgent({ ...input, scope: "triviews" }, dispatch)).rejects.toThrow("acceptance is missing or stale");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("routes the public first-frame entry to the same task and removes concurrent Gemini generation", async () => {
    const source = await readFile("scripts/visual/run-styled-opening-frame-agent.sh", "utf8");
    expect(source).toContain("run-styled-visual-agent.ts");
    expect(source).not.toContain("run-gemini-visual-pipeline.py");
  });

  it("rejects tri-views-only when a whitebox target changed since opening acceptance", async () => {
    const input = await fixture();
    await runStyledVisualAgent(input, args => deliver(args));
    await writeFile(path.join(input.sceneRoot, "triviews/palace/whitebox-triview.png"),
      Buffer.concat([pixels, Buffer.from("changed target")]));
    const dispatch = vi.fn((args: readonly string[]) => deliver(args));
    await expect(runStyledVisualAgent({ ...input, scope: "triviews" }, dispatch)).rejects.toThrow("acceptance is missing or stale");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(["local", "cloud"] as const)("passes %s formal router preflight without spawning a model", async backend => {
    const input = await fixture();
    const dispatch = vi.fn(async (args: readonly string[]) => {
      const result = spawnSync(process.execPath, [path.resolve("scripts/agents/run-codex-task.mjs"), ...args], {
        encoding: "utf8", timeout: 30_000,
        env: { ...process.env, WORLDKIT_LOCAL_CODEX_SMOKE: "1", WORLDKIT_LWDP_CLIENT_SMOKE: "1" },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`WORLDKIT_CODEX_BACKEND ${backend}`);
      expect(result.stdout).toContain("profile=formal model=gpt-5.6-sol reasoning=xhigh");
      await deliver(args);
    });
    await runStyledVisualAgent({ ...input, backend }, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
