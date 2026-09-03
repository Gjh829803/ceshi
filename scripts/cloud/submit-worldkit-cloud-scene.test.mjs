import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  submitCloudScene,
  submitCloudSceneFromExistingRequest,
} from "./submit-worldkit-cloud-scene.mjs";

const config = {
  baseUrl: "https://lwdp.example.test",
  token: "secret",
  userId: "worldkit-studio",
};

test("uploads immutable inputs before creating one effect-preserving worker stage", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-submit-test-"));
  const imagePath = join(temporaryRoot, "input.png");
  const requestPath = join(temporaryRoot, "request.json");
  await writeFile(imagePath, "image-bytes");
  const uploads = [];
  const requests = [];
  try {
    const result = await submitCloudScene({
      sceneId: "scene-cloud-001",
      prompt: "Preserve the scene.",
      images: [imagePath],
      requestId: "request-cloud-001",
      outputS3Prefix: "s3://bucket/worldkit/scene-cloud-001/request-cloud-001",
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
          execution: { execution_id: "exec-cloud-001", status: "queued" },
        }), { status: 201 });
      },
    });
    assert.equal(result.executionId, "exec-cloud-001");
    assert.equal(uploads.length, 2);
    const request = JSON.parse(await readFile(requestPath, "utf8"));
    assert.equal(request.prompt, "Preserve the scene.");
    assert.match(request.references[0].sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(requests[0].body.stages.length, 1);
    assert.deepEqual(requests[0].body.stages[0], {
      stage_id: "scene-production",
      executor: "worker",
      max_attempts: 3,
      timeout_seconds: 21_600,
    });
    assert.equal(requests[0].body.max_concurrency, 1);
    assert.equal(requests[1].method, "POST");
    assert.match(requests[1].url, /\/dispatch$/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("creates a fresh execution from an immutable prior Cloud request", async () => {
  const requests = [];
  const sourceRequestSource = `${JSON.stringify({
    kind: "worldkit-cloud-scene-request",
    schemaVersion: 1,
    sceneId: "scene-cloud-rebuild",
    prompt: "Reuse these exact Scene inputs.",
    references: [{
      fileName: "reference-0.png",
      contentType: "image/png",
      byteName: "reference.png",
      sha256: `sha256:${"a".repeat(64)}`,
      s3Uri: "s3://bucket/source/inputs/references/reference-0.png",
    }],
  }, null, 2)}\n`;
  const result = await submitCloudSceneFromExistingRequest({
    sceneId: "scene-cloud-rebuild",
    sourceRequestSource,
    sourceRequestS3Uri: "s3://bucket/source/inputs/request.json",
    requestId: "scene-cloud-rebuild-attempt-2",
    outputS3Prefix: "s3://bucket/current/attempt-2",
    autoDispatch: false,
    cloudConfig: config,
    fetchImplementation: async (url, init) => {
      requests.push({ url, method: init.method, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({
        execution: { execution_id: "exec-cloud-rebuild", status: "queued" },
      }), { status: 201 });
    },
  });
  assert.equal(result.executionId, "exec-cloud-rebuild");
  assert.equal(result.requestS3Uri, "s3://bucket/source/inputs/request.json");
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.inputs, [{
    role: "worldkit-cloud-scene-request",
    path: "inputs/request.json",
    s3_uri: "s3://bucket/source/inputs/request.json",
    content_type: "application/json",
  }, {
    role: "user-reference-image",
    path: "inputs/references/reference-0.png",
    s3_uri: "s3://bucket/source/inputs/references/reference-0.png",
    content_type: "image/png",
  }]);
  assert.equal(requests[0].body.output_s3_prefix, "s3://bucket/current/attempt-2");
});
