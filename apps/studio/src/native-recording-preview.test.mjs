import assert from "node:assert/strict";
import { test } from "node:test";
import { createNativeRecordingPreviews } from "./native-recording-preview.mjs";

function fixture() {
  let world = { worldPackageRootHash: `sha256:${"a".repeat(64)}`, packageDirectoryPath: "/original/package" };
  const starts = []; const releases = []; const stops = [];
  const exits = [];
  const manager = createNativeRecordingPreviews({
    resolveWorld: async () => world,
    studioOrigin: () => "http://127.0.0.1:3000",
    copyPackage: async input => ({ packageDirectoryPath: `${input.fixtureDirectoryPath}.owned`, dispose: async () => { releases.push(input); } }),
    startServer: async input => {
      starts.push(input);
      const exited = new Promise(resolve => { exits.push(resolve); });
      return { url: "http://127.0.0.1:5000/?hosted=1", worldPackageRootHash: input.recordingBinding.worldPackageRootHash,
        sceneSourceKind: "babylon-native-scene", waitForExit: () => exited,
        stop: async () => { stops.push(input); } };
    },
  });
  return { manager, starts, stops, releases, exits, setWorld(value) { world = value; } };
}

test("deduplicates Native recording launch and retains only scene-scoped authorization", async () => {
  const f = fixture();
  try {
    const results = await Promise.all([f.manager.open("palace"), f.manager.open("palace")]);
    assert.equal(f.starts.length, 1);
    assert.deepEqual(results[0], { url: "http://127.0.0.1:5000/?hosted=1" });
    assert.equal(f.starts[0].source.packageDirectoryPath, "/original/package.owned");
    const cap = f.starts[0].recordingBinding.capability;
    assert.equal(JSON.stringify(results).includes(cap), false);
    assert.deepEqual(await f.manager.authorize(cap, "POST", "/api/recording-worlds/palace/recordings"),
      { sceneId: "palace", worldPackageRootHash: f.starts[0].recordingBinding.worldPackageRootHash });
    for (const route of ["/api/worlds", "/api/worlds/palace/recording-preview", "/api/recording-worlds/another/recordings"]) {
      assert.equal(await f.manager.authorize(cap, "POST", route), false);
    }
    assert.equal(await f.manager.authorize("0".repeat(64), "GET", "/api/recording-worlds/palace/recordings"), false);
    f.setWorld(null);
    assert.equal(await f.manager.authorize(cap, "POST", "/api/recording-worlds/palace/recordings"), false);
  } finally { await f.manager.shutdown(); }
  assert.equal(f.stops.length, 1); assert.equal(f.releases.length, 1);
});
test("replaces a changed Package without retaining the old capability", async () => {
  const f = fixture();
  try {
    await f.manager.open("palace");
    const cap = f.starts[0].recordingBinding.capability;
    f.setWorld({ worldPackageRootHash: `sha256:${"b".repeat(64)}`, packageDirectoryPath: "/next/package" });
    await f.manager.open("palace");
    assert.equal(f.starts.length, 2); assert.equal(f.stops.length, 1);
    assert.equal(await f.manager.authorize(cap, "GET", "/api/recording-worlds/palace/recordings"), false);
  } finally { await f.manager.shutdown(); }
  assert.equal(f.releases.length, 2);
});
test("revokes a naturally exited server and permits a new explicit launch", async () => {
  const f = fixture();
  try {
    await f.manager.open("palace");
    const cap = f.starts[0].recordingBinding.capability;
    f.exits[0](0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await f.manager.authorize(cap, "GET", "/api/recording-worlds/palace/recordings"), false);
    await f.manager.open("palace");
    assert.equal(f.starts.length, 2);
  } finally { await f.manager.shutdown(); }
});
test("cleans up a startup crossing shutdown without returning a usable page", async () => {
  let release;
  let stopped = 0; let copiedDisposed = 0;
  const started = new Promise(resolve => { release = resolve; });
  const manager = createNativeRecordingPreviews({
    resolveWorld: async () => ({ packageDirectoryPath: "/package", worldPackageRootHash: `sha256:${"a".repeat(64)}` }),
    studioOrigin: () => "http://127.0.0.1:3000",
    copyPackage: async () => ({ packageDirectoryPath: "/owned", dispose: async () => { copiedDisposed++; } }),
    startServer: async () => { await started; return { stop: async () => { stopped++; } }; },
  });
  const opening = manager.open("palace");
  await new Promise(resolve => setImmediate(resolve));
  const rejected = assert.rejects(opening, /STALE/);
  const shutdown = manager.shutdown(); release();
  await rejected; await shutdown;
  assert.equal(stopped, 1); assert.equal(copiedDisposed, 1);
  await assert.rejects(manager.open("palace"), /CLOSED/);
});
