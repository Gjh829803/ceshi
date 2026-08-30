import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

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
const hostedRuntimeOrigin = process.env.WORLDKIT_HOSTED_RUNTIME_ORIGIN ??
  "http://127.0.0.1:5175";
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
    shellOrigin: "cross-origin-exact",
    runtimeOrigin: hostedRuntimeOrigin,
    contentSecurityPolicy:
      "default-src self; script-src self wasm-unsafe-eval; style-src self unsafe-inline; img-src self data; font-src none; media-src none; connect-src self; object-src none; base-uri none; form-action none",
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
  }],
  server: {
    host: "127.0.0.1",
    port: 5174,
    headers: {
      "Content-Security-Policy": `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'none'; media-src 'none'; connect-src 'self'; frame-src ${hostedRuntimeOrigin}; object-src 'none'; base-uri 'none'; form-action 'none'`,
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
      "Referrer-Policy": "no-referrer",
    },
  },
  build: {
    target: "es2022",
  },
});
