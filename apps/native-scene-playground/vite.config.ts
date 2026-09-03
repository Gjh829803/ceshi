import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  defineConfig,
  type Plugin,
  type UserConfig,
  type ViteDevServer,
} from "vite";
import type {
  FormalWorldCaptureSdkOwnerIdentityV1,
} from "@whitebox-world/runtime-contracts";

import { createWorldPackageBrowserTransportV1 } from
  "../../scripts/lib/world-package-browser-transport.js";

const NATIVE_MODULE_ID = "virtual:worldkit-native-scene";
const NATIVE_MODULE_SOURCE_ID = `${NATIVE_MODULE_ID}/source`;
const RESOLVED_NATIVE_MODULE_ID = `\0${NATIVE_MODULE_ID}`;
const RESOLVED_NATIVE_MODULE_SOURCE_ID = `\0${NATIVE_MODULE_SOURCE_ID}`;
const NATIVE_PACKAGE_PREFIX = "/__worldkit/native-package/";
const NATIVE_PACKAGE_RECEIPT_PATH =
  `${NATIVE_PACKAGE_PREFIX}world-package-build-receipt.json`;
const NATIVE_SCENE_MODULE_PATH = "native/scene.mjs";
const SERVER_NONCE_HEADER = "x-worldkit-server-nonce";
const HOSTED_RUNTIME_OPTIMIZE_DEPENDENCY_IDS = Object.freeze([
  "@babylonjs/core/Maths/math.viewport.js",
  "@babylonjs/core/scene.js",
] as const);

interface ExactRuntimeAssetV1 {
  readonly bytes: Uint8Array;
  readonly contentHash: `sha256:${string}`;
  readonly mediaType: string;
  readonly requiredContentHashQuery?: `sha256:${string}`;
}

interface WorkspacePackageManifestV1 {
  readonly name?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
}

type NativeScenePlaygroundEnvironmentV1 = Readonly<
  Record<string, string | undefined>
>;

const repositoryRootPath = fileURLToPath(new URL("../../", import.meta.url));
const nativeSceneAppRootPath = fileURLToPath(new URL("./", import.meta.url));
const workspacePackageRootPath = path.join(repositoryRootPath, "packages");
const playgroundPublicRoot = new URL("../playground/public/", import.meta.url);

