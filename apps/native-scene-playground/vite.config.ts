import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

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
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'none'; media-src 'none'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
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
  }),
).digest("hex")}`;

export default defineConfig({
  publicDir: "../playground/public",
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
    },
    configurePreviewServer(server) {
      server.middlewares.use(installHostedBrowserHeaders);
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
