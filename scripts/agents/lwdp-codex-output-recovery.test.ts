import { describe, expect, it } from "vitest";
import path from "node:path";

import {
  expectedLateCodexOutputPaths,
  recoverSucceededCodexJobOutputs,
  resolveLateCodexOutputUris,
} from "../lib/lwdp-codex-output-recovery.mjs";

describe("late LWDP Codex output recovery", () => {
  it("locks Planner and Builder recovery to their exact declared outputs", () => {
    const sceneId = "late-world";
    const taskId = "builder-late-world";
    const expected = expectedLateCodexOutputPaths(sceneId, "builder");
    const outputUris = expected.map((relativePath) =>
      `s3://worldkit/jobs/tasks/${taskId}/${relativePath}`);
    expect(
      resolveLateCodexOutputUris({ sceneId, stage: "builder", taskId, outputUris })
        .map(({ relativePath }) => relativePath),
    ).toEqual(expected);
    expect(() => resolveLateCodexOutputUris({
      sceneId,
      stage: "builder",
      taskId,
      outputUris: [...outputUris, `s3://worldkit/jobs/tasks/${taskId}/../../record.json`],
    })).toThrow(/outside the builder recovery contract/);
  });

  it("locks visual recovery to the whitebox manifest's complete target set", () => {
    const sceneId = "late-visual-world";
    const taskId = "visual-late-world";
    const visualTargetIds = ["visual-target-1", "visual-target-2"];
    const expected = expectedLateCodexOutputPaths(sceneId, "visual", {
      visualTargetIds,
    });
    expect(expected).toEqual([
      `artifacts/scenes/${sceneId}/visual-generation-prompts.json`,
      `artifacts/scenes/${sceneId}/styled-opening-frame.png`,
      `artifacts/scenes/${sceneId}/triviews/visual-target-1/styled-triview.png`,
      `artifacts/scenes/${sceneId}/triviews/visual-target-2/styled-triview.png`,
    ]);
    const outputUris = expected.map((relativePath) =>
      `s3://worldkit/jobs/tasks/${taskId}/${relativePath}`);
    expect(resolveLateCodexOutputUris({
      sceneId,
      stage: "visual",
      taskId,
      outputUris,
      visualTargetIds,
    }).map(({ relativePath }) => relativePath)).toEqual(expected);
    expect(() => resolveLateCodexOutputUris({
      sceneId,
      stage: "visual",
      taskId,
      outputUris: [...outputUris,
        `s3://worldkit/jobs/tasks/${taskId}/artifacts/scenes/${sceneId}/triviews/other/styled-triview.png`],
      visualTargetIds,
    })).toThrow(/outside the visual recovery contract/);
  });

  it("downloads a successful late job only after validating its task and output set", async () => {
    const repoRoot = path.resolve("/tmp/worldkit-late-recovery-test");
    const sceneId = "late-planner-world";
    const taskId = "planner-late-task";
    const outputUris = expectedLateCodexOutputPaths(sceneId, "planner").map((relativePath) =>
      `s3://worldkit/jobs/tasks/${taskId}/${relativePath}`);
    const downloads: Array<{ s3Uri: string; localPath: string }> = [];
    const result = await recoverSucceededCodexJobOutputs({
      jobId: "gen_late123",
      repoRoot,
      sceneId,
      stage: "planner",
      config: { baseUrl: "https://example.invalid", token: "test", userId: "test" },
      requestImplementation: async () => ({ status: "succeeded", counters: { succeeded: 1 } }),
      itemsImplementation: async () => ({
        items: [{
          item_id: taskId,
          status: "succeeded",
          metadata: { output_uris: outputUris },
        }],
      }),
      downloadImplementation: async (s3Uri: string, localPath: string) => {
        downloads.push({ s3Uri, localPath });
        return { s3Uri, localPath, size: 10 };
      },
    });
    expect(result.status).toBe("recovered");
    expect(downloads).toHaveLength(4);
    expect(downloads.every(({ localPath }) => localPath.startsWith(`${repoRoot}${path.sep}`))).toBe(true);
  });

  it("keeps a non-terminal late job pending instead of treating its absent item as failure", async () => {
    await expect(recoverSucceededCodexJobOutputs({
      jobId: "gen_pending123",
      repoRoot: path.resolve("/tmp/worldkit-late-recovery-test"),
      sceneId: "late-builder-world",
      stage: "builder",
      config: { baseUrl: "https://example.invalid", token: "test", userId: "test" },
      requestImplementation: async () => ({
        status: "running",
        counters: { total: 1, queued: 1, running: 0 },
      }),
      itemsImplementation: async () => ({ items: [] }),
    })).rejects.toMatchObject({
      code: "LWDP_JOB_PENDING",
      jobId: "gen_pending123",
    });
  });
});
