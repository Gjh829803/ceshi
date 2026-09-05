import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { admitCreatorSources, creatorSteeringYawDelta, CreatorTools, sha256 } from "./tools.js";
import { executeCreatorTool } from "./mcp.js";

// These are Host boundary tests. Real browser, Havok and visual evidence have a
// separate integration lane; mocks below must never count as a playtest.
const directories: string[] = [];
async function workspace() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "creator-tools-contract-"));
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("Creator source admission", () => {
  it("snapshots a local cyclic helper graph and preserves actual source bytes", async () => {
    const directory = await workspace();
    const scene = "import { value } from './helper.js';\nexport default { build() { return value; } };\n";
    const helper = "import type {} from './scene.js';\nexport const value = 7;\n";
    await writeFile(path.join(directory, "scene.ts"), scene);
    await writeFile(path.join(directory, "helper.ts"), helper);
    expect([...await admitCreatorSources(directory)]).toEqual([["scene.ts", scene], ["helper.ts", helper]]);
  });

  it("rejects outside paths, dynamic imports and competing runtime authority", async () => {
    const directory = await workspace();
    for (const source of [
      "import '../outside.js';",
      "export default { build() { return import('./helper.js'); } };",
      "export default { build(context) { context.scene.activeCamera = null; } };",
      "export default { build() { return Math.random(); } };",
      "import { Engine } from '@babylonjs/core/Engines/engine.js';",
      "import fs from 'node:fs';",
    ]) {
      await writeFile(path.join(directory, "scene.ts"), source);
      await expect(admitCreatorSources(directory)).rejects.toThrow(/CREATOR_/);
    }
  });

  it("rejects a local-looking import whose parent directory is a symlink outside the workspace", async () => {
    const directory = await workspace();
    const outside = await workspace();
    await writeFile(path.join(outside, "helper.ts"), "export const external = 1;\n");
    await symlink(outside, path.join(directory, "linked"), "dir");
    await writeFile(path.join(directory, "scene.ts"), "export { external } from './linked/helper.js';\n");
    await expect(admitCreatorSources(directory)).rejects.toThrow(/CREATOR_/);
  });
});

describe("Creator operations", () => {
  it("steers asymmetric and wraparound target directions using Babylon's actual Y rotation convention", () => {
    for (const [forward, target] of [
      [[0, 0, -1], [8, 0]],
      [[0, 0, -1], [-8, 0]],
      [[0.31, 0, -0.95], [-11, 7]],
      [[-0.01, 0, 1], [0.02, 9]],
    ] as const) {
      const delta = creatorSteeringYawDelta(forward, target);
      const rotated = Vector3.TransformNormal(Vector3.FromArray(forward), Matrix.RotationY(delta)).normalize();
      const expected = new Vector3(target[0], 0, target[1]).normalize();
      expect(rotated.x).toBeCloseTo(expected.x, 6);
      expect(rotated.z).toBeCloseTo(expected.z, 6);
      expect(Math.abs(delta)).toBeLessThanOrEqual(Math.PI);
    }
  });

  it("serializes work and lets a later operation finish after an earlier failure", async () => {
    const service = new CreatorTools(await workspace());
    const events: string[] = [];
    const first = await service.start("first", async () => { events.push("first"); throw new Error("fixture failure"); });
    const second = await service.start("second", async () => { events.push("second"); return { actual: 2 }; });
    try {
      expect(await service.getOperation(first.id, 2)).toMatchObject({ status: "failed", error: "fixture failure" });
      expect(await service.getOperation(second.id, 2)).toMatchObject({ status: "succeeded", result: { actual: 2 } });
      expect(events).toEqual(["first", "second"]);
      expect(JSON.parse(await readFile(path.join(service.evidenceRoot, "operations", `${second.id}.json`), "utf8"))).toMatchObject({ status: "succeeded" });
      await expect(service.getOperation("../../other")).rejects.toThrow(/CREATOR_OPERATION_ID_INVALID/);
    } finally { await service.close(); }
  });

  it("cancelling queued work does not close the active operation's browser", async () => {
    const service = new CreatorTools(await workspace());
    let release!: () => void;
    let announceStarted!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { announceStarted = resolve; });
    const first = await service.start("active", async () => { announceStarted(); await held; return "completed"; });
    await started;
    const queuedWork = vi.fn(async () => "should not execute");
    const queued = await service.start("queued", queuedWork);
    const closeSession = vi.spyOn(service as any, "closeSession").mockResolvedValue(undefined);
    try {
      await service.cancel(queued.id);
      expect(closeSession).not.toHaveBeenCalled();
    } finally {
      release();
      expect(await service.getOperation(first.id, 2)).toMatchObject({ status: "succeeded" });
      expect(await service.getOperation(queued.id, 2)).toMatchObject({ status: "cancelled" });
      expect(queuedWork).not.toHaveBeenCalled();
      await service.close();
    }
  });
});