function runtimeFileSystemAllowlist(): readonly string[] {
  const workspacePackageByName = new Map<string, Readonly<{
    directoryPath: string;
    manifest: WorkspacePackageManifestV1;
  }>>();
  for (const entry of readdirSync(workspacePackageRootPath, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const directoryPath = path.join(workspacePackageRootPath, entry.name);
    const manifest = JSON.parse(readFileSync(
      path.join(directoryPath, "package.json"),
      "utf8",
    )) as WorkspacePackageManifestV1;
    if (typeof manifest.name === "string") {
      workspacePackageByName.set(manifest.name, Object.freeze({
        directoryPath,
        manifest,
      }));
    }
  }
  const appManifest = JSON.parse(readFileSync(
    new URL("package.json", import.meta.url),
    "utf8",
  )) as WorkspacePackageManifestV1;
  const runtimePackageNames = new Set<string>();
  const pendingPackageNames = Object.keys(appManifest.dependencies ?? {})
    .filter((name) => workspacePackageByName.has(name));
  while (pendingPackageNames.length > 0) {
    const packageName = pendingPackageNames.pop()!;
    if (runtimePackageNames.has(packageName)) continue;
    runtimePackageNames.add(packageName);
    const workspacePackage = workspacePackageByName.get(packageName);
    if (workspacePackage === undefined) {
      throw new Error("WORLDKIT_HOSTED_RUNTIME_PACKAGE_GRAPH_INVALID");
    }
    for (const dependencyName of Object.keys(
      workspacePackage.manifest.dependencies ?? {},
    )) {
      if (
        workspacePackageByName.has(dependencyName) &&
        !runtimePackageNames.has(dependencyName)
      ) pendingPackageNames.push(dependencyName);
    }
  }
  return Object.freeze([
    nativeSceneAppRootPath,
    path.join(repositoryRootPath, "node_modules"),
    ...[...runtimePackageNames]
      .sort()
      .map((name) => workspacePackageByName.get(name)!.directoryPath),
  ]);
}

const hostedRuntimeFileSystemAllow = runtimeFileSystemAllowlist();

function configuredOrigin(
  environment: NativeScenePlaygroundEnvironmentV1,
  name: string,
  fallback: string,
): string {
  const value = environment[name] ?? fallback;
  const url = new URL(value);
  if (
    url.origin !== value ||
    (url.protocol !== "http:" && url.protocol !== "https:")
  ) throw new Error(`${name}_MUST_BE_EXACT_HTTP_ORIGIN`);
  return value;
}

function requiredPackagePath(
  environment: NativeScenePlaygroundEnvironmentV1,
): string {
  const value = environment.WORLDKIT_NATIVE_PACKAGE_PATH;
  if (
    value === undefined ||
    value.length === 0 ||
    value.trim() !== value ||
    !path.isAbsolute(value)
  ) {
    throw new Error(
      "WORLDKIT_NATIVE_PACKAGE_PATH_REQUIRED: configure one absolute verified Package directory",
    );
  }
  return path.normalize(value);
}

function formalCaptureSdkOwnerIdentitiesLiteral(
  environment: NativeScenePlaygroundEnvironmentV1,
): string {
  const serialized =
    environment.WORLDKIT_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES ?? "[]";
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error(
      "WORLDKIT_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES_JSON_INVALID",
    );
  }
  if (!Array.isArray(value)) {
    throw new Error(
      "WORLDKIT_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES_ARRAY_REQUIRED",
    );
  }
  return JSON.stringify(
    value as readonly FormalWorldCaptureSdkOwnerIdentityV1[],
  );
}

function requiredServerNonce(
  environment: NativeScenePlaygroundEnvironmentV1,
): string {
  const value = environment.WORLDKIT_AUTHORING_SERVER_NONCE;
  if (value === undefined || value.length === 0 || value.trim() !== value) {
    throw new Error(
      "WORLDKIT_NATIVE_PACKAGE_SERVER_NONCE_REQUIRED: configure the Host-owned server nonce",
    );
  }
  return value;
}

function requiredServerRole(
  environment: NativeScenePlaygroundEnvironmentV1,
): "shell" | "runtime" {
  const value = environment.WORLDKIT_NATIVE_SERVER_ROLE;
  if (value !== "shell" && value !== "runtime") {
    throw new Error(
      "WORLDKIT_NATIVE_SERVER_ROLE_REQUIRED: expected shell or runtime",
    );
  }
  return value;
}

function requiredCacheScope(
  environment: NativeScenePlaygroundEnvironmentV1,
): Readonly<{
  rootDirectoryPath: string;
  serverInstanceId: string;
}> {
  const rootDirectoryPath = environment.WORLDKIT_NATIVE_VITE_CACHE_ROOT;
  if (
    rootDirectoryPath === undefined ||
    rootDirectoryPath.length === 0 ||
    rootDirectoryPath.trim() !== rootDirectoryPath ||
    !path.isAbsolute(rootDirectoryPath)
  ) {
    throw new Error(
      "WORLDKIT_NATIVE_VITE_CACHE_ROOT_REQUIRED: configure one absolute Host-owned cache root",
    );
  }
  const serverInstanceId = environment.WORLDKIT_NATIVE_SERVER_INSTANCE_ID;
  if (
    serverInstanceId === undefined ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      serverInstanceId,
    )
  ) {
    throw new Error(
      "WORLDKIT_NATIVE_SERVER_INSTANCE_ID_REQUIRED: expected one Host-owned UUID",
    );
  }
  return Object.freeze({
    rootDirectoryPath: path.normalize(rootDirectoryPath),
    serverInstanceId,
  });
}

