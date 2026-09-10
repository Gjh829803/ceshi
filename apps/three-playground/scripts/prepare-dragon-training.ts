import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// 将已验证的飞龙独立入口打包到本站，运行时不依赖源工程或另一个本地服务。
const repository = path.resolve(import.meta.dirname, "../../..");
if (!process.env.WORLDKIT_CREATURE_SOURCE_DIRECTORY || !process.env.WORLDKIT_CREATURE_ASSET_DIRECTORY)
  throw new Error("Set WORLDKIT_CREATURE_SOURCE_DIRECTORY and WORLDKIT_CREATURE_ASSET_DIRECTORY to rebuild the legacy release. Normal dev/build uses the committed assets/dragon-training package.");
const source = path.resolve(process.env.WORLDKIT_CREATURE_SOURCE_DIRECTORY);
const assets = path.resolve(process.env.WORLDKIT_CREATURE_ASSET_DIRECTORY);
const output = path.join(repository, ".codex-tmp/flying-creature-bundle");
const files = {
  "dragon.glb": "dragon.glb",
  "rider.glb": "rider.glb",
  "manifest.json": "manifest.json",
  "FireGenLoop01_8x8.png": "FireTextures/Game/PKFX/Textures/FireGenLoop01_8x8.png",
};
const assetHashes: Record<string, string> = {};
for (const [name, relative] of Object.entries(files)) {
  assetHashes[name] = createHash("sha256").update(await readFile(path.join(assets, relative))).digest("hex");
}
const { build } = await import(pathToFileURL(path.join(source, "node_modules/vite/dist/node/index.js")).href);
await build({
  root: path.join(source, "apps/playground"),
  configFile: path.join(source, "apps/playground/vite.config.mjs"),
  base: "/flying-creature/",
  build: { outDir: output, emptyOutDir: false, copyPublicDir: false,
    rollupOptions: { input: path.join(source, "apps/playground/flying-creature.html") } },
});
await mkdir(path.join(output, "__creature-assets"), { recursive: true });
for (const [name, relative] of Object.entries(files)) {
  await copyFile(path.join(assets, relative), path.join(output, "__creature-assets", name));
}
await mkdir(path.join(output, "licenses"), { recursive: true });
await copyFile(path.join(source, "node_modules/@babylonjs/core/license.md"), path.join(output, "licenses/Babylon-Apache-2.0.txt"));
await copyFile(path.join(source, "node_modules/@babylonjs/havok/LICENSE"), path.join(output, "licenses/Havok.txt"));
const releaseFiles: Record<string, { bytes: number; sha256: string }> = {};
async function collect(relative = "") {
  for (const entry of await readdir(path.join(output, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await collect(name);
    else if (entry.isFile() && name !== "bundle.json") {
      const bytes = await readFile(path.join(output, name));
      releaseFiles[name] = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    }
  }
}
await collect();
await writeFile(path.join(output, "bundle.json"), JSON.stringify({
  kind: "flying-creature-training", schemaVersion: 1, builtAt: new Date().toISOString(),
  assetHashes, files: releaseFiles,
}, null, 2) + "\n");
console.log(`DRAGON_TRAINING_PREPARED ${output}`);
