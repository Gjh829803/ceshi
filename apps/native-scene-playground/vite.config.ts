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
  },
  build: {
    target: "es2022",
  },
});
