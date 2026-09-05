import { randomBytes, timingSafeEqual } from "node:crypto";
import { tsImport } from "tsx/esm/api";

const { isNativeRecordingRequest } = await tsImport("../../../scripts/lib/native-recording-binding.ts", { parentURL: import.meta.url });

export function createNativeRecordingPreviews({ resolveWorld, studioOrigin, startServer, copyPackage } = {}) {
  const entries = new Map();
  const flights = new Map();
  const capabilities = new Map();
  let closed = false;

  async function performOpen(sceneId) {
    if (closed) throw new Error("NATIVE_RECORDING_PREVIEW_CLOSED");
    const world = await resolveWorld(sceneId);
    if (!world) throw new Error("NATIVE_RECORDING_WORLD_UNAVAILABLE");
    const previous = entries.get(sceneId);
    if (previous?.binding.worldPackageRootHash === world.worldPackageRootHash) return { url: previous.handle.url };
    await previous?.dispose();
    const copy = copyPackage ?? (await tsImport("../../../scripts/native-scene/owned-native-package-fixture.ts", { parentURL: import.meta.url })).createOwnedNativePackageFixtureV1;
    const start = startServer ?? (await tsImport("../../../scripts/lib/worldkit-server.ts", { parentURL: import.meta.url })).startWorldkitServer;
    const owned = await copy({ fixtureDirectoryPath: world.packageDirectoryPath });
    let handle;
    try {
      if (closed) throw new Error("NATIVE_RECORDING_PREVIEW_CLOSED");
      const binding = { sceneId, worldPackageRootHash: world.worldPackageRootHash,
        studioOrigin: studioOrigin(), capability: randomBytes(32).toString("hex") };
      handle = await start({ source: { kind: "world-package", packageDirectoryPath: owned.packageDirectoryPath },
        recordingBinding: binding });
      const current = await resolveWorld(sceneId);
      if (closed || current?.worldPackageRootHash !== binding.worldPackageRootHash ||
          handle.worldPackageRootHash !== binding.worldPackageRootHash || handle.sceneSourceKind !== "babylon-native-scene") {
        throw new Error("NATIVE_RECORDING_PREVIEW_STALE");
      }
      let disposal;
      const entry = { binding, handle, dispose() {
        if (disposal) return disposal;
        capabilities.delete(binding.capability);
        if (entries.get(sceneId) === entry) entries.delete(sceneId);
        disposal = (async () => { try { await handle.stop(); } finally { await owned.dispose(); } })();
        return disposal;
      } };
      entries.set(sceneId, entry); capabilities.set(binding.capability, entry);
      void handle.waitForExit().then(() => entry.dispose(), () => entry.dispose()).catch(() => {});
      return { url: handle.url };
    } catch (error) {
      try { await handle?.stop(); } finally { await owned.dispose(); }
      throw error;
    }
  }

  return {
    open(sceneId) {
      if (flights.has(sceneId)) return flights.get(sceneId);
      const promise = performOpen(sceneId);
      flights.set(sceneId, promise);
      const remove = () => { if (flights.get(sceneId) === promise) flights.delete(sceneId); };
      void promise.then(remove, remove);
      return promise;
    },
    async authorize(capability, method, pathname) {
      if (closed || typeof capability !== "string" || !/^[a-f0-9]{64}$/.test(capability)) return false;
      const entry = capabilities.get(capability);
      if (!entry || !timingSafeEqual(Buffer.from(entry.binding.capability), Buffer.from(capability)) ||
          !isNativeRecordingRequest(entry.binding.sceneId, method, pathname)) return false;
      const world = await resolveWorld(entry.binding.sceneId);
      return !closed && capabilities.get(capability) === entry && world?.worldPackageRootHash === entry.binding.worldPackageRootHash
        ? Object.freeze({ sceneId: entry.binding.sceneId, worldPackageRootHash: entry.binding.worldPackageRootHash }) : false;
    },
    async shutdown() {
      closed = true;
      await Promise.allSettled([...flights.values()]);
      await Promise.all([...entries.values()].map(entry => entry.dispose()));
    },
  };
}
