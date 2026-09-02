import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { submitCloudEpisode } from "./submit-worldkit-cloud-episode.mjs";

const config = {
  baseUrl: "https://lwdp.example.test",
  token: "secret",
  userId: "worldkit-studio",
};

test("submits one coarse Episode worker stage bound to an admitted Scene manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "worldkit-cloud-episode-submit-"));
  const requestPath = join(root, "request.json");
  const uploads = [];
  const requests = [];
  try {
    const result = await submitCloudEpisode({
      sceneId: "scene-cloud-001",
      episodeId: "episode-scene-cloud-001-a1b2c3",
      sceneExecutionId: "exec-scene-001",
      sceneManifestS3Uri: "s3://bucket/scene/cloud-artifact-manifest.json",
      sceneRecord: {
        id: "scene-cloud-001",
        sceneId: "scene-cloud-001",
        status: "ready",
        remoteExecutionId: "exec-scene-001",
        remoteArtifactAdmission: { status: "passed", executionId: "exec-scene-001" },
      },
      productionScope: "visual-sample",
      styleVariantMode: "legacy",
      workerImage: `worker@sha256:${"d".repeat(64)}`,
      resumeEpisodeManifest: {
        executionId: "exec-episode-prior",
        s3Uri: "s3://bucket/episodes/prior/cloud-artifact-manifest.json",
      },
      requestId: "episode-scene-cloud-001-a1b2c3-run-1",
      outputS3Prefix: "s3://bucket/episodes/episode-scene-cloud-001-a1b2c3",
      cloudConfig: config,
      requestPath,
      uploadOptions: {
        execFileImplementation: (_command, args, _options, callback) => {
          uploads.push(args);
          callback(null, "", "");
        },
      },
      fetchImplementation: async (url, init) => {
        requests.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
        if (url.endsWith("/dispatch")) {
          return new Response(JSON.stringify({ dispatch_accepted: true }), { status: 200 });
        }
        return new Response(JSON.stringify({
          execution: { execution_id: "exec-episode-001", status: "queued" },
        }), { status: 201 });
      },
    });
    assert.equal(result.executionId, "exec-episode-001");
    assert.equal(uploads.length, 1);
    const request = JSON.parse(await readFile(requestPath, "utf8"));
    assert.equal(request.kind, "worldkit-cloud-episode-request");
    assert.equal(request.sceneExecutionId, "exec-scene-001");
    assert.equal(request.pipeline.command, "episode:run");
    assert.equal(request.productionScope, "visual-sample");
    assert.equal(request.styleVariantMode, "legacy");
    assert.equal(request.workerImage, `worker@sha256:${"d".repeat(64)}`);
    assert.equal(request.resumeEpisodeManifest.executionId, "exec-episode-prior");
    assert.equal(requests[0].body.kind, "episode");
    assert.deepEqual(requests[0].body.stages, [{
      stage_id: "episode-production",
      executor: "worker",
      max_attempts: 3,
      timeout_seconds: 43_200,
    }]);
    assert.ok(requests[0].body.inputs.some((input) =>
      input.role === "trusted-scene-artifact-manifest"));
    assert.ok(requests[0].body.inputs.some((input) =>
      input.role === "prior-episode-artifact-manifest"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
