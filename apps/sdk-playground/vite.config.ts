import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import {createHash} from 'node:crypto';
import {playgroundDiagnosticsPlugin} from "./server/diagnostics";
import { cameraConfigPlugin } from "./server/camera-config";
import {assetLibraryRoot,readLibraryCatalog,readLibraryResource,resolveLibrarySelection,materializeLibrarySelection} from '@worldkit/creator-host/library-source';
import {
  catalogResources,
  publicCatalogValue,
  type CatalogResource,
} from "@worldkit/creator-host/asset-resources";
const repository = fileURLToPath(new URL("../..", import.meta.url));
async function runtimeSourceDigest(){
  const hash=createHash('sha256');
  async function visit(relative:string){
    for(const entry of (await readdir(path.join(repository,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const name=relative+'/'+entry.name;
      if(entry.isSymbolicLink())throw Error('PLAYGROUND_RUNTIME_SYMLINK');
      if(entry.isDirectory())await visit(name);
      else if(/\.(?:ts|tsx|js|mjs|json)$/.test(name)&&!name.includes('.test.'))hash.update(name+'\0').update(await readFile(path.join(repository,name))).update('\0');
    }
  }
  for(const relative of ['packages/three-world/src','packages/camera-collision/src','packages/preset-content/src','packages/preset-content/config','apps/sdk-playground/src','apps/sdk-playground/config'])await visit(relative);
  hash.update(await readFile(path.join(repository,'pnpm-lock.yaml')));
  return hash.digest('hex');
}
// Reuse the verified catalog closure without giving Creator author code npm access.
function catalogPlugin(): Plugin {
  let files: Map<string, Buffer>;
  async function load() {
    if (files) return files;
    const result = new Map<string,Buffer>();
    // Both local and remote library sources pass through the same hash-checked
    // delivery. Direct GLTF/texture consumers also receive the verified bytes.
    const project = JSON.parse(
      await readFile(
        path.join(
          repository,
          "packages/preset-content/config/project.json",
        ),
        "utf8",
      ),
    );
    const catalog = await readLibraryCatalog(repository,{assetIds:project.assetIds});
    const overrides=createHash('sha256').update(JSON.stringify(project)).update(await readFile(path.join(repository,'packages/preset-content/config/profiles.json'))).digest('hex');
    const selection=await resolveLibrarySelection(repository,project.assetIds,{runtimeDigest:await runtimeSourceDigest(),overridesDigest:overrides});
    if(selection){
      const closure=await materializeLibrarySelection(repository,selection.lock);
      for(const artifact of selection.lock.artifacts)result.set(artifact.storage_path,await readFile(closure.files[artifact.artifact_id]!));
      result.set('project.assets.json',Buffer.from(JSON.stringify(selection.manifest,null,2)));
      result.set('project.assets.lock.json',Buffer.from(JSON.stringify(selection.lock,null,2)));
    }
    const selected = catalog.filter((a: { id: string }) =>
      project.assetIds.includes(a.id),
    );
    result.set(
      "asset-definitions.json",
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          assets: publicCatalogValue(selected),
        }),
      ),
    );
    for (const asset of selected)
      for (const resource of catalogResources(asset as CatalogResource)) {
        const name = resource.uri.replace(/^\.\//, "");
        if (!result.has(name))
          result.set(name, await readLibraryResource(repository, resource));
      }
    files=result;return files;
  }
  return {
    name: "playground-catalog",
    async buildStart() {
      await load();
    },
    configureServer(server) {
      // Catalog URLs identify exact asset bytes. Retire the in-memory catalog
      // when imports change, then let Vite reload clients with the new URLs.
      const catalogInputs = [
        path.join(assetLibraryRoot(repository), "dist/whitebox/asset-catalog.json"),
        path.join(repository, "packages/preset-content/config/project.json"),
      ];
      server.watcher.add(catalogInputs);
      const onCatalogChange = (changed: string) => {
        if (catalogInputs.some(input => path.resolve(input) === path.resolve(changed))) {
          void server.restart();
        }
      };
      server.watcher.on("change", onCatalogChange);
      server.httpServer?.once("close", () => server.watcher.off("change", onCatalogChange));
      server.middlewares.use(async (req, res, next) => {
        const name = (req.url ?? "").split("?")[0]!.replace(/^\//, "");
        const bytes = (await load()).get(name);
        if (!bytes) return next();
        res.setHeader(
          "Content-Type",
          name.endsWith(".json")
            ? "application/json"
            : name.endsWith(".png")
              ? "image/png"
              : "application/octet-stream",
        );
        res.end(bytes);
      });
    },
    async generateBundle() {
      for (const [fileName, source] of await load())
        this.emitFile({ type: "asset", fileName, source });
    },
  };
}
export default defineConfig({
  plugins: [...cameraConfigPlugin(import.meta.dirname), react(), tailwind(), playgroundDiagnosticsPlugin(repository), catalogPlugin()],
  // Maintenance Vite/SSR tests also use the application root. Their dependency
  // optimizer must not replace chunks served by the running Playground.
  cacheDir: path.join(repository, '.codex-tmp', 'playground-vite'),
  resolve: { dedupe: ["react", "react-dom", "three"] },
  server: {
    host: "127.0.0.1",
    port: 5178,
    strictPort: true,
    fs: { allow: [repository] },
  },
  build: {
    rollupOptions: { input: {
      main: path.join(import.meta.dirname, "index.html"),
    } },
    target: "es2022",
    outDir: "../../.codex-tmp/react-playground-dist",
    emptyOutDir: true,
  },
});
