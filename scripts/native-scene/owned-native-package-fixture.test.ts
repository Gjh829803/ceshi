import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOwnedNativePackageFixtureV1 } from
  "./owned-native-package-fixture.js";

let testRootPath: string;
let fixtureDirectoryPath: string;

async function missing(absolutePath: string): Promise<boolean> {
  try {
    await lstat(absolutePath);
    return false;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
}

beforeEach(async () => {
  testRootPath = await realpath(await mkdtemp(
    process.platform === "win32"
      ? path.join(tmpdir(), "worldkit-owned-native-fixture-test-")
      : "/tmp/wk-owned-native-",
  ));
  fixtureDirectoryPath = path.join(testRootPath, "fixture");
  await mkdir(path.join(fixtureDirectoryPath, "native"), {
    recursive: true,
    mode: 0o755,
  });
  await Promise.all([
    chmod(fixtureDirectoryPath, 0o755),
    chmod(path.join(fixtureDirectoryPath, "native"), 0o755),
    writeFile(
      path.join(fixtureDirectoryPath, "world-package-build-receipt.json"),
      "receipt\n",
      { mode: 0o644 },
    ),
    writeFile(
      path.join(fixtureDirectoryPath, "native/scene.mjs"),
      "export default {};\n",
      { mode: 0o644 },
    ),
  ]);
});

afterEach(async () => {
  await rm(testRootPath, { recursive: true, force: true });
});

describe("owner-only Native Package fixture", () => {
  it("copies exact bytes with 0700 directories and 0600 files, then disposes idempotently", async () => {
    const owned = await createOwnedNativePackageFixtureV1({
      fixtureDirectoryPath,
    });
    const temporaryRootPath = path.dirname(owned.packageDirectoryPath);

    expect((await lstat(temporaryRootPath)).mode & 0o777).toBe(0o700);
    expect((await lstat(owned.packageDirectoryPath)).mode & 0o777).toBe(0o700);
    expect((await lstat(path.join(
      owned.packageDirectoryPath,
      "native",
    ))).mode & 0o777).toBe(0o700);
    expect((await lstat(path.join(
      owned.packageDirectoryPath,
      "world-package-build-receipt.json",
    ))).mode & 0o777).toBe(0o600);
    expect((await lstat(path.join(
      owned.packageDirectoryPath,
      "native/scene.mjs",
    ))).mode & 0o777).toBe(0o600);
    await expect(readFile(path.join(
      owned.packageDirectoryPath,
      "native/scene.mjs",
    ), "utf8")).resolves.toBe("export default {};\n");

    await owned.dispose();
    await owned.dispose();
    expect(await missing(temporaryRootPath)).toBe(true);
  });

  it("rejects a symlinked root, nested symlink, and special node", async () => {
    const linkedRootPath = path.join(testRootPath, "linked-root");
    await symlink(fixtureDirectoryPath, linkedRootPath);
    await expect(createOwnedNativePackageFixtureV1({
      fixtureDirectoryPath: linkedRootPath,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_BUILD_FIXTURE_INVALID");

    const externalPath = path.join(testRootPath, "external.txt");
    await writeFile(externalPath, "external\n");
    const nestedLinkPath = path.join(fixtureDirectoryPath, "linked.txt");
    await symlink(externalPath, nestedLinkPath);
    await expect(createOwnedNativePackageFixtureV1({
      fixtureDirectoryPath,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_BUILD_FIXTURE_INVALID");
    await rm(nestedLinkPath);

    if (process.platform !== "win32") {
      const socketPath = path.join(fixtureDirectoryPath, "special.sock");
      const server = net.createServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
      });
      try {
        await expect(createOwnedNativePackageFixtureV1({
          fixtureDirectoryPath,
        })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_BUILD_FIXTURE_INVALID");
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => error === undefined ? resolve() : reject(error))
        );
      }
    }
  });
});
