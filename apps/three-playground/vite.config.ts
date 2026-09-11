import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { dragonTrainingPlugin } from "./dragon-training-plugin";
import {
  catalogResources,
  publicCatalogValue,
  readCatalogResource,
  type CatalogResource,
} from "../../scripts/three-creator/asset-resources";
const repository = fileURLToPath(new URL("../..", import.meta.url));
// Reuse the verified catalog closure without giving Creator author code npm access.
function catalogPlugin(): Plugin {
  let files: Map<string, Buffer>;
  async function load() {
    if (files) return files;
    files = new Map();
    const catalog = JSON.parse(
      await readFile(
        path.join(repository, "assets/three-creator/asset-catalog.json"),
        "utf8",
      ),
    );
    const project = JSON.parse(
      await readFile(
        path.join(
          repository,
          "shared/preset-content/project.json",
        ),
        "utf8",
      ),
    );
    const selected = catalog.assets.filter((a: { id: string }) =>
      project.assetIds.includes(a.id),
    );
    files.set(
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
        if (!files.has(name))
          files.set(name, await readCatalogResource(repository, resource));
      }
    return files;
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
        path.join(repository, "assets/three-creator/asset-catalog.json"),
        path.join(repository, "shared/preset-content/project.json"),
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
  plugins: [react(), tailwind(), catalogPlugin(), dragonTrainingPlugin(repository)],
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
