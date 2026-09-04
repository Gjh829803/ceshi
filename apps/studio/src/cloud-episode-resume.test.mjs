import assert from "node:assert/strict";
import test from "node:test";

import { resolveLatestCompatibleCloudEpisodeManifest } from "./cloud-episode-resume.mjs";

const record = {
  sceneId: "scene-001",
  episodeId: "episode-scene-001-aabbcc",
  remoteOutputS3Prefix: "s3://bucket/cloud-episodes/scene-001/episode-scene-001-aabbcc",
  resumedFromEpisodeManifestS3Uri: "s3://bucket/legacy/capture.json",
};

test("resume selects the latest completed effect checkpoint before capture", async () => {
  const visited = [];
  const result = await resolveLatestCompatibleCloudEpisodeManifest({
    record,
    readManifest: async (s3Uri) => {
      visited.push(s3Uri);
      if (!s3Uri.includes("episode-style-prompts/attempt-1")) {
        throw Object.assign(new Error("not found"), { status: 404 });
      }
      return {
        kind: "worldkit-cloud-artifact-manifest",
        executionId: "exec-prior",
        stageId: "episode-style-prompts",
        executionPart: "style-prompts",
        workerImage: `worker@sha256:${"a".repeat(64)}`,
      };
    },
  });
  assert.equal(result.stageId, "episode-style-prompts");
  assert.equal(result.executionId, "exec-prior");
  assert.equal(visited.some((value) => value.includes("whitebox-capture")), false);
});

test("resume falls back to the inherited manifest when no newer stage exists", async () => {
  const result = await resolveLatestCompatibleCloudEpisodeManifest({
    record,
    readManifest: async (s3Uri) => {
      if (s3Uri !== record.resumedFromEpisodeManifestS3Uri) {
        throw Object.assign(new Error("not found"), { status: 404 });
      }
      return {
        kind: "worldkit-cloud-artifact-manifest",
        executionId: "exec-capture",
        stageId: "whitebox-capture",
        executionPart: "capture",
        workerImage: `worker@sha256:${"b".repeat(64)}`,
      };
    },
  });
  assert.equal(result.s3Uri, record.resumedFromEpisodeManifestS3Uri);
  assert.equal(result.executionId, "exec-capture");
});

