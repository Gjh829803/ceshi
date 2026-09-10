import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Plugin } from "vite";

/** 只发布预先打包的文件清单；开发服务与静态站点使用同一套资源路径。 */
export function dragonTrainingPlugin(repository: string): Plugin {
  const directory = path.join(repository, "assets/dragon-training");
  let files: Map<string, Buffer> | undefined;
  async function load() {
    if (files) return files;
    const result = new Map<string, Buffer>();
    let manifestBytes: Buffer;
    try { manifestBytes = await readFile(path.join(directory, "bundle.json")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return result; throw error; }
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
      kind: string; schemaVersion: number; files: Record<string, { bytes: number; sha256: string }>;
    };
    if (manifest.kind !== "flying-creature-training" || manifest.schemaVersion !== 1 || !manifest.files?.["flying-creature.html"])
      throw new Error("DRAGON_TRAINING_MANIFEST_INVALID");
    for (const [name, identity] of Object.entries(manifest.files)) {
      if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.startsWith("/") || name.split("/").some(part => part === ".." || part === "." || !part))
        throw new Error(`DRAGON_TRAINING_PATH_INVALID:${name}`);
      const bytes = await readFile(path.join(directory, name));
      if (bytes.length !== identity.bytes || createHash("sha256").update(bytes).digest("hex") !== identity.sha256)
        throw new Error(`DRAGON_TRAINING_INTEGRITY_FAILED:${name}`);
      result.set(`flying-creature/${name}`, bytes);
    }
    result.set("flying-creature/bundle.json", manifestBytes);
    files = result;
    return files;
  }
  return {
    name: "playground-dragon-training",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const name = (request.url ?? "").split("?")[0]!.replace(/^\//, "");
        if (!name.startsWith("flying-creature/")) return next();
        try {
          const bytes = (await load()).get(name);
          if (!bytes || !["GET", "HEAD"].includes(request.method ?? "")) { response.statusCode = 404; response.end(); return; }
          const extension = path.extname(name);
          const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".png": "image/png" };
          response.setHeader("Content-Type", types[extension] ?? "application/octet-stream");
          response.end(request.method === "HEAD" ? undefined : bytes);
        } catch (error) { next(error as Error); }
      });
    },
    async generateBundle() {
      const published = await load();
      if (!published.size) this.error("DRAGON_TRAINING_BUNDLE_MISSING: restore assets/dragon-training from Git");
      for (const [fileName, source] of published) this.emitFile({ type: "asset", fileName, source });
    },
  };
}