function verifierProbeEnabled(
  environment: NativeScenePlaygroundEnvironmentV1,
): boolean {
  const value = environment.WORLDKIT_NATIVE_VERIFIER_PROBE ?? "disabled";
  if (value !== "enabled" && value !== "disabled") {
    throw new Error(
      "WORLDKIT_NATIVE_VERIFIER_PROBE_INVALID: expected enabled or disabled",
    );
  }
  return value === "enabled";
}

function writeResponse(
  response: ServerResponse,
  input: Readonly<{
    statusCode: number;
    method: string | undefined;
    bytes?: Uint8Array;
    mediaType?: string;
    contentHash?: `sha256:${string}`;
  }>,
): void {
  response.statusCode = input.statusCode;
  response.setHeader("Cache-Control", "no-store");
  if (input.bytes !== undefined) {
    response.setHeader("Content-Length", input.bytes.byteLength);
  }
  if (input.mediaType !== undefined) {
    response.setHeader("Content-Type", input.mediaType);
  }
  if (input.contentHash !== undefined) {
    response.setHeader("ETag", `\"${input.contentHash}\"`);
  }
  if (input.method === "HEAD" || input.bytes === undefined) response.end();
  else response.end(input.bytes);
}

function installHostedBrowserHeaders(
  input: Readonly<{
    hostedRuntimeOrigin: string;
    hostedShellOrigin: string;
    nonce: string;
  }>,
) {
  const hostedContentSecurityPolicy =
    "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'none'; media-src 'none'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const hostedShellContentSecurityPolicy =
    `${hostedContentSecurityPolicy}; frame-src ${input.hostedRuntimeOrigin}; frame-ancestors 'none'`;
  const hostedRuntimeContentSecurityPolicy =
    `${hostedContentSecurityPolicy}; frame-src 'none'; frame-ancestors ${input.hostedShellOrigin}`;
  const lockedContentSecurityPolicy =
    "default-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  const runtimeHost = new URL(input.hostedRuntimeOrigin).host;
  const shellHost = new URL(input.hostedShellOrigin).host;
  return (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    const requestHost = request.headers.host;
    const contentSecurityPolicy = requestHost === runtimeHost
      ? hostedRuntimeContentSecurityPolicy
      : requestHost === shellHost
        ? hostedShellContentSecurityPolicy
        : lockedContentSecurityPolicy;
    response.setHeader("Content-Security-Policy", contentSecurityPolicy);
    response.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
    );
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(SERVER_NONCE_HEADER, input.nonce);
    next();
  };
}

