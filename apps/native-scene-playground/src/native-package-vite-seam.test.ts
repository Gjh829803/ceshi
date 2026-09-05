import { EventEmitter } from "node:events";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createBabylonNativeWorldPackageV1,
  createCanonicalWorldPackageV1,
} from
  "@whitebox-world/world-package";
import {
  FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1,
} from "@whitebox-world/runtime-contracts";
import {
  createBabylonNativeWorldPackageTestInputV1,
  createWorldPackageTestInputV1,
} from
  "@whitebox-world/world-package/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig, type Connect, type Plugin, type UserConfig } from "vite";

import { writeWorldPackageDirectoryV1 } from
  "../../../scripts/lib/file-world-package.js";
import { createNativeScenePlaygroundViteConfigV1 } from "../vite.config.js";

const SHELL_ORIGIN = "http://127.0.0.1:35174";
const RUNTIME_ORIGIN = "http://127.0.0.1:35175";
const NONCE = "native-package-test-nonce";
const SERVER_INSTANCE_ID = "00000000-0000-4000-8000-000000000001";

let testRootPath: string;
let packageDirectoryPath: string;
let packageDirectory: ReturnType<typeof createBabylonNativeWorldPackageV1>;

function plugins(config: UserConfig): readonly Plugin[] {
  return (config.plugins ?? []).filter((option): option is Plugin =>
    typeof option === "object" &&
    option !== null &&
    !Array.isArray(option) &&
    "name" in option
  );
}

function nativePackagePlugin(config: UserConfig): Plugin {
  const plugin = plugins(config).find((candidate) =>
    candidate.name === "worldkit-native-package"
  );
  if (plugin === undefined) throw new Error("native package plugin missing");
  return plugin;
}

async function createConfig(overrides: Record<string, string> = {}): Promise<UserConfig> {
  return createNativeScenePlaygroundViteConfigV1({
    WORLDKIT_NATIVE_PACKAGE_PATH: packageDirectoryPath,
    WORLDKIT_AUTHORING_SERVER_NONCE: NONCE,
    WORLDKIT_NATIVE_SERVER_ROLE: "shell",
    WORLDKIT_NATIVE_SERVER_INSTANCE_ID: SERVER_INSTANCE_ID,
    WORLDKIT_NATIVE_VITE_CACHE_ROOT: testRootPath,
    WORLDKIT_HOSTED_SHELL_ORIGIN: SHELL_ORIGIN,
    WORLDKIT_HOSTED_RUNTIME_ORIGIN: RUNTIME_ORIGIN,
    ...overrides,
  });
}

function middlewareStack(config: UserConfig): readonly Connect.NextHandleFunction[] {
  const result: Connect.NextHandleFunction[] = [];
  const plugin = nativePackagePlugin(config);
  const configureServer = plugin.configureServer;
  if (typeof configureServer !== "function") {
    throw new Error("native package server hook missing");
  }
  configureServer.call({} as never, {
    middlewares: {
      use(handler: Connect.NextHandleFunction) {
        result.push(handler);
        return this;
      },
    },
  } as never);
  return result;
}

async function invoke(
  stack: readonly Connect.NextHandleFunction[],
  input: Readonly<{ method: string; url: string; host?: string }>,
): Promise<Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string | number | readonly string[]>>;
  bytes: Uint8Array;
  reachedFallback: boolean;
}>> {
  const request = Object.assign(new EventEmitter(), {
    method: input.method,
    url: input.url,
    headers: { host: input.host ?? new URL(SHELL_ORIGIN).host },
  }) as IncomingMessage;
  const chunks: Uint8Array[] = [];
  const headers: Record<string, string | number | readonly string[]> = {};
  let statusCode = 200;
  let reachedFallback = false;
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const response = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(value: number) {
      statusCode = value;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    end(chunk?: string | Uint8Array) {
      if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
      else if (chunk !== undefined) chunks.push(new Uint8Array(chunk));
      settle();
      return this;
    },
  } as unknown as ServerResponse;

  const run = (index: number): void => {
    const handler = stack[index];
    if (handler === undefined) {
      reachedFallback = true;
      settle();
      return;
    }
    handler(request, response, () => run(index + 1));
  };
  run(0);
  await settled;
  return Object.freeze({
    statusCode,
    headers: Object.freeze(headers),
    bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    reachedFallback,
  });
}

