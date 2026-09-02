import assert from "node:assert/strict";
import test from "node:test";

import {
  cloudEpisodeRunIndexS3Uri,
  cloudSceneRunIndexS3Uri,
  listCloudSceneRunIndexRecords,
  listCloudEpisodeRunIndexRecords,
  parseCloudEpisodeRunIndexRecord,
  readCloudEpisodeRunIndexRecord,
  readCloudSceneRunIndexRecord,
  writeCloudSceneRunIndexRecord,
  writeCloudEpisodeRunIndexRecord,
} from "../../../scripts/lib/cloud-production-run-index.mjs";

function record(overrides = {}) {
  return {
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    backend: "cloud",
    sceneId: "scene-001",
    episodeId: "episode-scene-001",
    status: "running",
    recordRevision: 3,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:01:00.000Z",
    ...overrides,
  };
}

test("cloud run-index uses one stable S3 projection per Episode", () => {
  assert.equal(
    cloudEpisodeRunIndexS3Uri("s3://bucket/cloud-episodes", "episode-scene-001"),
    "s3://bucket/cloud-episodes/control/run-index/episodes/episode-scene-001/record.json",
  );
  assert.equal(parseCloudEpisodeRunIndexRecord(record()).recordRevision, 3);
  assert.throws(() => parseCloudEpisodeRunIndexRecord({ ...record(), recordRevision: 0 }));
});

test("cloud Scene run-index closes the whitebox-world control record", async () => {
  const scene = {
    id: "scene-001",
    sceneId: "scene-001",
    codexBackend: "cloud",
    status: "running",
    recordRevision: 2,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:01:00.000Z",
  };
  assert.equal(
    cloudSceneRunIndexS3Uri("s3://bucket/cloud-scenes", scene.sceneId),
    "s3://bucket/cloud-scenes/control/run-index/scenes/scene-001/record.json",
  );
  const writes = [];
  await writeCloudSceneRunIndexRecord(scene, {
    outputS3Root: "s3://bucket/cloud-scenes",
    uploadImplementation: async (_path, uri) => writes.push(uri),
  });
  assert.deepEqual(writes, [
    "s3://bucket/cloud-scenes/control/run-index/scenes/scene-001/record.json",
  ]);
  const read = await readCloudSceneRunIndexRecord(scene.sceneId, {
    repoRoot: "/repo",
    outputS3Root: "s3://bucket/cloud-scenes",
    readImplementation: async () => Buffer.from(JSON.stringify(scene)),
  });
  assert.equal(read.sceneId, scene.sceneId);
  const listed = await listCloudSceneRunIndexRecords({
    repoRoot: "/repo",
    outputS3Root: "s3://bucket/cloud-scenes",
    execFileImplementation: async () => ({ stdout: JSON.stringify({
      Contents: [{ Key: "cloud-scenes/control/run-index/scenes/scene-001/record.json" }],
    }) }),
    readImplementation: async () => Buffer.from(JSON.stringify(scene)),
  });
  assert.equal(listed.length, 1);
});

test("cloud run-index writes a hash-closed remote projection", async () => {
  const uploads = [];
  const result = await writeCloudEpisodeRunIndexRecord(record(), {
    outputS3Root: "s3://bucket/cloud-episodes",
    uploadImplementation: async (localPath, s3Uri) => {
      uploads.push({ localPath, s3Uri });
    },
  });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].s3Uri, result.s3Uri);
  assert.match(result.sha256, /^sha256:[a-f0-9]{64}$/);
});

test("cloud run-index reads one Episode without local durable state", async () => {
  const value = await readCloudEpisodeRunIndexRecord("episode-scene-001", {
    repoRoot: "/repo",
    outputS3Root: "s3://bucket/root",
    readImplementation: async () => Buffer.from(JSON.stringify(record())),
  });
  assert.equal(value.episodeId, "episode-scene-001");
});

test("cloud run-index lists valid records and ignores malformed projections", async () => {
  const payloads = new Map([
    ["s3://bucket/root/control/run-index/episodes/episode-scene-001/record.json",
      Buffer.from(JSON.stringify(record()))],
    ["s3://bucket/root/control/run-index/episodes/bad/record.json",
      Buffer.from("{}")],
  ]);
  const records = await listCloudEpisodeRunIndexRecords({
    repoRoot: "/repo",
    outputS3Root: "s3://bucket/root",
    execFileImplementation: async () => ({ stdout: JSON.stringify({
      Contents: [...payloads.keys()].map((s3Uri) => ({
        Key: new URL(s3Uri).pathname.slice(1),
      })),
    }) }),
    readImplementation: async (s3Uri) => payloads.get(s3Uri),
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].episodeId, "episode-scene-001");
});
