import assert from "node:assert/strict";
import test from "node:test";

import {
  cloudArtifactByPath,
  projectAwsEnvironment,
  readRemoteS3Artifact,
  redirectToPresignedCloudArtifact,
  validateCloudArtifactManifest,
} from "./remote-cloud-artifacts.mjs";

const HASH = `sha256:${"a".repeat(64)}`;

test("validates and freezes a bounded Cloud artifact manifest", () => {
  const manifest = validateCloudArtifactManifest({
    kind: "worldkit-cloud-artifact-manifest",
    schemaVersion: 1,
    sceneId: "cloud-scene-001",
    executionId: "execution-001",
    stageId: "scene-production",
    workerImage: `worker@sha256:${"b".repeat(64)}`,
    artifacts: [{
      path: "scene/authoring.json",
      contentType: "application/json",
      byteSize: 128,
      sha256: HASH,
      s3Uri: "s3://worldkit-test/execution/scene/authoring.json",
      required: true,
    }],
  }, {
    expectedExecutionId: "execution-001",
    expectedSceneId: "cloud-scene-001",
  });
  assert.equal(manifest.artifacts.length, 1);
  assert.equal(cloudArtifactByPath({ remoteArtifacts: manifest.artifacts }, "scene/authoring.json")?.sha256, HASH);
  assert.throws(() => validateCloudArtifactManifest({
    ...manifest,
    artifacts: [{ ...manifest.artifacts[0], path: "scene/../secret" }],
  }), /unsafe/);
});

test("redirects large media to a short-lived S3 URL for native Range playback", async () => {
  const headers = {};
  const response = {
    writeHead(status, values) {
      this.status = status;
      Object.assign(headers, values);
    },
    end() {},
  };
  const ok = await redirectToPresignedCloudArtifact(response, {
    s3Uri: "s3://worldkit-test/episode/segment-00.mp4",
  }, {
    repoRoot: "/repo/worldkit",
    execFileImplementation: (_command, args, options, callback) => {
      assert.deepEqual(args, [
        "s3", "presign", "s3://worldkit-test/episode/segment-00.mp4",
        "--expires-in", "900",
      ]);
      assert.equal(options.env.AWS_SHARED_CREDENTIALS_FILE,
        "/repo/worldkit/.codex-tmp/runtime-config/aws-credentials");
      callback(null, "https://signed.example.test/video\n", "");
    },
  });
  assert.equal(ok, true);
  assert.equal(response.status, 307);
  assert.equal(headers.location, "https://signed.example.test/video");
});

test("forces AWS reads through project-local credential files", () => {
  const environment = projectAwsEnvironment("/repo/worldkit", {
    PATH: "/bin",
    AWS_ACCESS_KEY_ID: "ambient",
    AWS_SECRET_ACCESS_KEY: "ambient-secret",
    AWS_PROFILE: "ambient-profile",
  });
  assert.equal(environment.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(environment.AWS_PROFILE, undefined);
  assert.equal(
    environment.AWS_SHARED_CREDENTIALS_FILE,
    "/repo/worldkit/.codex-tmp/runtime-config/aws-credentials",
  );
});

test("admits Episode manifests only inside the episode namespace", () => {
  const manifest = validateCloudArtifactManifest({
    kind: "worldkit-cloud-artifact-manifest",
    schemaVersion: 1,
    sceneId: "cloud-scene-001",
    episodeId: "episode-cloud-scene-001-a1b2c3",
    executionId: "execution-episode-001",
    stageId: "episode-production",
    artifacts: [{
      path: "episode/whitebox/segment-00.mp4",
      contentType: "video/mp4",
      byteSize: 1024,
      sha256: HASH,
      s3Uri: "s3://worldkit-test/episode/whitebox/segment-00.mp4",
      required: true,
    }],
  }, {
    expectedExecutionId: "execution-episode-001",
    expectedSceneId: "cloud-scene-001",
    expectedEpisodeId: "episode-cloud-scene-001-a1b2c3",
  });
  assert.equal(manifest.episodeId, "episode-cloud-scene-001-a1b2c3");
  assert.throws(() => validateCloudArtifactManifest({
    ...manifest,
    artifacts: [{ ...manifest.artifacts[0], path: "scene/authoring.json" }],
  }), /unsafe/);
});

test("keeps Scene limits narrow while admitting bounded media-heavy Episodes", () => {
  const base = {
    kind: "worldkit-cloud-artifact-manifest",
    schemaVersion: 1,
    sceneId: "cloud-scene-001",
    executionId: "execution-episode-001",
    stageId: "episode-production",
    artifacts: [{
      path: "episode/bundle/review.zip",
      contentType: "application/zip",
      byteSize: 3 * 1024 * 1024 * 1024,
      sha256: HASH,
      s3Uri: "s3://worldkit-test/episode/bundle/review.zip",
      required: true,
    }],
  };
  assert.doesNotThrow(() => validateCloudArtifactManifest({
    ...base,
    episodeId: "episode-cloud-scene-001-a1b2c3",
  }));
  assert.throws(() => validateCloudArtifactManifest({
    ...base,
    artifacts: [{ ...base.artifacts[0], path: "scene/world.build.json" }],
  }), /aggregate byte limit/);
});

test("reads S3 bytes without writing a durable local artifact", async () => {
  let invocation = null;
  const bytes = await readRemoteS3Artifact("s3://worldkit-test/a.json", {
    repoRoot: "/repo/worldkit",
    maximumBytes: 64,
    execFileImplementation: async (...arguments_) => {
      invocation = arguments_;
      return Buffer.from("{\"ok\":true}");
    },
  });
  assert.equal(bytes.toString("utf8"), "{\"ok\":true}");
  assert.deepEqual(invocation[1], [
    "s3", "cp", "--only-show-errors", "s3://worldkit-test/a.json", "-",
  ]);
});