function installVerifiedPackageAssets(input: Readonly<{
  hostedRuntimeOrigin: string;
  hostedShellOrigin: string;
  receiptContentHash: `sha256:${string}`;
  admittedReceiptBytes: Uint8Array;
  packageEntryByPath: ReadonlyMap<string, Readonly<{
    contentHash: `sha256:${string}`;
    mediaType: string;
  }>>;
  readReceipt(): Promise<Uint8Array>;
  read(packagePath: string): Promise<Uint8Array>;
  exactAssetByPath: ReadonlyMap<string, ExactRuntimeAssetV1>;
}>) {
  const admittedHosts = new Set([
    new URL(input.hostedRuntimeOrigin).host,
    new URL(input.hostedShellOrigin).host,
  ]);
  const reject = (response: ServerResponse, statusCode: number): void => {
    writeResponse(response, { statusCode, method: undefined });
  };
  return (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    if (!admittedHosts.has(request.headers.host ?? "")) {
      next();
      return;
    }
    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url ?? "/", input.hostedRuntimeOrigin);
    } catch {
      reject(response, 400);
      return;
    }
    const isNativeNamespace =
      requestUrl.pathname.startsWith(NATIVE_PACKAGE_PREFIX) ||
      requestUrl.pathname.startsWith("/__worldkit/");
    const exactAsset = input.exactAssetByPath.get(requestUrl.pathname);
    if (!isNativeNamespace && exactAsset === undefined) {
      if (requestUrl.pathname.startsWith("/subject-assets/")) {
        reject(response, 404);
      } else {
        next();
      }
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      reject(response, 405);
      return;
    }
    if (exactAsset !== undefined) {
      const expectedQuery = exactAsset.requiredContentHashQuery;
      if (
        (expectedQuery === undefined && requestUrl.searchParams.size !== 0) ||
        (expectedQuery !== undefined &&
          (requestUrl.searchParams.size !== 1 ||
            requestUrl.searchParams.get("worldkit-content-hash") !==
              expectedQuery))
      ) {
        reject(response, 404);
        return;
      }
      writeResponse(response, {
        statusCode: 200,
        method: request.method,
        bytes: exactAsset.bytes,
        mediaType: exactAsset.mediaType,
        contentHash: exactAsset.contentHash,
      });
      return;
    }
    if (requestUrl.searchParams.size !== 0) {
      reject(response, 404);
      return;
    }
    const packagePath = requestUrl.pathname.startsWith(NATIVE_PACKAGE_PREFIX)
      ? requestUrl.pathname.slice(NATIVE_PACKAGE_PREFIX.length)
      : undefined;
    if (requestUrl.pathname === NATIVE_PACKAGE_RECEIPT_PATH) {
      if (request.method === "HEAD") {
        writeResponse(response, {
          statusCode: 200,
          method: request.method,
          bytes: input.admittedReceiptBytes,
          mediaType: "application/json",
          contentHash: input.receiptContentHash,
        });
        return;
      }
      void input.readReceipt().then((receiptBytes) => {
        writeResponse(response, {
          statusCode: 200,
          method: request.method,
          bytes: receiptBytes,
          mediaType: "application/json",
          contentHash: input.receiptContentHash,
        });
      }).catch(() => reject(response, 409));
      return;
    }
    const entry = packagePath === undefined
      ? undefined
      : input.packageEntryByPath.get(packagePath);
    if (entry === undefined) {
      reject(response, 404);
      return;
    }
    void input.read(packagePath!).then((bytes) => {
      writeResponse(response, {
        statusCode: 200,
        method: request.method,
        bytes,
        mediaType: entry.mediaType,
        contentHash: entry.contentHash,
      });
    }).catch(() => reject(response, 409));
  };
}

function bindTransportDisposal(
  server: Pick<ViteDevServer, "httpServer">,
  dispose: () => void,
): void {
  server.httpServer?.once("close", dispose);
}

