import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  assembleBabylonNativeWorldPackageDirectoryV1,
  assertWorldPackageBuildReceiptV1,
  verifyBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package/native-runtime";
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

const playgroundPublicRoot = new URL("../playground/public/", import.meta.url);
const cloudRidgePackageRoot = new URL(
  "world-packages/cloud-ridge/",
  playgroundPublicRoot,
);
const cloudRidgeReceiptBytes = readFileSync(new URL(
  "world-package-build-receipt.json",
  cloudRidgePackageRoot,
));
const cloudRidgeReceipt = assertWorldPackageBuildReceiptV1(
  JSON.parse(cloudRidgeReceiptBytes.toString("utf8")),
);
const cloudRidgeRootFiles = cloudRidgeReceipt.fileIntegrityEntries.map(
  ({ path, mediaType }) => Object.freeze({
    path,
    mediaType,
    bytes: new Uint8Array(readFileSync(new URL(path, cloudRidgePackageRoot))),
  }),
);
verifyBabylonNativeWorldPackageDirectoryV1(
  assembleBabylonNativeWorldPackageDirectoryV1({
    receipt: cloudRidgeReceipt,
    files: cloudRidgeRootFiles,
  }),
);

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
for (const [index, entry] of cloudRidgeReceipt.fileIntegrityEntries.entries()) {
  const bytes = cloudRidgeRootFiles[index]!.bytes;
  registerExactRuntimeAsset(
    new URL(entry.path, "https://worldkit.invalid/world-packages/cloud-ridge/")
      .pathname,
    {
      bytes,
      contentHash: entry.contentHash,
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
  },
  build: {
    target: "es2022",
  },
});
