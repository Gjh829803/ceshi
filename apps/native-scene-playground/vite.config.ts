import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const CLOUD_RIDGE_MODULE_ID =
  "virtual:worldkit-cloud-ridge-native-scene";
const CLOUD_RIDGE_MODULE_SOURCE_ID = `${CLOUD_RIDGE_MODULE_ID}/source`;
const RESOLVED_CLOUD_RIDGE_MODULE_ID = `\0${CLOUD_RIDGE_MODULE_ID}`;
const RESOLVED_CLOUD_RIDGE_MODULE_SOURCE_ID =
  `\0${CLOUD_RIDGE_MODULE_SOURCE_ID}`;
const cloudRidgeModuleBytes = readFileSync(new URL(
  "../playground/public/world-packages/cloud-ridge/native/scene.mjs",
  import.meta.url,
));
const cloudRidgeModuleSource = cloudRidgeModuleBytes.toString("utf8");
const cloudRidgeModuleBundleContentHash =
  `sha256:${createHash("sha256").update(cloudRidgeModuleBytes).digest("hex")}`;

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

const repositoryRootPath = fileURLToPath(new URL("../../", import.meta.url));
const nativeSceneAppRootPath = fileURLToPath(new URL("./", import.meta.url));
const workspacePackageRootPath = path.join(repositoryRootPath, "packages");
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
const nativeSceneAppManifest = JSON.parse(readFileSync(
  new URL("package.json", import.meta.url),
  "utf8",
)) as WorkspacePackageManifestV1;
const runtimePackageNames = new Set<string>();
const pendingRuntimePackageNames = Object.keys(
  nativeSceneAppManifest.dependencies ?? {},
).filter((name) => workspacePackageByName.has(name));
while (pendingRuntimePackageNames.length > 0) {
  const packageName = pendingRuntimePackageNames.pop()!;
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
    ) pendingRuntimePackageNames.push(dependencyName);
  }
}
const hostedRuntimeFileSystemAllow = [
  nativeSceneAppRootPath,
  path.join(repositoryRootPath, "node_modules"),
  ...[...runtimePackageNames]
    .sort()
    .map((name) => workspacePackageByName.get(name)!.directoryPath),
];

const playgroundPublicRoot = new URL("../playground/public/", import.meta.url);
const cloudRidgePackageRoot = new URL(
  "world-packages/cloud-ridge/",
  playgroundPublicRoot,
);
const cloudRidgeReceiptBytes = readFileSync(new URL(
  "world-package-build-receipt.json",
  cloudRidgePackageRoot,
));
const cloudRidgeReceipt = JSON.parse(cloudRidgeReceiptBytes.toString("utf8")) as {
  readonly fileIntegrityEntries?: readonly {
    readonly contentHash?: string;
    readonly mediaType?: string;
    readonly path?: string;
    readonly sizeBytes?: number;
  }[];
  readonly worldPackageRootHash?: string;
};
if (
  !Array.isArray(cloudRidgeReceipt.fileIntegrityEntries) ||
  !/^sha256:[0-9a-f]{64}$/.test(cloudRidgeReceipt.worldPackageRootHash ?? "") ||
  `sha256:${createHash("sha256").update(JSON.stringify(
    cloudRidgeReceipt.fileIntegrityEntries,
  )).digest("hex")}` !== cloudRidgeReceipt.worldPackageRootHash
) throw new Error("WORLDKIT_HOSTED_RUNTIME_PACKAGE_RECEIPT_INVALID");

const exactRuntimeAssetByPath = new Map<string, ExactRuntimeAssetV1>();
function registerExactRuntimeAsset(
  requestPath: string,
  asset: ExactRuntimeAssetV1,
): void {
  if (exactRuntimeAssetByPath.has(requestPath)) {
    throw new Error("WORLDKIT_HOSTED_RUNTIME_ASSET_PATH_DUPLICATE");
  }
  exactRuntimeAssetByPath.set(requestPath, Object.freeze(asset));
}

const receiptContentHash =
  `sha256:${createHash("sha256").update(cloudRidgeReceiptBytes).digest("hex")}` as const;
