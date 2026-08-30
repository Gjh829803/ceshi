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

export default defineConfig({
  publicDir: "../playground/public",
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
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()",
      "Referrer-Policy": "no-referrer",
    },
  },
  build: {
    target: "es2022",
  },
});
