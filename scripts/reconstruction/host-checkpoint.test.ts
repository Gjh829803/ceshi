import { mkdtemp, mkdir, readFile, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { readHostCheckpointV1, writeHostCheckpointV1, resolveHostAttemptArtifactV1 } from "./host-checkpoint.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const attemptRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "host-checkpoint-"))); roots.push(attemptRoot);
  await mkdir(path.join(attemptRoot, "source"));
  await writeFile(path.join(attemptRoot, "source/scene.ts"), "frozen-source");
  const input = { attemptRoot, stage: "generate" as const, inputIdentity: { requestId: "same-request" } };
  await writeHostCheckpointV1({ ...input, result: { outcome: "completed" }, artifactRoots: ["source"] });
  return input;
}
it("rehydrates completed bytes and rejects changed input or source", async () => {
  const input = await fixture();
  expect(await readHostCheckpointV1(input)).toEqual({ outcome: "completed" });
  await expect(readHostCheckpointV1({ ...input, inputIdentity: {} })).rejects.toThrow("CHECKPOINT_INVALID");
  await writeFile(path.join(input.attemptRoot, "source/scene.ts"), "changed");
  await expect(readHostCheckpointV1(input)).rejects.toThrow("CHECKPOINT_INVALID");
});
it("detects added source, symlinks, tampered payload, and immutable checkpoint replacement", async () => {
  const input = await fixture();
  await expect(writeHostCheckpointV1({ ...input, result: {}, artifactRoots: ["source"] })).rejects.toThrow();
  const file = path.join(input.attemptRoot, "host-checkpoints/generate.json");
  const original = await readFile(file, "utf8");
  await writeFile(file, original.replace('"completed"', '"failed"'));
  await expect(readHostCheckpointV1(input)).rejects.toThrow("CHECKPOINT_INVALID");
  await writeFile(file, original);
  await writeFile(path.join(input.attemptRoot, "source/added.ts"), "unrecorded");
  await expect(readHostCheckpointV1(input)).rejects.toThrow("CHECKPOINT_INVALID");
  await unlink(path.join(input.attemptRoot, "source/added.ts"));
  await symlink(path.join(input.attemptRoot, "source/scene.ts"), path.join(input.attemptRoot, "source/other.ts"));
  await expect(readHostCheckpointV1(input)).rejects.toThrow("CHECKPOINT_INVALID");
});
it.each(["package", "capture", "evaluate"] as const)("rehydrates only the exact passed %s stage artifacts and inputs", async (stage) => {
  const input = await fixture();
  const stageRoot = `host-recoveries/2/${stage}`;
  await mkdir(path.join(input.attemptRoot, stageRoot), { recursive: true });
  await writeFile(path.join(input.attemptRoot, stageRoot, "receipt.json"), "owner-receipt");
  const identity = { previousStageHash: "frozen-upstream", attemptIndex: 0 };
  const saved = { ...input, stage, inputIdentity: identity };
  await writeHostCheckpointV1({ ...saved, result: { outcome: "completed", receiptRef: `${stageRoot}/receipt.json` }, artifactRoots: [stageRoot] });
  expect(await readHostCheckpointV1(saved)).toMatchObject({ outcome: "completed" });
  await expect(readHostCheckpointV1({ ...saved, inputIdentity: { ...identity, previousStageHash: "changed" } })).rejects.toThrow("CHECKPOINT_INVALID");
  await writeFile(path.join(input.attemptRoot, stageRoot, "receipt.json"), "changed-owner-receipt");
  await expect(readHostCheckpointV1(saved)).rejects.toThrow("CHECKPOINT_INVALID");
});
it("restricts recovered output refs to the exact Run/Attempt and named artifact", () => {
  const input = { runRoot: "/case/runs/run-a", caseRef: "artifact://world-reconstruction-case/case/case.json", attemptIndex: 0, fileName: "capture/formal-world-capture-receipt.json" };
  const prefix = "artifact://world-reconstruction-case/case/runs/run-a/attempts/0/";
  expect(resolveHostAttemptArtifactV1({ ...input, artifactRef: `${prefix}host-recoveries/2/${input.fileName}` })).toBe(`/case/runs/run-a/attempts/0/host-recoveries/2/${input.fileName}`);
  for (const relative of ["../capture/formal-world-capture-receipt.json", "host-recoveries/0/capture/formal-world-capture-receipt.json", "source/scene.ts", "capture/formal-world-capture-receiptXjson"]) {
    expect(() => resolveHostAttemptArtifactV1({ ...input, artifactRef: prefix + relative })).toThrow("CHECKPOINT_INVALID");
  }
});