registerExactRuntimeAsset(
  "/world-packages/cloud-ridge/world-package-build-receipt.json",
  {
    bytes: cloudRidgeReceiptBytes,
    contentHash: receiptContentHash,
    mediaType: "application/json",
  },
);
let previousPackagePath = "";
for (const entry of cloudRidgeReceipt.fileIntegrityEntries) {
  if (
    typeof entry.path !== "string" ||
    entry.path.length === 0 ||
    entry.path <= previousPackagePath ||
    entry.path.startsWith("/") ||
    entry.path.includes("\\") ||
    entry.path.split("/").some((segment: string) =>
      segment.length === 0 || segment === "." || segment === ".."
    ) ||
    typeof entry.mediaType !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(entry.contentHash ?? "") ||
    !Number.isSafeInteger(entry.sizeBytes) ||
    (entry.sizeBytes ?? -1) < 0
  ) throw new Error("WORLDKIT_HOSTED_RUNTIME_PACKAGE_RECEIPT_INVALID");
  previousPackagePath = entry.path;
  const bytes = readFileSync(new URL(entry.path, cloudRidgePackageRoot));
  const contentHash =
    `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
  if (bytes.byteLength !== entry.sizeBytes || contentHash !== entry.contentHash) {
    throw new Error("WORLDKIT_HOSTED_RUNTIME_PACKAGE_ASSET_INTEGRITY_FAILED");
  }
  registerExactRuntimeAsset(
    new URL(entry.path, "https://worldkit.invalid/world-packages/cloud-ridge/")
      .pathname,
    {
      bytes,
      contentHash,
      mediaType: entry.mediaType,
    },
  );
}

const gBotAssetContentHash =
  "sha256:4bcf3fabdba1e083ef54bf172fd962ca740e0f2fabdb9cddaae45d5ea208718f" as const;
const gBotAssetBytes = readFileSync(new URL(
  "subject-assets/humanoid/g-bot/v2/g-bot.glb",
  playgroundPublicRoot,
));
if (
  `sha256:${createHash("sha256").update(gBotAssetBytes).digest("hex")}` !==
    gBotAssetContentHash
) throw new Error("WORLDKIT_HOSTED_RUNTIME_SUBJECT_ASSET_INTEGRITY_FAILED");
registerExactRuntimeAsset(
  "/subject-assets/humanoid/g-bot/v2/g-bot.glb",
  {
    bytes: gBotAssetBytes,
    contentHash: gBotAssetContentHash,
    mediaType: "model/gltf-binary",
    requiredContentHashQuery: gBotAssetContentHash,
  },
);
const playgroundPublicNamespacePaths = new Set(
  readdirSync(playgroundPublicRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `/${entry.name}/`),
);
const exactRuntimeAssetIdentity = [...exactRuntimeAssetByPath.entries()]
  .map(([path, asset]) => Object.freeze({
    path,
    contentHash: asset.contentHash,
  }))
  .sort((left, right) => left.path.localeCompare(right.path));
function configuredOrigin(name: string, fallback: string): string {
  const value = process.env[name] ?? fallback;
  const url = new URL(value);
  if (
    url.origin !== value ||
    (url.protocol !== "http:" && url.protocol !== "https:")
  ) throw new Error(`${name}_MUST_BE_EXACT_HTTP_ORIGIN`);
  return value;
}

const hostedRuntimeOrigin = configuredOrigin(
  "WORLDKIT_HOSTED_RUNTIME_ORIGIN",
  "http://127.0.0.1:5175",
);
const hostedShellOrigin = configuredOrigin(
  "WORLDKIT_HOSTED_SHELL_ORIGIN",
  "http://127.0.0.1:5174",
);
if (hostedRuntimeOrigin === hostedShellOrigin) {
  throw new Error("WORLDKIT_HOSTED_BROWSER_ORIGINS_MUST_DIFFER");
}
const hostedContentSecurityPolicy =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'none'; media-src 'none'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const hostedShellContentSecurityPolicy =
  `${hostedContentSecurityPolicy}; frame-src ${hostedRuntimeOrigin}; frame-ancestors 'none'`;
const hostedRuntimeContentSecurityPolicy =
  `${hostedContentSecurityPolicy}; frame-src 'none'; frame-ancestors ${hostedShellOrigin}`;
const lockedContentSecurityPolicy =
  "default-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function installHostedBrowserHeaders(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
): void {
  const requestHost = request.headers.host;
  const contentSecurityPolicy =
    requestHost === new URL(hostedRuntimeOrigin).host
      ? hostedRuntimeContentSecurityPolicy
      : requestHost === new URL(hostedShellOrigin).host
        ? hostedShellContentSecurityPolicy
        : lockedContentSecurityPolicy;
  response.setHeader("Content-Security-Policy", contentSecurityPolicy);
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  next();
}

function installExactRuntimeAssets(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
): void {
  const requestHost = request.headers.host;
  if (
    requestHost !== new URL(hostedRuntimeOrigin).host &&
    requestHost !== new URL(hostedShellOrigin).host
  ) {
    next();
    return;
  }
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url ?? "/", hostedRuntimeOrigin);
  } catch {
    response.statusCode = 400;
    response.end();
    return;
  }
  const asset = exactRuntimeAssetByPath.get(requestUrl.pathname);
  if (asset !== undefined) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET, HEAD");
      response.end();
      return;
    }
    const expectedQuery = asset.requiredContentHashQuery;
    if (
      (expectedQuery === undefined && requestUrl.searchParams.size !== 0) ||
      (expectedQuery !== undefined &&
        (requestUrl.searchParams.size !== 1 ||
          requestUrl.searchParams.get("worldkit-content-hash") !==
            expectedQuery))
    ) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.statusCode = 200;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Length", asset.bytes.byteLength);
    response.setHeader("Content-Type", asset.mediaType);
    response.setHeader("ETag", `\"${asset.contentHash}\"`);
    if (request.method === "HEAD") response.end();
    else response.end(asset.bytes);
    return;
  }
  if ([...playgroundPublicNamespacePaths].some((namespacePath) =>
    requestUrl.pathname.startsWith(namespacePath)
  )) {
    response.statusCode = 404;
    response.end();
    return;
  }
  next();
}
const hostedBrowserRunnerSourcePaths = Object.freeze([
  "src/main.ts",
  "src/hosted-runtime-bridge.ts",
  "src/hosted-runtime-frame.ts",
  "src/native-runtime-host.ts",
  "src/world-package-loader.ts",
  "package.json",
  "vite.config.ts",
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
const hostedBrowserPolicyHash = `sha256:${createHash("sha256").update(
  JSON.stringify({
    schemaVersion: 1,
    credentialless: true,
    sandbox: "allow-scripts allow-same-origin",
    shellOrigin: hostedShellOrigin,
    runtimeOrigin: hostedRuntimeOrigin,
    contentSecurityPolicy: hostedRuntimeContentSecurityPolicy,
    exactRuntimeAssetIdentity,
    runtimePackageNames: [...runtimePackageNames].sort(),
  }),
).digest("hex")}`;

export default defineConfig({
  publicDir: false,
  define: {
    __WORLDKIT_HOSTED_BROWSER_RUNNER_DIGEST__: JSON.stringify(
      hostedBrowserRunnerDigest,
    ),
    __WORLDKIT_HOSTED_BROWSER_POLICY_HASH__: JSON.stringify(
      hostedBrowserPolicyHash,
    ),
    __WORLDKIT_HOSTED_RUNTIME_ORIGIN__: JSON.stringify(hostedRuntimeOrigin),
    __WORLDKIT_HOSTED_SHELL_ORIGIN__: JSON.stringify(hostedShellOrigin),
  },
  plugins: [{
    name: "worldkit-cloud-ridge-exact-package-module",
    resolveId(id) {
      if (id === CLOUD_RIDGE_MODULE_ID) {
        return RESOLVED_CLOUD_RIDGE_MODULE_ID;
      }
      if (id === CLOUD_RIDGE_MODULE_SOURCE_ID) {
        return RESOLVED_CLOUD_RIDGE_MODULE_SOURCE_ID;
      }
      return null;
    },
    load(id) {
      if (id === RESOLVED_CLOUD_RIDGE_MODULE_SOURCE_ID) {
        return cloudRidgeModuleSource;
      }
      if (id === RESOLVED_CLOUD_RIDGE_MODULE_ID) {
        return [
          `export { default } from ${JSON.stringify(CLOUD_RIDGE_MODULE_SOURCE_ID)};`,
          `export const moduleBundleContentHash = ${JSON.stringify(cloudRidgeModuleBundleContentHash)};`,
        ].join("\n");
      }
      return null;
    },
    configureServer(server) {
      server.middlewares.use(installHostedBrowserHeaders);
      server.middlewares.use(installExactRuntimeAssets);
    },
    configurePreviewServer(server) {
      server.middlewares.use(installHostedBrowserHeaders);
      server.middlewares.use(installExactRuntimeAssets);
    },
  }],
  server: {
    host: "127.0.0.1",
    port: 5174,
    fs: {
      strict: true,
      allow: hostedRuntimeFileSystemAllow,
    },
  },
  build: {
    target: "es2022",
  },
});