beforeEach(async () => {
  testRootPath = await realpath(
    await mkdtemp(path.join(tmpdir(), "native-package-vite-")),
  );
  await chmod(testRootPath, 0o700);
  packageDirectoryPath = path.join(testRootPath, "package");
  packageDirectory = createBabylonNativeWorldPackageV1(
    createBabylonNativeWorldPackageTestInputV1(),
  );
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: packageDirectoryPath,
    directory: packageDirectory,
  });
});

afterEach(async () => {
  await rm(testRootPath, { recursive: true, force: true });
});

describe("Native Playground verified Package Vite seam", () => {
  it("keeps Studio capability server-only and rejects a Runtime or mismatched Package binding", async () => {
    const binding = { sceneId: "palace", worldPackageRootHash: packageDirectory.receipt.worldPackageRootHash,
      studioOrigin: "http://127.0.0.1:3000", capability: "a".repeat(64) };
    const config = await createConfig({ WORLDKIT_STUDIO_RECORDING_BINDING: JSON.stringify(binding) });
    expect(JSON.parse(config.define!.__WORLDKIT_RECORDING_CONTEXT__)).toEqual({
      sceneId: binding.sceneId, worldPackageRootHash: binding.worldPackageRootHash,
    });
    expect(JSON.stringify(config.define)).not.toContain(binding.capability);
    expect(JSON.stringify(config.define)).not.toContain(binding.studioOrigin);
    await expect(createConfig({ WORLDKIT_NATIVE_SERVER_ROLE: "runtime",
      WORLDKIT_STUDIO_RECORDING_BINDING: JSON.stringify(binding) })).rejects.toThrow("BINDING_SOURCE_MISMATCH");
    await expect(createConfig({ WORLDKIT_STUDIO_RECORDING_BINDING: JSON.stringify({ ...binding,
      worldPackageRootHash: `sha256:${"f".repeat(64)}` }) })).rejects.toThrow("BINDING_SOURCE_MISMATCH");
    const standalone = await createConfig();
    expect(standalone.define!.__WORLDKIT_RECORDING_CONTEXT__).toBe("null");
  });
  it("fails closed without an explicit Package path", async () => {
    await expect(createNativeScenePlaygroundViteConfigV1({
      WORLDKIT_AUTHORING_SERVER_NONCE: NONCE,
      WORLDKIT_HOSTED_SHELL_ORIGIN: SHELL_ORIGIN,
      WORLDKIT_HOSTED_RUNTIME_ORIGIN: RUNTIME_ORIGIN,
    })).rejects.toThrow("WORLDKIT_NATIVE_PACKAGE_PATH_REQUIRED");
  });

  it("requires one closed server role and isolates its Vite cache", async () => {
    const environment = {
      WORLDKIT_NATIVE_PACKAGE_PATH: packageDirectoryPath,
      WORLDKIT_AUTHORING_SERVER_NONCE: NONCE,
      WORLDKIT_HOSTED_SHELL_ORIGIN: SHELL_ORIGIN,
      WORLDKIT_HOSTED_RUNTIME_ORIGIN: RUNTIME_ORIGIN,
      WORLDKIT_NATIVE_SERVER_INSTANCE_ID: SERVER_INSTANCE_ID,
      WORLDKIT_NATIVE_VITE_CACHE_ROOT: testRootPath,
    };
    await expect(createNativeScenePlaygroundViteConfigV1(environment))
      .rejects.toThrow("WORLDKIT_NATIVE_SERVER_ROLE_REQUIRED");
    await expect(createNativeScenePlaygroundViteConfigV1({
      ...environment,
      WORLDKIT_NATIVE_SERVER_ROLE: "combined",
    })).rejects.toThrow("WORLDKIT_NATIVE_SERVER_ROLE_REQUIRED");

    const runtimeConfig = await createNativeScenePlaygroundViteConfigV1({
      ...environment,
      WORLDKIT_NATIVE_SERVER_ROLE: "runtime",
    });
    expect(runtimeConfig.cacheDir).toBe(path.join(
      testRootPath,
      SERVER_INSTANCE_ID,
      "runtime",
    ));
    expect(runtimeConfig.optimizeDeps).toEqual({
      include: [
        "@babylonjs/core/Maths/math.viewport.js",
        "@babylonjs/core/scene.js",
      ],
    });

    const otherInstanceConfig = await createNativeScenePlaygroundViteConfigV1({
      ...environment,
      WORLDKIT_NATIVE_SERVER_ROLE: "runtime",
      WORLDKIT_NATIVE_SERVER_INSTANCE_ID:
        "00000000-0000-4000-8000-000000000002",
    });
    expect(otherInstanceConfig.cacheDir).not.toBe(runtimeConfig.cacheDir);
  });

  it("keeps the single-Origin probe verifier-only", async () => {
    const productionConfig = await createConfig();
    expect(productionConfig.define).toMatchObject({
      __WORLDKIT_NATIVE_VERIFIER_PROBE_ENABLED__: "false",
    });

    const verifierConfig = await createNativeScenePlaygroundViteConfigV1({
      WORLDKIT_NATIVE_PACKAGE_PATH: packageDirectoryPath,
      WORLDKIT_AUTHORING_SERVER_NONCE: NONCE,
      WORLDKIT_NATIVE_SERVER_ROLE: "shell",
      WORLDKIT_NATIVE_SERVER_INSTANCE_ID: SERVER_INSTANCE_ID,
      WORLDKIT_NATIVE_VITE_CACHE_ROOT: testRootPath,
      WORLDKIT_NATIVE_VERIFIER_PROBE: "enabled",
      WORLDKIT_HOSTED_SHELL_ORIGIN: SHELL_ORIGIN,
      WORLDKIT_HOSTED_RUNTIME_ORIGIN: RUNTIME_ORIGIN,
    });
    expect(verifierConfig.define).toMatchObject({
      __WORLDKIT_NATIVE_VERIFIER_PROBE_ENABLED__: "true",
    });
  });

  it("allows Studio media only in the trusted shell and keeps Runtime media blocked", async () => {
    const stack = middlewareStack(await createConfig());
    const shell = await invoke(stack, { method: "GET", url: "/" });
    const runtime = await invoke(stack, { method: "GET", url: "/", host: new URL(RUNTIME_ORIGIN).host });
    expect(shell.headers["content-security-policy"]).toContain("media-src 'self'");
    expect(shell.headers["content-security-policy"]).toContain("img-src 'self' data:");
    expect(runtime.headers["content-security-policy"]).toContain("media-src 'none'");
    expect(runtime.headers["content-security-policy"]).toContain("img-src data:");
    expect(String(runtime.headers["content-security-policy"])).not.toContain("media-src 'self'");
  });

  it("injects only explicit trusted formal Capture construction identities", async () => {
    const implementationRefByOwnerId = {
      action: "worldkit://sdk-owner/subject-actions@1",
      camera: "worldkit://sdk-owner/camera@1",
      input: "worldkit://sdk-owner/control-capture@1",
      physics: "worldkit://sdk-owner/character-movement@1",
      subject: "worldkit://sdk-owner/subject-contracts@1",
    } as const;
    const sdkOwnerIdentities = FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1.map(
      (ownerId, index) => ({
        ownerId,
        implementationRef: implementationRefByOwnerId[ownerId],
        implementationHash: `sha256:${String(index + 1).repeat(64)}`,
      }),
    );
    const config = await createNativeScenePlaygroundViteConfigV1({
      WORLDKIT_NATIVE_PACKAGE_PATH: packageDirectoryPath,
      WORLDKIT_AUTHORING_SERVER_NONCE: NONCE,
      WORLDKIT_NATIVE_SERVER_ROLE: "runtime",
      WORLDKIT_NATIVE_SERVER_INSTANCE_ID: SERVER_INSTANCE_ID,
      WORLDKIT_NATIVE_VITE_CACHE_ROOT: testRootPath,
      WORLDKIT_HOSTED_SHELL_ORIGIN: SHELL_ORIGIN,
      WORLDKIT_HOSTED_RUNTIME_ORIGIN: RUNTIME_ORIGIN,
      WORLDKIT_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES:
        JSON.stringify(sdkOwnerIdentities),
    });
    expect(config.define).toMatchObject({
      __WORLDKIT_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES__:
        JSON.stringify(sdkOwnerIdentities),
    });

    await expect(createNativeScenePlaygroundViteConfigV1({
      WORLDKIT_NATIVE_PACKAGE_PATH: packageDirectoryPath,
      WORLDKIT_AUTHORING_SERVER_NONCE: NONCE,
      WORLDKIT_NATIVE_SERVER_ROLE: "runtime",
      WORLDKIT_NATIVE_SERVER_INSTANCE_ID: SERVER_INSTANCE_ID,
      WORLDKIT_NATIVE_VITE_CACHE_ROOT: testRootPath,
      WORLDKIT_HOSTED_SHELL_ORIGIN: SHELL_ORIGIN,
      WORLDKIT_HOSTED_RUNTIME_ORIGIN: RUNTIME_ORIGIN,
      WORLDKIT_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES: "not-json",
    })).rejects.toThrow(
      "WORLDKIT_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES_JSON_INVALID",
    );
  });

  it("exposes neither ambient VITE values nor .env values to Native client modules", async () => {
    const ambientName = "VITE_WORLDKIT_HOST_ENV_CANARY";
    const dotenvName = "VITE_WORLDKIT_DOTENV_CANARY";
    const previousAmbient = process.env[ambientName];
    const envRootPath = path.join(testRootPath, "vite-env-root");
    await mkdir(envRootPath);
    await writeFile(
      path.join(envRootPath, ".env"),
      `${dotenvName}=must-not-cross\n`,
      "utf8",
    );
    process.env[ambientName] = "must-not-cross";
    const config = await createConfig();
    try {
      const resolved = await resolveConfig({
        ...config,
        root: envRootPath,
        configFile: false,
        logLevel: "silent",
      }, "serve");
      expect(resolved.env).not.toHaveProperty(ambientName);
      expect(resolved.env).not.toHaveProperty(dotenvName);
    } finally {
      if (previousAmbient === undefined) delete process.env[ambientName];
      else process.env[ambientName] = previousAmbient;
      const closeBundle = nativePackagePlugin(config).closeBundle;
      if (typeof closeBundle === "function") {
        await closeBundle.call({} as never);
      }
    }
  });

  it("rejects a verified non-Native Package before creating the Harness", async () => {
    const canonicalPackagePath = path.join(testRootPath, "canonical-package");
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: canonicalPackagePath,
      directory: createCanonicalWorldPackageV1(createWorldPackageTestInputV1()),
    });

    await expect(createNativeScenePlaygroundViteConfigV1({
      WORLDKIT_NATIVE_PACKAGE_PATH: canonicalPackagePath,
      WORLDKIT_AUTHORING_SERVER_NONCE: NONCE,
      WORLDKIT_NATIVE_SERVER_ROLE: "shell",
      WORLDKIT_NATIVE_SERVER_INSTANCE_ID: SERVER_INSTANCE_ID,
      WORLDKIT_NATIVE_VITE_CACHE_ROOT: testRootPath,
      WORLDKIT_HOSTED_SHELL_ORIGIN: SHELL_ORIGIN,
      WORLDKIT_HOSTED_RUNTIME_ORIGIN: RUNTIME_ORIGIN,
    })).rejects.toThrow("WORLDKIT_NATIVE_PACKAGE_SOURCE_KIND_REQUIRED");
  });

  it("links the virtual scene module from the admitted Package exact bytes", async () => {
    const config = await createConfig();
    const plugin = nativePackagePlugin(config);
    const resolveId = plugin.resolveId;
    const load = plugin.load;
    if (typeof resolveId !== "function" || typeof load !== "function") {
      throw new Error("native package virtual module hooks missing");
    }
    const resolvedRoot = await resolveId.call(
      {} as never,
      "virtual:worldkit-native-scene",
      undefined,
      {} as never,
    );
    const resolvedSource = await resolveId.call(
      {} as never,
      "virtual:worldkit-native-scene/source",
      undefined,
      {} as never,
    );
    expect(resolvedRoot).toBe("\0virtual:worldkit-native-scene");
    expect(resolvedSource).toBe("\0virtual:worldkit-native-scene/source");

    const loadedSource = await load.call({} as never, String(resolvedSource), {
      ssr: false,
    });
    const expectedSource = Buffer.from(packageDirectory.files.find(
      (file) => file.path === "native/scene.mjs",
    )!.bytes).toString("utf8");
    expect(loadedSource).toBe(expectedSource);

    const wrapper = await load.call({} as never, String(resolvedRoot), {
      ssr: false,
    });
    const bundleHash = packageDirectory.receipt.fileIntegrityEntries.find(
      (entry) => entry.path === "native/scene.mjs",
    )!.contentHash;
    expect(wrapper).toContain(JSON.stringify(bundleHash));
    expect(wrapper).toContain(
      'export { default } from "virtual:worldkit-native-scene/source";',
    );
  });

  it("serves only the receipt and admitted inventory with a nonce header", async () => {
    const config = await createConfig();
    const stack = middlewareStack(config);
    const receipt = await invoke(stack, {
      method: "GET",
      url: "/__worldkit/native-package/world-package-build-receipt.json",
    });
    expect(receipt.statusCode).toBe(200);
    expect(receipt.headers["x-worldkit-server-nonce"]).toBe(NONCE);
    expect(receipt.headers["cache-control"]).toBe("no-store");
    expect(Buffer.from(receipt.bytes).equals(await readFile(path.join(
      packageDirectoryPath,
      "world-package-build-receipt.json",
    )))).toBe(true);

    const scene = await invoke(stack, {
      method: "GET",
      url: "/__worldkit/native-package/native/scene.mjs",
    });
    expect(scene.statusCode).toBe(200);
    expect(scene.headers["x-worldkit-server-nonce"]).toBe(NONCE);
    expect(Buffer.from(scene.bytes).equals(Buffer.from(
      packageDirectory.files.find(
        (file) => file.path === "native/scene.mjs",
      )!.bytes,
    ))).toBe(true);

    for (const url of [
      "/__worldkit/native-package/unlisted.txt",
      "/__worldkit/native-package/../package.json",
      "/__worldkit/native-package/native/scene.mjs?cache-bust=1",
    ]) {
      const rejected = await invoke(stack, { method: "GET", url });
      expect(rejected.statusCode).toBe(404);
      expect(rejected.reachedFallback).toBe(false);
      expect(rejected.headers["x-worldkit-server-nonce"]).toBe(NONCE);
    }

    const methodRejected = await invoke(stack, {
      method: "POST",
      url: "/__worldkit/native-package/native/scene.mjs",
    });
    expect(methodRejected.statusCode).toBe(405);
    expect(methodRejected.headers.allow).toBe("GET, HEAD");
    expect(methodRejected.headers["x-worldkit-server-nonce"]).toBe(NONCE);
  });

  it("keeps readiness HEAD non-blocking while GET still rejects Package drift", async () => {
    const config = await createConfig();
    const stack = middlewareStack(config);
    await writeFile(
      path.join(packageDirectoryPath, "native/scene.mjs"),
      "export default async function drifted() {}\n",
      { mode: 0o600 },
    );

    const readiness = await invoke(stack, {
      method: "HEAD",
      url: "/__worldkit/native-package/world-package-build-receipt.json",
    });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.bytes).toHaveLength(0);
    expect(readiness.headers["x-worldkit-server-nonce"]).toBe(NONCE);

    const runtimeRead = await invoke(stack, {
      method: "GET",
      url: "/__worldkit/native-package/world-package-build-receipt.json",
    });
    expect(runtimeRead.statusCode).toBe(409);
    expect(runtimeRead.bytes).toHaveLength(0);
  });

  it("keeps the Browser Harness package-generic", async () => {
    const [main, html, style, resolver] = await Promise.all([
      readFile(new URL("./main.ts", import.meta.url), "utf8"),
      readFile(new URL("../index.html", import.meta.url), "utf8"),
      readFile(new URL("./style.css", import.meta.url), "utf8"),
      readFile(new URL("./subject-asset-resolver.ts", import.meta.url), "utf8"),
    ]);
    const source = [main, html, style, resolver].join("\n");
    expect(source).not.toMatch(/Cloud Ridge|cloudRidge|cloud-ridge/i);
    expect(source).not.toMatch(/data-path-check|path-check-button/);
    expect(source).not.toContain("1_700");
    expect(source).not.toContain("positionMetersXYZ[1] > 12");
    expect(source).not.toContain("positionMetersXYZ[2] < -29");
  });
});