export async function createNativeScenePlaygroundViteConfigV1(
  environment: NativeScenePlaygroundEnvironmentV1,
): Promise<UserConfig> {
  const packageDirectoryPath = requiredPackagePath(environment);
  const nonce = requiredServerNonce(environment);
  const serverRole = requiredServerRole(environment);
  const cacheScope = requiredCacheScope(environment);
  const isVerifierProbeEnabled = verifierProbeEnabled(environment);
  const formalCaptureSdkOwnerIdentities =
    formalCaptureSdkOwnerIdentitiesLiteral(environment);
  const hostedRuntimeOrigin = configuredOrigin(
    environment,
    "WORLDKIT_HOSTED_RUNTIME_ORIGIN",
    "http://127.0.0.1:5175",
  );
  const hostedShellOrigin = configuredOrigin(
    environment,
    "WORLDKIT_HOSTED_SHELL_ORIGIN",
    "http://127.0.0.1:5174",
  );
  if (hostedRuntimeOrigin === hostedShellOrigin) {
    throw new Error("WORLDKIT_HOSTED_BROWSER_ORIGINS_MUST_DIFFER");
  }

  const transport = await createWorldPackageBrowserTransportV1({
    packageDirectoryPath,
  });
  try {
    if (transport.sceneSourceKind !== "babylon-native-scene") {
      throw new Error(
        "WORLDKIT_NATIVE_PACKAGE_SOURCE_KIND_REQUIRED: the Native Harness accepts only babylon-native-scene Packages",
      );
    }
    const receiptBytes = await transport.readReceipt();
    const packageEntryByPath = new Map(
      transport.fileIntegrityEntries.map((entry) => [entry.path, Object.freeze({
        contentHash: entry.contentHash,
        mediaType: entry.mediaType,
      })] as const),
    );
    const sceneModuleEntry = packageEntryByPath.get(NATIVE_SCENE_MODULE_PATH);
    if (sceneModuleEntry === undefined) {
      throw new Error("WORLDKIT_NATIVE_PACKAGE_SCENE_MODULE_MISSING");
    }
    const nativeModuleBytes = await transport.read(NATIVE_SCENE_MODULE_PATH);
    const nativeModuleSource = Buffer.from(nativeModuleBytes).toString("utf8");
    const nativeModuleBundleContentHash = sceneModuleEntry.contentHash;
    const receiptContentHash =
      `sha256:${createHash("sha256").update(receiptBytes).digest("hex")}` as const;

    const gBotAssetContentHash =
      "sha256:4bcf3fabdba1e083ef54bf172fd962ca740e0f2fabdb9cddaae45d5ea208718f" as const;
    const gBotAssetBytes = new Uint8Array(readFileSync(new URL(
      "subject-assets/humanoid/g-bot/v2/g-bot.glb",
      playgroundPublicRoot,
    )));
    if (
      `sha256:${createHash("sha256").update(gBotAssetBytes).digest("hex")}` !==
        gBotAssetContentHash
    ) {
      throw new Error("WORLDKIT_HOSTED_RUNTIME_SUBJECT_ASSET_INTEGRITY_FAILED");
    }
    const exactAssetByPath = new Map<string, ExactRuntimeAssetV1>([[
      "/subject-assets/humanoid/g-bot/v2/g-bot.glb",
      Object.freeze({
        bytes: gBotAssetBytes,
        contentHash: gBotAssetContentHash,
        mediaType: "model/gltf-binary",
        requiredContentHashQuery: gBotAssetContentHash,
      }),
    ]]);

    const hostedBrowserRunnerSourcePaths = Object.freeze([
      "src/main.ts",
      "src/hosted-formal-capture-bridge.ts",
      "src/hosted-formal-capture-frame.ts",
      "src/hosted-formal-capture-route.ts",
      "src/hosted-runtime-bridge.ts",
      "src/hosted-runtime-frame.ts",
      "src/native-runtime-host.ts",
      "src/world-package-loader.ts",
      "package.json",
      "vite.config.ts",
      "../../packages/runtime-babylon/src/hosted-formal-capture-protocol.ts",
    ] as const);
    const hostedBrowserRunnerDigest = `sha256:${hostedBrowserRunnerSourcePaths
      .reduce((hash, relativePath) => {
        hash.update(relativePath);
        hash.update("\0");
        hash.update(readFileSync(new URL(relativePath, import.meta.url)));
        hash.update("\0");
        return hash;
      }, createHash("sha256"))
      .update(readFileSync(new URL("../../pnpm-lock.yaml", import.meta.url)))
      .digest("hex")}`;
    const exactRuntimeAssetIdentity = [
      ...transport.fileIntegrityEntries.map(({ path, contentHash }) => ({
        path: `${NATIVE_PACKAGE_PREFIX}${path}`,
        contentHash,
      })),
      ...[...exactAssetByPath.entries()].map(([path, asset]) => ({
        path,
        contentHash: asset.contentHash,
      })),
    ].sort((left, right) => left.path.localeCompare(right.path));
    const hostedContentSecurityPolicy =
      "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'none'; media-src 'none'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
    const hostedRuntimeContentSecurityPolicy =
      `${hostedContentSecurityPolicy}; frame-src 'none'; frame-ancestors ${hostedShellOrigin}`;
    const hostedBrowserPolicyHash = `sha256:${createHash("sha256").update(
      JSON.stringify({
        schemaVersion: 1,
        credentialless: true,
        sandbox: "allow-scripts allow-same-origin",
        shellOrigin: hostedShellOrigin,
        runtimeOrigin: hostedRuntimeOrigin,
        contentSecurityPolicy: hostedRuntimeContentSecurityPolicy,
        exactRuntimeAssetIdentity,
        worldPackageRootHash: transport.worldPackageRootHash,
      }),
    ).digest("hex")}`;

    const headerMiddleware = installHostedBrowserHeaders({
      hostedRuntimeOrigin,
      hostedShellOrigin,
      nonce,
    });
    const assetMiddleware = installVerifiedPackageAssets({
      hostedRuntimeOrigin,
      hostedShellOrigin,
      receiptContentHash,
      admittedReceiptBytes: receiptBytes,
      packageEntryByPath,
      readReceipt: () => transport.readReceipt(),
      read: (packagePath) => transport.read(packagePath),
      exactAssetByPath,
    });
    const plugin: Plugin = {
      name: "worldkit-native-package",
      resolveId(id) {
        if (id === NATIVE_MODULE_ID) return RESOLVED_NATIVE_MODULE_ID;
        if (id === NATIVE_MODULE_SOURCE_ID) {
          return RESOLVED_NATIVE_MODULE_SOURCE_ID;
        }
        return null;
      },
      load(id) {
        if (id === RESOLVED_NATIVE_MODULE_SOURCE_ID) {
          return nativeModuleSource;
        }
        if (id === RESOLVED_NATIVE_MODULE_ID) {
          return [
            `export { default } from ${JSON.stringify(NATIVE_MODULE_SOURCE_ID)};`,
            `export const moduleBundleContentHash = ${JSON.stringify(nativeModuleBundleContentHash)};`,
          ].join("\n");
        }
        return null;
      },
      configureServer(server) {
        bindTransportDisposal(server, () => transport.dispose());
        server.middlewares.use(headerMiddleware);
        server.middlewares.use(assetMiddleware);
      },
      configurePreviewServer(server) {
        bindTransportDisposal(server, () => transport.dispose());
        server.middlewares.use(headerMiddleware);
        server.middlewares.use(assetMiddleware);
      },
      closeBundle() {
        transport.dispose();
      },
    };

    return {
      publicDir: false,
      envDir: false,
      envPrefix: [],
      cacheDir: path.join(
        cacheScope.rootDirectoryPath,
        cacheScope.serverInstanceId,
        serverRole,
      ),
      define: {
        __WORLDKIT_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES__:
          formalCaptureSdkOwnerIdentities,
        __WORLDKIT_NATIVE_VERIFIER_PROBE_ENABLED__: JSON.stringify(
          isVerifierProbeEnabled,
        ),
        __WORLDKIT_HOSTED_BROWSER_RUNNER_DIGEST__: JSON.stringify(
          hostedBrowserRunnerDigest,
        ),
        __WORLDKIT_HOSTED_BROWSER_POLICY_HASH__: JSON.stringify(
          hostedBrowserPolicyHash,
        ),
        __WORLDKIT_HOSTED_RUNTIME_ORIGIN__: JSON.stringify(
          hostedRuntimeOrigin,
        ),
        __WORLDKIT_HOSTED_SHELL_ORIGIN__: JSON.stringify(hostedShellOrigin),
      },
      plugins: [plugin],
      optimizeDeps: {
        include: [...HOSTED_RUNTIME_OPTIMIZE_DEPENDENCY_IDS],
      },
      server: {
        host: "127.0.0.1",
        port: 5174,
        fs: {
          strict: true,
          allow: [...hostedRuntimeFileSystemAllow],
        },
      },
      build: {
        target: "es2022",
      },
    };
  } catch (error) {
    transport.dispose();
    throw error;
  }
}

export default defineConfig(() =>
  createNativeScenePlaygroundViteConfigV1(process.env)
);
