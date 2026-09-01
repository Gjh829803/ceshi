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

import { afterEach, describe, expect, it } from "vitest";

import {
  buildNativeScenePlaygroundV1,
  parseNativeScenePlaygroundBuildArgumentsV1,
} from "./build-native-scene-playground.js";

const cleanupPaths: string[] = [];

interface FakeRepositoryV1 {
  readonly repositoryRootPath: string;
  readonly fixtureDirectoryPath: string;
  readonly markerPath: string;
}

async function missing(absolutePath: string): Promise<boolean> {
  try {
    await lstat(absolutePath);
    return false;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
}

async function createFakeRepository(
  behavior: "success" | "failure" | "wait",
): Promise<FakeRepositoryV1> {
  const repositoryRootPath = await realpath(await mkdtemp(
    process.platform === "win32"
      ? path.join(tmpdir(), "worldkit-native-build-test-")
      : "/tmp/wk-native-build-",
  ));
  cleanupPaths.push(repositoryRootPath);
  const fixtureDirectoryPath = path.join(repositoryRootPath, "fixture");
  const fixtureNativeDirectoryPath = path.join(fixtureDirectoryPath, "native");
  await mkdir(fixtureNativeDirectoryPath, { recursive: true, mode: 0o755 });
  await Promise.all([
    chmod(fixtureDirectoryPath, 0o755),
    chmod(fixtureNativeDirectoryPath, 0o755),
    writeFile(
      path.join(fixtureDirectoryPath, "world-package-build-receipt.json"),
      "fixture-receipt\n",
      { mode: 0o644 },
    ),
    writeFile(
      path.join(fixtureNativeDirectoryPath, "scene.mjs"),
      "export default {};\n",
      { mode: 0o644 },
    ),
  ]);

  const markerPath = path.join(repositoryRootPath, "vite-invocation.json");
  const viteCliPath = path.join(
    repositoryRootPath,
    "node_modules/vite/bin/vite.js",
  );
  const configPath = path.join(
    repositoryRootPath,
    "apps/native-scene-playground/vite.config.ts",
  );
  await Promise.all([
    mkdir(path.dirname(viteCliPath), { recursive: true }),
    mkdir(path.dirname(configPath), { recursive: true }),
  ]);
  await writeFile(configPath, "export default {};\n");
  await writeFile(viteCliPath, [
    'const { lstatSync, readdirSync, readFileSync, writeFileSync } = require("node:fs");',
    'const path = require("node:path");',
    "function inventory(root, relative = \"\") {",
    "  const absolute = relative.length === 0 ? root : path.join(root, relative);",
    "  const status = lstatSync(absolute);",
    "  const row = { path: relative, mode: status.mode & 0o777, kind: status.isDirectory() ? \"directory\" : status.isFile() ? \"file\" : \"other\" };",
    "  if (!status.isDirectory()) return [row];",
    "  return [row, ...readdirSync(absolute).sort().flatMap((name) => inventory(root, relative.length === 0 ? name : `${relative}/${name}`))];",
    "}",
    "const packagePath = process.env.WORLDKIT_NATIVE_PACKAGE_PATH;",
    "const marker = {",
    "  args: process.argv.slice(2),",
    "  cwd: process.cwd(),",
    "  environment: {",
    "    packagePath,",
    "    nonce: process.env.WORLDKIT_AUTHORING_SERVER_NONCE,",
    "    role: process.env.WORLDKIT_NATIVE_SERVER_ROLE,",
    "    serverInstanceId: process.env.WORLDKIT_NATIVE_SERVER_INSTANCE_ID,",
    "    cacheRootPath: process.env.WORLDKIT_NATIVE_VITE_CACHE_ROOT,",
    "    verifierProbe: process.env.WORLDKIT_NATIVE_VERIFIER_PROBE,",
    "    shellOrigin: process.env.WORLDKIT_HOSTED_SHELL_ORIGIN,",
    "    runtimeOrigin: process.env.WORLDKIT_HOSTED_RUNTIME_ORIGIN,",
    "  },",
    "  inventory: inventory(packagePath),",
    "  receipt: readFileSync(path.join(packagePath, \"world-package-build-receipt.json\"), \"utf8\"),",
    "};",
    `writeFileSync(${JSON.stringify(markerPath)}, JSON.stringify(marker));`,
    behavior === "wait"
      ? "setInterval(() => undefined, 1_000);"
      : `process.exit(${behavior === "success" ? 0 : 7});`,
    "",
  ].join("\n"));

  return { repositoryRootPath, fixtureDirectoryPath, markerPath };
}

async function waitForFile(
  absolutePath: string,
  timeoutMilliseconds = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (await missing(absolutePath)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${absolutePath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((target) =>
    rm(target, { recursive: true, force: true })
  ));
});

describe("Native Scene Playground build wrapper", () => {
  it("requires exactly one explicit fixture argument", () => {
    expect(parseNativeScenePlaygroundBuildArgumentsV1([
      "--fixture",
      "fixtures/native-package",
    ])).toEqual({ fixtureDirectoryPath: "fixtures/native-package" });

    for (const invalid of [
      [],
      ["--fixture"],
      ["--fixture", ""],
      ["--fixture", " one-sided-space"],
      ["--unknown", "fixture"],
      ["--fixture", "one", "--fixture", "two"],
    ]) {
      expect(() => parseNativeScenePlaygroundBuildArgumentsV1(invalid))
        .toThrow("WORLDKIT_NATIVE_SCENE_BUILD_USAGE");
    }
  });

  it("builds from an owner-only copy with exact Vite arguments and closed environment", async () => {
    const fixture = await createFakeRepository("success");

    await buildNativeScenePlaygroundV1({
      repositoryRootPath: fixture.repositoryRootPath,
      fixtureDirectoryPath: fixture.fixtureDirectoryPath,
    });

    const invocation = JSON.parse(await readFile(fixture.markerPath, "utf8")) as {
      readonly args: readonly string[];
      readonly cwd: string;
      readonly environment: Readonly<{
        packagePath: string;
        nonce: string;
        role: string;
        serverInstanceId: string;
        cacheRootPath: string;
        verifierProbe: string;
        shellOrigin: string;
        runtimeOrigin: string;
      }>;
      readonly inventory: readonly Readonly<{
        path: string;
        mode: number;
        kind: string;
      }>[];
      readonly receipt: string;
    };
    expect(invocation.args).toEqual([
      "build",
      "--config",
      path.join(
        fixture.repositoryRootPath,
        "apps/native-scene-playground/vite.config.ts",
      ),
      "--configLoader",
      "runner",
    ]);
    expect(invocation.cwd).toBe(path.join(
      fixture.repositoryRootPath,
      "apps/native-scene-playground",
    ));
    expect(invocation.environment).toMatchObject({
      role: "shell",
      shellOrigin: "http://127.0.0.1:5174",
      runtimeOrigin: "http://127.0.0.1:5175",
      verifierProbe: "disabled",
    });
    expect(invocation.environment.nonce.length).toBeGreaterThan(0);
    expect(invocation.environment.serverInstanceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(invocation.receipt).toBe("fixture-receipt\n");
    expect(invocation.inventory).toEqual([
      { path: "", mode: 0o700, kind: "directory" },
      { path: "native", mode: 0o700, kind: "directory" },
      { path: "native/scene.mjs", mode: 0o600, kind: "file" },
      {
        path: "world-package-build-receipt.json",
        mode: 0o600,
        kind: "file",
      },
    ]);
    expect(await missing(invocation.environment.packagePath)).toBe(true);
    expect(await missing(invocation.environment.cacheRootPath)).toBe(true);
  });

  it("cleans the owned copy after a failed Vite build", async () => {
    const fixture = await createFakeRepository("failure");

    await expect(buildNativeScenePlaygroundV1({
      repositoryRootPath: fixture.repositoryRootPath,
      fixtureDirectoryPath: fixture.fixtureDirectoryPath,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_BUILD_FAILED");

    const invocation = JSON.parse(await readFile(fixture.markerPath, "utf8")) as {
      readonly environment: Readonly<{ packagePath: string }>;
    };
    expect(await missing(invocation.environment.packagePath)).toBe(true);
  });

  it("rejects symlinks and special nodes instead of copying them", async () => {
    const fixture = await createFakeRepository("success");
    const externalPath = path.join(fixture.repositoryRootPath, "external.txt");
    await writeFile(externalPath, "external\n");
    await symlink(
      externalPath,
      path.join(fixture.fixtureDirectoryPath, "linked.txt"),
    );

    await expect(buildNativeScenePlaygroundV1({
      repositoryRootPath: fixture.repositoryRootPath,
      fixtureDirectoryPath: fixture.fixtureDirectoryPath,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_BUILD_FIXTURE_INVALID");
    expect(await missing(fixture.markerPath)).toBe(true);

    await rm(path.join(fixture.fixtureDirectoryPath, "linked.txt"));
    if (process.platform !== "win32") {
      const socketPath = path.join(fixture.fixtureDirectoryPath, "special.sock");
      const server = net.createServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
      });
      try {
        await expect(buildNativeScenePlaygroundV1({
          repositoryRootPath: fixture.repositoryRootPath,
          fixtureDirectoryPath: fixture.fixtureDirectoryPath,
        })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_BUILD_FIXTURE_INVALID");
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => error === undefined ? resolve() : reject(error))
        );
      }
      expect(await missing(fixture.markerPath)).toBe(true);
    }
  });

  it("terminates the Vite process and cleans the owned copy on SIGTERM", async () => {
    const fixture = await createFakeRepository("wait");
    const build = buildNativeScenePlaygroundV1({
      repositoryRootPath: fixture.repositoryRootPath,
      fixtureDirectoryPath: fixture.fixtureDirectoryPath,
    });
    await waitForFile(fixture.markerPath);
    const invocation = JSON.parse(await readFile(fixture.markerPath, "utf8")) as {
      readonly environment: Readonly<{ packagePath: string }>;
    };

    process.emit("SIGTERM");

    await expect(build).rejects.toThrow(
      "WORLDKIT_NATIVE_SCENE_BUILD_INTERRUPTED: SIGTERM",
    );
    expect(await missing(invocation.environment.packagePath)).toBe(true);
  });
});