describe("Creator submit and protocol admission", () => {
  it("does not accept a fabricated succeeded operation read from disk", async () => {
    const service = new CreatorTools(await workspace());
    const id = "op-11111111-1111-4111-8111-111111111111";
    const operations = path.join(service.evidenceRoot, "operations");
    await mkdir(operations, { recursive: true });
    await writeFile(path.join(operations, `${id}.json`), JSON.stringify({ id, type: "world.submit", status: "succeeded", result: { status: "submitted" } }));
    try { await expect(service.getOperation(id)).rejects.toThrow(/CREATOR_OPERATION_/); }
    finally { await service.close(); }
  });

  it("does not trust a playtest report written into the model's workspace", async () => {
    const directory = await workspace();
    const service = new CreatorTools(directory);
    const sourceHash = sha256("a fixture, not a real runtime result");
    const root = path.join(service.evidenceRoot, sourceHash.slice(7, 23));
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "playtest-report.json"), JSON.stringify({
      status: "passed", sourceHash, actualSimulationSeconds: 180,
      targetCount: 3, uniqueFiveMeterCells: 15, maximumDistanceFromSpawnMeters: 30,
    }));
    vi.spyOn(service, "prepare").mockResolvedValue({ id: "fixture", sourceHash, root, config: { id: "fixture" } } as Awaited<ReturnType<CreatorTools["prepare"]>>);
    const preview = vi.spyOn(service, "preview").mockRejectedValue(new Error("TEST_MUST_NOT_REACH_PREVIEW"));
    try {
      await expect(service.submit()).rejects.toThrow(/CREATOR_SUBMIT_REQUIRES_PASSING_180_SECOND_PLAYTEST/);
      expect(preview).not.toHaveBeenCalled();
    } finally { await service.close(); }
  });

  it("rejects malformed MCP arguments before starting expensive work", async () => {
    const service = new CreatorTools(await workspace());
    const start = vi.spyOn(service, "start");
    try {
      for (const [name, input] of [
        ["world_preview", { view: "imagined-preview" }],
        ["world_playtest", { durationSeconds: 0 }],
        ["world_playtest", { framesPerSecond: 60 }],
        ["world_submit", { trustThisReport: true }],
        ["assets_describe", {}],
      ] as const) await expect(executeCreatorTool(service, name, input)).rejects.toThrow(/CREATOR_TOOL_INPUT_INVALID/);
      expect(start).not.toHaveBeenCalled();
    } finally { await service.close(); }
  });

  it("refuses submission if the recorded playtest video was replaced after the Host sealed it", async () => {
    const directory = await realpath(await workspace());
    const service = new CreatorTools(directory);
    const sourceHash = sha256("fixture source identity");
    const root = path.join(service.evidenceRoot, sourceHash.slice(7, 23));
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "playtest.mp4"), "replacement bytes");
    vi.spyOn(service, "prepare").mockResolvedValue({ id: "fixture", sourceHash, root, config: { id: "fixture" }, sealedFiles: {} } as Awaited<ReturnType<CreatorTools["prepare"]>>);
    vi.spyOn(service, "preview").mockResolvedValue({} as Awaited<ReturnType<CreatorTools["preview"]>>);
    vi.spyOn(service, "triviews").mockResolvedValue({} as Awaited<ReturnType<CreatorTools["triviews"]>>);
    Object.assign(service, {
      lastPlaytest: { sourceHash, report: { status: "passed", actualSimulationSeconds: 180, targetCount: 3, uniqueFiveMeterCells: 15, maximumDistanceFromSpawnMeters: 30 } },
      lastPlaytestFiles: { "playtest.mp4": sha256("original captured bytes") },
    });
    try { await expect(service.submit()).rejects.toThrow(/CREATOR_ARTIFACT_MODIFIED: playtest.mp4/); }
    finally { await service.close(); }
  });
});
