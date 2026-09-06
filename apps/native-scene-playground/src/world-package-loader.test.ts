import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalJsonBytes } from "@whitebox-world/protocol";
import { createBabylonNativeWorldPackageV1 } from "@whitebox-world/world-package";
import { createBabylonNativeWorldPackageTestInputV1 } from "@whitebox-world/world-package/testing";
import { loadVerifiedNativeWorldPackageV1 } from "./world-package-loader.js";

afterEach(() => vi.unstubAllGlobals());

describe("Native Package loading progress", () => {
  it("reports completed transfers while a remaining file body is still loading", async () => {
    const directory = createBabylonNativeWorldPackageV1(createBabylonNativeWorldPackageTestInputV1());
    const base = new URL("http://localhost/__worldkit/native-package/");
    const heldPath = "native/scene.mjs";
    let finishHeldBody!: () => void;
    vi.stubGlobal("fetch", async (url: URL) => {
      const filePath = url.pathname.slice(base.pathname.length);
      if (filePath === "world-package-build-receipt.json") return new Response(new Uint8Array(canonicalJsonBytes(directory.receipt)));
      const file = directory.files.find(row => row.path === filePath)!;
      if (filePath !== heldPath) return new Response(new Uint8Array(file.bytes));
      return new Response(new ReadableStream({ start(controller) {
        finishHeldBody = () => { controller.enqueue(new Uint8Array(file.bytes)); controller.close(); };
      } }));
    });
    let completedTransfers = 0;
    const pending = loadVerifiedNativeWorldPackageV1(base, () => { completedTransfers += 1; });
    // Receipt plus all but one listed file; an uncompleted body is not progress.
    try {
      await vi.waitFor(() => expect(completedTransfers).toBe(directory.receipt.fileIntegrityEntries.length));
    } finally { finishHeldBody(); }
    const verified = await pending;
    expect(completedTransfers).toBe(directory.receipt.fileIntegrityEntries.length + 1);
    expect(verified.receipt.worldPackageRootHash).toBe(directory.receipt.worldPackageRootHash);
  });

  it("keeps full verification when the advisory observer throws", async () => {
    const directory = createBabylonNativeWorldPackageV1(createBabylonNativeWorldPackageTestInputV1());
    const base = new URL("http://localhost/__worldkit/native-package/");
    vi.stubGlobal("fetch", async (url: URL) => {
      const filePath = url.pathname.slice(base.pathname.length);
      return new Response(filePath === "world-package-build-receipt.json"
        ? new Uint8Array(canonicalJsonBytes(directory.receipt))
        : new Uint8Array(directory.files.find(row => row.path === filePath)!.bytes));
    });
    let observerCalls = 0;
    const verified = await loadVerifiedNativeWorldPackageV1(base, () => { observerCalls += 1; throw new Error("observer unavailable"); });
    expect(observerCalls).toBe(directory.receipt.fileIntegrityEntries.length + 1);
    expect(verified.receipt.worldPackageRootHash).toBe(directory.receipt.worldPackageRootHash);
  });

  it("does not turn completed transfers into admission of tampered file bytes", async () => {
    const directory = createBabylonNativeWorldPackageV1(createBabylonNativeWorldPackageTestInputV1());
    const base = new URL("http://localhost/__worldkit/native-package/");
    vi.stubGlobal("fetch", async (url: URL) => {
      const filePath = url.pathname.slice(base.pathname.length);
      if (filePath === "world-package-build-receipt.json") return new Response(new Uint8Array(canonicalJsonBytes(directory.receipt)));
      const bytes = new Uint8Array(directory.files.find(row => row.path === filePath)!.bytes);
      if (filePath === "native/scene.mjs") bytes[0] = bytes[0]! ^ 1;
      return new Response(bytes);
    });
    let progress = 0;
    await expect(loadVerifiedNativeWorldPackageV1(base, () => { progress += 1; })).rejects.toThrow(/WORLD_PACKAGE/);
    expect(progress).toBe(directory.receipt.fileIntegrityEntries.length + 1);
  });
});
