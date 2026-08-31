import { canonicalJsonBytes } from "@whitebox-world/protocol";
import {
  createBabylonNativeWorldPackageV1,
  type WorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { createBabylonNativeWorldPackageTestInputV1 } from
  "@whitebox-world/world-package/testing";
import {
  chmod,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readWorldPackageDirectoryV1,
  writeWorldPackageDirectoryV1,
} from "./file-world-package.js";
import { createWorldPackageBrowserTransportV1 } from
  "./world-package-browser-transport.js";

const READ_LIMITS = Object.freeze({
  maximumTotalBytes: 16 * 1024 * 1024,
  maximumFileCount: 256,
});

let testRootPath: string;
let packageDirectoryPath: string;
let packageDirectory: WorldPackageDirectoryV1;

async function publishFixture(): Promise<void> {
  packageDirectory = createBabylonNativeWorldPackageV1(
    createBabylonNativeWorldPackageTestInputV1(),
  );
  packageDirectoryPath = path.join(testRootPath, "world-package");
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: packageDirectoryPath,
    directory: packageDirectory,
  });
}

async function replaceBytes(
  relativePath: string,
  transform: (bytes: Uint8Array) => Uint8Array,
): Promise<void> {
  const absolutePath = path.join(packageDirectoryPath, relativePath);
  const original = new Uint8Array(await readFile(absolutePath));
  await writeFile(absolutePath, transform(original), { mode: 0o600 });
}

beforeEach(async () => {
  testRootPath = await realpath(
    await mkdtemp(path.join(tmpdir(), "world-package-browser-transport-")),
  );
  await chmod(testRootPath, 0o700);
  await publishFixture();
});

afterEach(async () => {
  await chmod(testRootPath, 0o700).catch(() => undefined);
  await rm(testRootPath, { recursive: true, force: true });
});

describe("WorldPackage browser transport", () => {
  it("exposes only fresh copies of receipt-listed immutable bytes", async () => {
    const transport = await createWorldPackageBrowserTransportV1({
      packageDirectoryPath,
    });
    const expectedSceneBytes = packageDirectory.files.find(
      (file) => file.path === "native/scene.mjs",
    )!.bytes;

    expect(transport.worldPackageRootHash).toBe(
      packageDirectory.receipt.worldPackageRootHash,
    );
    expect(transport.sceneSourceKind).toBe("babylon-native-scene");
    expect(JSON.parse(new TextDecoder().decode(
      await transport.readReceipt(),
    ))).toEqual(packageDirectory.receipt);
    expect(transport.fileIntegrityEntries).toEqual(
      packageDirectory.receipt.fileIntegrityEntries,
    );
    const first = await transport.read("native/scene.mjs");
    expect(first).toEqual(expectedSceneBytes);
    first[0] = first[0] === 0 ? 1 : 0;
    await expect(transport.read("native/scene.mjs"))
      .resolves.toEqual(expectedSceneBytes);

    for (const unadmittedPath of [
      "../package.json",
      "/etc/passwd",
      "native/../scene.mjs",
      "native\\scene.mjs",
      "native//scene.mjs",
      "world-package-build-receipt.json",
    ]) {
      await expect(transport.read(unadmittedPath)).rejects.toThrow(
        "WORLD_PACKAGE_BROWSER_PATH_UNADMITTED",
      );
    }

    transport.dispose();
    transport.dispose();
    await expect(transport.readReceipt()).rejects.toThrow(
      "WORLD_PACKAGE_BROWSER_TRANSPORT_DISPOSED",
    );
    await expect(transport.read("native/scene.mjs")).rejects.toThrow(
      "WORLD_PACKAGE_BROWSER_TRANSPORT_DISPOSED",
    );
  });

  it("rejects a symlinked Package root and a symlinked receipt-listed file", async () => {
    const linkedRootPath = path.join(testRootPath, "linked-package");
    await symlink(packageDirectoryPath, linkedRootPath);
    await expect(createWorldPackageBrowserTransportV1({
      packageDirectoryPath: linkedRootPath,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");

    const scenePath = path.join(packageDirectoryPath, "native/scene.mjs");
    const externalScenePath = path.join(testRootPath, "external-scene.mjs");
    await rename(scenePath, externalScenePath);
    await symlink(externalScenePath, scenePath);
    await expect(createWorldPackageBrowserTransportV1({
      packageDirectoryPath,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");
  });

  it("rejects unlisted files and wrong hash, size, or media inventory", async () => {
    await writeFile(
      path.join(packageDirectoryPath, "unlisted.txt"),
      "not admitted\n",
      { mode: 0o600 },
    );
    await expect(createWorldPackageBrowserTransportV1({
      packageDirectoryPath,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");

    await rm(packageDirectoryPath, { recursive: true, force: true });
    await publishFixture();
    await replaceBytes("native/scene.mjs", (bytes) => {
      const changed = new Uint8Array(bytes);
      changed[0] = changed[0] === 0 ? 1 : 0;
      return changed;
    });
    await expect(createWorldPackageBrowserTransportV1({
      packageDirectoryPath,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");

    await rm(packageDirectoryPath, { recursive: true, force: true });
    await publishFixture();
    await replaceBytes("native/scene.mjs", (bytes) =>
      new Uint8Array([...bytes, 0]));
    await expect(createWorldPackageBrowserTransportV1({
      packageDirectoryPath,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");

    await rm(packageDirectoryPath, { recursive: true, force: true });
    await publishFixture();
    const receipt = structuredClone(packageDirectory.receipt);
    const entry = receipt.fileIntegrityEntries.find(
      (candidate) => candidate.path === "native/scene.mjs",
    )!;
    (entry as { mediaType: string }).mediaType = "application/octet-stream";
    await writeFile(
      path.join(packageDirectoryPath, "world-package-build-receipt.json"),
      canonicalJsonBytes(receipt),
      { mode: 0o600 },
    );
    await writeFile(
      path.join(packageDirectoryPath, "integrity.json"),
      canonicalJsonBytes(receipt.fileIntegrityEntries),
      { mode: 0o600 },
    );
    await expect(createWorldPackageBrowserTransportV1({
      packageDirectoryPath,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");
  });

  it("fails closed when Package bytes drift after verification", async () => {
    const transport = await createWorldPackageBrowserTransportV1({
      packageDirectoryPath,
    });
    await replaceBytes("native/scene.mjs", (bytes) => {
      const changed = new Uint8Array(bytes);
      changed[0] = changed[0] === 0 ? 1 : 0;
      return changed;
    });

    await expect(transport.read("native/scene.mjs")).rejects.toThrow(
      "WORLD_PACKAGE_BROWSER_PACKAGE_DRIFTED",
    );
    expect(transport.worldPackageRootHash).toBe(
      packageDirectory.receipt.worldPackageRootHash,
    );
  });

  it("does not serve a replaced valid Package with a different Root", async () => {
    const transport = await createWorldPackageBrowserTransportV1({
      packageDirectoryPath,
    });
    const originalRootHash = transport.worldPackageRootHash;
    const replacement = createBabylonNativeWorldPackageV1(
      createBabylonNativeWorldPackageTestInputV1({
        packageId: "replacement.package",
        worldId: "replacement-world",
      }),
    );
    await rm(packageDirectoryPath, { recursive: true, force: true });
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: packageDirectoryPath,
      directory: replacement,
    });

    await expect(transport.read("native/scene.mjs")).rejects.toThrow(
      "WORLD_PACKAGE_BROWSER_PACKAGE_DRIFTED",
    );
    expect(transport.worldPackageRootHash).toBe(originalRootHash);

    const replayed = await readWorldPackageDirectoryV1({
      packageDirectoryPath,
      ...READ_LIMITS,
    });
    expect(replayed.receipt.worldPackageRootHash).toBe(
      replacement.receipt.worldPackageRootHash,
    );
  });
});
