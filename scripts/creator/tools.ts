import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, lstat, realpath, copyFile, readdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
import { build as viteBuild } from "vite";
import { chromium, type Browser, type Page } from "playwright";
import { parseCreatorSceneConfig, createCreatorBootstraps } from "./config.js";

const execFileAsync = promisify(execFile);
export const CREATOR_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const sha256 = (value: string | Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
export const CREATOR_TOOL_VERSION = "0.1.0-experimental";
const CREATOR_AUTHORING_DIAGNOSTIC_PREFIX = "WORLDKIT_CREATOR_AUTHORING_DIAGNOSTIC:";

/** Self-contained: the Host copies this function into its browser wrapper. Never serialize a stack or arbitrary error properties. */
export function sanitizeCreatorAuthoringFailure(error: unknown): { errorName: string; code: string; message: string; hint: string } {
  let message = "";
  let errorName = "Error";
  try {
    if (typeof error === "object" && error !== null) {
      const own = Object.getOwnPropertyDescriptors(error);
      const prototype = Object.getPrototypeOf(error);
      const name = own.name?.value ?? (prototype && Object.getOwnPropertyDescriptor(prototype, "name")?.value);
      if (["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError"].includes(name)) errorName = name;
      if (typeof own.message?.value === "string") message = own.message.value.slice(0, 512).split(/[\r\n]/, 1)[0]!;
    }
  } catch { /* Proxies and accessors are not diagnostic data. */ }
  const known: Record<string, [string, string]> = {
    CREATOR_ENTITY_INVALID: ["Entity registration is invalid.", "Use an id matching ^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$ with at most 64 characters; physics is solid or none. With physics:none, traversable must be omitted or false. Only id, physics and traversable are accepted."],
    CREATOR_ENTITY_ALREADY_REGISTERED: ["An entity id or mesh was registered more than once.", "Register each mesh and stable entity id once. Merge static parts of a compound visual target before registering it."],
    CREATOR_ENTITY_SCENE_MISMATCH: ["The mesh is disposed or belongs to another scene.", "Create the mesh in context.scene and register it before disposing it."],
    CREATOR_SOLID_MESH_MUST_BE_VISIBLE: ["A solid collider mesh is hidden or disabled.", "The exact visible enabled mesh must supply its solid collision geometry."],
  };
  const code = /^([A-Z][A-Z0-9_]{2,95})(?::|$)/.exec(message)?.[1];
  if (code && Object.hasOwn(known, code)) return { errorName, code, message: known[code]![0], hint: known[code]![1] };
  // Keep only narrowly recognized JavaScript syntax. Unknown free text may contain paths, URLs or credentials.
  const missing = /^([A-Za-z_$][A-Za-z0-9_$]{0,63}) is not defined$/.exec(message);
  const method = /^(?:[A-Za-z_$][A-Za-z0-9_$]{0,63}\.){0,8}([A-Za-z_$][A-Za-z0-9_$]{0,63}) is not a function$/.exec(message);
  const property = /^Cannot read properties of (undefined|null) \(reading ['"]([A-Za-z_$][A-Za-z0-9_$]{0,63})['"]\)$/.exec(message);
  const identifier = missing?.[1] ?? method?.[1] ?? property?.[2];
  if (identifier && !/(token|secret|password|authorization|bearer|api_?key)/i.test(identifier)) {
    if (missing) return { errorName, code: "CREATOR_AUTHORING_REFERENCE_UNDEFINED", message: `${identifier} is not defined.`, hint: "Check the exact named exports and imports in creator_get_authoring_schema." };
    if (method) return { errorName, code: "CREATOR_AUTHORING_METHOD_NOT_CALLABLE", message: `${identifier} is not a function.`, hint: "Check the receiver's SDK type and method. A mesh material must be a Material such as StandardMaterial; Color3 is assigned to material.diffuseColor, not mesh.material." };
    return { errorName, code: "CREATOR_AUTHORING_VALUE_MISSING", message: `Cannot read ${identifier} from ${property![1]}.`, hint: "Check that the referenced value exists before using it; consult the exact SDK API source paths from creator_describe_environment." };
  }
  if (errorName === "RangeError" && message === "Maximum call stack size exceeded") return { errorName, code: "CREATOR_AUTHORING_STACK_EXHAUSTED", message, hint: "Check authored helper recursion and terminate recursive construction." };
  return { errorName, code: "CREATOR_AUTHORING_BUILD_EXCEPTION", message: "Authored build() threw an exception; unrecognized free text was withheld.", hint: "Check the authored build and its helpers. Use the exact imports, Material types and registration rules in creator_get_authoring_schema. Stack, paths and provider objects are not exposed." };
}

export interface CreatorAuthoringDiagnostic {
  kind: "experimental-creator-authoring-diagnostic";
  schemaVersion: 1;
  stage: "build";
  candidateId: string;
  sourceHash: string;
  errorName: string;
  code: string;
  message: string;
  hint: string;
}

/** This Creator-only channel is advisory. It never changes NativeHost admission. */
export function parseCreatorAuthoringDiagnostic(text: string, identity: { id: string; sourceHash: string }): CreatorAuthoringDiagnostic | undefined {
  if (!text.startsWith(CREATOR_AUTHORING_DIAGNOSTIC_PREFIX) || text.length > 4096) return undefined;
  try {
    const value = JSON.parse(text.slice(CREATOR_AUTHORING_DIAGNOSTIC_PREFIX.length));
    if (value?.kind !== "experimental-creator-authoring-diagnostic" || value.schemaVersion !== 1 || value.stage !== "build" ||
      value.candidateId !== identity.id || value.sourceHash !== identity.sourceHash ||
      typeof value.errorName !== "string" || typeof value.code !== "string" || typeof value.message !== "string") return undefined;
    // Reconstruct the small recognized error grammar; never trust arbitrary browser-provided message/hint fields.
    let originalMessage = `${value.code}:`;
    if (value.code === "CREATOR_AUTHORING_REFERENCE_UNDEFINED" || value.code === "CREATOR_AUTHORING_METHOD_NOT_CALLABLE") originalMessage = value.message.replace(/\.$/, "");
    else if (value.code === "CREATOR_AUTHORING_VALUE_MISSING") {
      const match = /^Cannot read ([A-Za-z_$][A-Za-z0-9_$]{0,63}) from (undefined|null)\.$/.exec(value.message);
      if (match) originalMessage = `Cannot read properties of ${match[2]} (reading '${match[1]}')`;
    } else if (value.code === "CREATOR_AUTHORING_STACK_EXHAUSTED") originalMessage = value.message;
    const safe = sanitizeCreatorAuthoringFailure({ name: value.errorName, message: originalMessage });
    if (safe.code !== value.code) return undefined;
    return { kind: "experimental-creator-authoring-diagnostic", schemaVersion: 1, stage: "build", candidateId: identity.id, sourceHash: identity.sourceHash, ...safe };
  } catch { return undefined; }
}

export function creatorSceneWrapperSource(input: { authoredPath: string; id: string; sourceHash: string; sceneId: string; spawn: { positionMetersXYZ: readonly number[]; facingRadians: number } }): string {
  return `import authored from ${JSON.stringify(input.authoredPath)};
const sanitizeAuthoringFailure = ${sanitizeCreatorAuthoringFailure.toString()};
export default {kind:"babylon-native-scene-module",id:${JSON.stringify(input.sceneId)},async build(context){
  context.registration.registerSpawnMarker({id:"player-spawn",positionMetersXYZ:${JSON.stringify(input.spawn.positionMetersXYZ)},facingRadians:${input.spawn.facingRadians}});
  try { await authored.build(context); }
  catch(error) {
    try { console.info(${JSON.stringify(CREATOR_AUTHORING_DIAGNOSTIC_PREFIX)} + JSON.stringify({kind:"experimental-creator-authoring-diagnostic",schemaVersion:1,stage:"build",candidateId:${JSON.stringify(input.id)},sourceHash:${JSON.stringify(input.sourceHash)},...sanitizeAuthoringFailure(error)})); } catch {}
    throw error;
  }
}};`;
}

class CreatorRuntimeFailure extends Error {
  constructor(message: string, readonly authoringDiagnostics: readonly CreatorAuthoringDiagnostic[]) { super(message); }
}
export function creatorSteeringYawDelta(forwardXYZ: readonly number[], targetDeltaXZ: readonly number[]): number {
  const currentHeading = Math.atan2(forwardXYZ[0]!, -forwardXYZ[2]!);
  const targetHeading = Math.atan2(targetDeltaXZ[0]!, -targetDeltaXZ[1]!);
  return -Math.atan2(Math.sin(targetHeading - currentHeading), Math.cos(targetHeading - currentHeading));
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.part`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, file);
}

export async function admitCreatorSources(workspace: string): Promise<Map<string, string>> {
  workspace = await realpath(workspace);
  const sources = new Map<string, string>();
  const forbidden = new Set(["process", "require", "globalThis", "window", "document", "fetch", "XMLHttpRequest", "WebSocket", "eval", "Function", "setTimeout", "setInterval", "requestAnimationFrame"]);
  async function visit(relative: string): Promise<void> {
    if (sources.has(relative)) return;
    const absolute = path.resolve(workspace, relative);
    if (!absolute.startsWith(`${path.resolve(workspace)}${path.sep}`)) throw new Error("CREATOR_SOURCE_ESCAPES_WORKSPACE");
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 600_000) throw new Error(`CREATOR_SOURCE_INVALID: ${relative}`);
    if (await realpath(absolute) !== absolute) throw new Error(`CREATOR_SOURCE_SYMLINK_FORBIDDEN: ${relative}`);
    const text = await readFile(absolute, "utf8");
    sources.set(relative, text);
    if (sources.size > 24) throw new Error("CREATOR_SOURCE_GRAPH_TOO_LARGE");
    const source = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const dependencies: string[] = [];
    function walk(node: ts.Node): void {
      if (ts.isIdentifier(node) && forbidden.has(node.text)) throw new Error(`CREATOR_SOURCE_FORBIDDEN: ${relative}: ${node.text}; world code runs only in the isolated browser, not a second runtime.`);
      if (ts.isPropertyAccessExpression(node) && ["activeCamera", "onBeforeRenderObservable", "onAfterRenderObservable", "actionManager", "runRenderLoop", "enablePhysics"].includes(node.name.text)) throw new Error(`CREATOR_RUNTIME_AUTHORITY_FORBIDDEN: ${node.name.text}`);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) throw new Error("CREATOR_DYNAMIC_IMPORT_FORBIDDEN");
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Math" && node.name.text === "random") throw new Error("CREATOR_USE_CONTEXT_RANDOM");
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) dependencies.push(node.moduleSpecifier.text);
      ts.forEachChild(node, walk);
    }
    walk(source);
    for (const dependency of dependencies) {
      if (dependency.startsWith(".")) {
        let next = path.normalize(path.join(path.dirname(relative), dependency));
        if (next.endsWith(".js")) next = next.slice(0, -3) + ".ts";
        if (!next.endsWith(".ts")) next += ".ts";
        await visit(next);
      } else if (dependency === "@whitebox-world/native-babylon" || dependency === "@worldkit/creator") {
        continue;
      } else if (dependency.startsWith("@babylonjs/core/") && !/\/(Engines|Cameras|Physics|Loading|Debug)\//.test(dependency)) {
        continue;
      } else throw new Error(`CREATOR_IMPORT_NOT_ADMITTED: ${dependency}`);
    }
  }
  await visit("scene.ts");
  return sources;
}

interface Candidate {
  id: string;
  sourceHash: string;
  root: string;
  config: ReturnType<typeof parseCreatorSceneConfig>;
  bootstraps: Awaited<ReturnType<typeof createCreatorBootstraps>>;
  publicRoot: string;
  sealedFiles: Record<string, string>;
}
interface Session { candidate: Candidate; server: HttpServer; browser: Browser; page: Page; url: string; errors: string[] }
export interface CreatorOperation {
  id: string; type: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string; updatedAt: string; progress?: unknown; result?: unknown; error?: string;
  authoringDiagnostics?: readonly CreatorAuthoringDiagnostic[];
}

export class CreatorTools {
  readonly workspace: string;
  readonly evidenceRoot: string;
  readonly sessionId = `creator-${randomUUID()}`;
  private session: Session | undefined;
  private pending = Promise.resolve();
  private operations = new Map<string, CreatorOperation>();
  private cancelled = new Set<string>();
  private activeOperationId: string | undefined;
  private validated?: Candidate;
  private lastPlaytest?: { sourceHash: string; report: Record<string, unknown> };
  private lastPlaytestFiles: Record<string, string> = {};
  constructor(workspace: string) {
    this.workspace = path.resolve(workspace);
    this.evidenceRoot = path.join(this.workspace, ".creator-evidence");
  }

  async environment() {
    const catalog = JSON.parse(await readFile(path.join(CREATOR_ROOT, ".codex/skills/worldkit-block-builder/references/agent-authoring-catalog.json"), "utf8"));
    return { kind: "experimental-native-creator-environment", toolVersion: CREATOR_TOOL_VERSION, sessionId: this.sessionId, nodeVersion: process.version, workspace: this.workspace,
      readOnlyAuthoringReferences: ["packages/native-babylon/src/module.ts", "packages/native-babylon/src/random.ts", "scripts/creator/authoring.ts"].map(relative => path.join(CREATOR_ROOT, relative)),
      authoringDiagnostics: "A failed build may include bounded private authoringDiagnostics in its failed operation. Read code/message/hint before repairing the same scene; the formal NativeHost error and admission result stay unchanged. Call creator_get_authoring_schema for an executable minimal scene and exact imports.",
      capabilities: ["native-mesh-authoring", "real-babylon-havok-preview", "registered-subjects-and-actions", "controller-playtest", "runtime-triviews", "static-playable-export"],
      notImplemented: ["formal-native-worldpackage-publication", "npc-hot-edit", "realtime-video-provider"],
      subjectPackCount: catalog.subjectPacks.length, browserExecutable: process.env.WORLDKIT_CHROMIUM_EXECUTABLE ?? "playwright-managed",
      instructions: "Write scene.ts and scene.json in this workspace. Use real preview and playtest tools; inspect returned images. This is an experimental real Runtime, not formal production admission." };
  }
  async assets(query = "", id?: string) {
    const catalog = JSON.parse(await readFile(path.join(CREATOR_ROOT, ".codex/skills/worldkit-block-builder/references/agent-authoring-catalog.json"), "utf8"));
    if (id) {
      const row = catalog.subjectPacks.find((item: { id: string }) => item.id === id);
      if (!row) throw new Error(`CREATOR_ASSET_UNKNOWN: ${id}`);
      return row;
    }
    return catalog.subjectPacks.filter((row: unknown) => !query || JSON.stringify(row).toLowerCase().includes(query.toLowerCase())).map((row: Record<string, any>) => ({ id: row.id, displayName: row.displayName, bodyTopology: row.bodyTopology, visualKind: row.visualKind, actions: row.presentation.actions.map((a: {actionId: string}) => a.actionId), usageNotes: row.usageNotes })).slice(0, 27);
  }

  async prepare(): Promise<Candidate> {
    const configPath = path.join(this.workspace, "scene.json");
    const configInfo = await lstat(configPath);
    if (!configInfo.isFile() || configInfo.isSymbolicLink() || configInfo.size > 300_000) throw new Error("CREATOR_CONFIG_FILE_INVALID");
    const configSource = await readFile(configPath, "utf8");
    const config = parseCreatorSceneConfig(JSON.parse(configSource));
    const sources = await admitCreatorSources(this.workspace);
    const sourceHash = sha256(JSON.stringify({ toolVersion: CREATOR_TOOL_VERSION, runtimeHash: process.env.WORLDKIT_CREATOR_RUNTIME_HASH ?? "local-development-unfrozen", config, sources: [...sources].sort(([a], [b]) => a.localeCompare(b)) }));
    if (this.validated?.sourceHash === sourceHash) return this.validated;
    const id = sourceHash.slice(7, 23);
    const root = path.join(this.evidenceRoot, id);
    const sourceRoot = path.join(root, "source");
    await mkdir(sourceRoot, { recursive: true });
    for (const [relative, source] of sources) {
      await mkdir(path.dirname(path.join(sourceRoot, relative)), { recursive: true });
      await writeFile(path.join(sourceRoot, relative), source);
    }
    await writeJson(path.join(sourceRoot, "scene.json"), config);
    const bootstraps = await createCreatorBootstraps(config, sourceHash);
    const publicRoot = path.join(root, "playable");
    const virtualScene = "\0virtual:creator-scene";
    const virtualConfig = "\0virtual:creator-config";
    await viteBuild({
      configFile: false, root: path.join(CREATOR_ROOT, "apps/creator-playground"), base: "./", publicDir: false, logLevel: "error",
      resolve: { alias: [
        { find: /^@worldkit\/creator$/, replacement: path.join(CREATOR_ROOT, "scripts/creator/authoring.ts") },
        { find: "@babylonjs/core", replacement: path.join(CREATOR_ROOT, "node_modules/@babylonjs/core") },
        { find: /^@whitebox-world\/native-babylon$/, replacement: path.join(CREATOR_ROOT, "packages/native-babylon/src/index.ts") },
      ] },
      plugins: [{ name: "worldkit-creator-inputs", resolveId(id) { if (id === "virtual:creator-scene") return virtualScene; if (id === "virtual:creator-config") return virtualConfig; },
        load(id) {
          if (id === virtualConfig) return Object.entries(bootstraps).map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`).join("\n");
          if (id === virtualScene) return creatorSceneWrapperSource({ authoredPath: path.join(sourceRoot, "scene.ts"), id: sourceHash.slice(7, 23), sourceHash, sceneId: config.id, spawn: config.spawn });
        } }],
      build: { outDir: publicRoot, emptyOutDir: true, sourcemap: false, minify: "esbuild", target: "es2022", chunkSizeWarningLimit: 15000 },
    });
    for (const assetUrl of Object.values(bootstraps.assetUrls) as string[]) {
      const relative = assetUrl.replace(/^\.\//, "").replace(/^\//, "");
      if (relative.includes("..") || !relative.startsWith("subject-assets/")) throw new Error("CREATOR_ASSET_PATH_INVALID");
      const to = path.join(publicRoot, relative);
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(path.join(CREATOR_ROOT, "apps/playground/public", relative), to);
    }
    const sealedFiles = { ...await this.hashTree(root, "source"), ...await this.hashTree(root, "playable") };
    const candidate = { id, sourceHash, root, config, bootstraps, publicRoot, sealedFiles };
    await writeJson(path.join(root, "candidate.json"), { kind: "experimental-native-creator-candidate", id, sourceHash, sceneId: config.id, sourceFiles: [...sources.keys()], toolVersion: CREATOR_TOOL_VERSION, status: "compiled", runtimeValidation: "pending" });
    this.validated = candidate;
    return candidate;
  }

  private async open(candidate: Candidate): Promise<Session> {
    await this.verifyFiles(candidate.root, candidate.sealedFiles);
    if (this.session?.candidate.sourceHash === candidate.sourceHash) return this.session;
    await this.closeSession();
    const mime: Record<string, string> = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".png": "image/png", ".svg": "image/svg+xml" };
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
        const file = path.resolve(candidate.publicRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
        if (!file.startsWith(`${candidate.publicRoot}${path.sep}`)) throw new Error("path");
        const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink()) throw new Error("file");
        response.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
        // The existing trusted bootstrap validator compiles its JSON schema with Ajv.
        response.setHeader("Content-Security-Policy", "default-src 'self' data: blob:; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:");
        response.end(await readFile(file));
      } catch { response.statusCode = 404; response.end("Not found"); }
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("CREATOR_SERVER_FAILED");
    const url = `http://127.0.0.1:${address.port}/`;
    let browser: Browser | undefined;
    const authoringDiagnostics: CreatorAuthoringDiagnostic[] = [];
    try {
      const env: Record<string, string> = {};
      for (const key of ["PATH", "TMPDIR", "LANG", "DISPLAY", "LD_LIBRARY_PATH", "FONTCONFIG_PATH", "FONTCONFIG_FILE"]) if (process.env[key]) env[key] = process.env[key]!;
      browser = await chromium.launch({ ...(process.env.WORLDKIT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.WORLDKIT_CHROMIUM_EXECUTABLE } : {}), headless: true, env,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], timeout: 60_000 });
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors: string[] = [];
      let rejectStartup: (error: Error) => void = () => {};
      const startupFailure = new Promise<never>((_resolve, reject) => { rejectStartup = reject; });
      void startupFailure.catch(() => {});
      page.on("pageerror", error => errors.push(error.message));
      page.once("pageerror", error => rejectStartup(new Error(`CREATOR_BROWSER_STARTUP_ERROR: ${error.message}`)));
      page.on("console", message => {
        const text = message.text();
        const diagnostic = parseCreatorAuthoringDiagnostic(text, candidate);
        if (diagnostic && authoringDiagnostics.length < 4) authoringDiagnostics.push(diagnostic);
        if (message.type() === "error") errors.push(text);
      });
      await page.route("**/*", async route => {
        const requested = route.request().url();
        if (requested.startsWith(url) || requested.startsWith("data:") || requested.startsWith("blob:")) await route.continue(); else await route.abort("blockedbyclient");
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await Promise.race([page.waitForFunction(() => window.__WORLDKIT_CREATOR__?.ready === true || window.__WORLDKIT_CREATOR_STATUS__?.phase === "failed", undefined, { timeout: 120_000 }), startupFailure]);
      const status = await page.evaluate(() => window.__WORLDKIT_CREATOR_STATUS__);
      if (status?.phase === "failed") throw new Error(`CREATOR_RUNTIME_FAILED: ${status.errors.join("; ")}`);
      this.session = { candidate, server, browser, page, url, errors };
      return this.session;
    } catch (error) {
      await browser?.close().catch(() => {}); server.close();
      if (authoringDiagnostics.length) throw new CreatorRuntimeFailure(error instanceof Error ? error.message : "CREATOR_RUNTIME_FAILED", authoringDiagnostics);
      throw error;
    }
  }

  private async hashTree(root: string, relative: string): Promise<Record<string, string>> {
    const absolute = path.join(root, relative);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink() || await realpath(absolute) !== absolute) throw new Error("CREATOR_ARTIFACT_SYMLINK_FORBIDDEN");
    if (stat.isFile()) return { [relative]: sha256(await readFile(absolute)) };
    if (!stat.isDirectory()) throw new Error("CREATOR_ARTIFACT_NOT_REGULAR");
    const files: Record<string, string> = {};
    for (const name of (await readdir(absolute)).sort()) Object.assign(files, await this.hashTree(root, path.join(relative, name)));
    return files;
  }
  private async verifyFiles(root: string, files: Record<string, string>) {
    for (const [relative, hash] of Object.entries(files)) {
      const current = await this.hashTree(root, relative);
      if (current[relative] !== hash) throw new Error(`CREATOR_ARTIFACT_MODIFIED: ${relative}`);
    }
  }

  private async saveCapture(session: Session, request: Record<string, unknown>, name: string) {
    const capture = await session.page.evaluate(async input => window.__WORLDKIT_CREATOR__!.capture(input as any), request);
    const file = path.join(session.candidate.root, `${name}.png`);
    const bytes = Buffer.from(capture.dataUrl.split(",")[1]!, "base64");
    await writeFile(file, bytes);
    return { path: file, sha256: sha256(bytes), widthPixels: capture.widthPixels, heightPixels: capture.heightPixels, projectedBoundsByEntityId: capture.projectedBoundsByEntityId };
  }
  async preview(view = "opening", entityIds?: string[]) {
    if (!["opening", "top-down", "entity-triview"].includes(view) || entityIds?.some(id => !/^[a-zA-Z0-9._-]{1,96}$/.test(id))) throw new Error("CREATOR_CAPTURE_INPUT_INVALID");
    const candidate = await this.prepare();
    const session = await this.open(candidate);
    const image = await this.saveCapture(session, { view, entityIds, widthPixels: view === "entity-triview" ? 1536 : 1280, heightPixels: 720 }, `${view}-${entityIds?.join("-") ?? "world"}`);
    const snapshot = await session.page.evaluate(() => window.__WORLDKIT_CREATOR__!.snapshot());
    const audit = await session.page.evaluate(() => window.__WORLDKIT_CREATOR__!.audit());
    await writeJson(path.join(candidate.root, "runtime-snapshot.json"), snapshot);
    await writeJson(path.join(candidate.root, "runtime-audit.json"), audit);
    return { kind: "experimental-real-runtime-preview", sourceHash: candidate.sourceHash, image, camera: snapshot.camera, audit, browserErrors: session.errors, instructions: "Inspect the actual image pixels and compare with the original reference. This is real Babylon/Havok output, not formal publication." };
  }

  async playtest(operationId: string, durationSeconds = 180, framesPerSecond = 3) {
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 300) throw new Error("CREATOR_DURATION_INVALID");
    if (![1, 2, 3, 6].includes(framesPerSecond)) throw new Error("CREATOR_FPS_INVALID");
    const candidate = await this.prepare(); const session = await this.open(candidate);
    await session.page.evaluate(() => window.__WORLDKIT_CREATOR__!.reset());
    const rawTargets = (candidate.config as any).exploration?.targets ?? [];
    if (!rawTargets.length) throw new Error("CREATOR_EXPLORATION_TARGETS_REQUIRED");
    const targets = rawTargets as { id: string; positionMetersXYZ: [number, number, number]; toleranceMeters?: number }[];
    const output = path.join(candidate.root, "playtest.mp4");
    const ffmpeg = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(framesPerSecond), "-vcodec", "png", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p", output], { stdio: ["pipe", "ignore", "pipe"] });
    let ffmpegError = ""; ffmpeg.stderr.on("data", data => { ffmpegError = (ffmpegError + data).slice(-4000); });
    const finished = new Promise<void>((resolve, reject) => { ffmpeg.once("error", reject); ffmpeg.once("close", code => code === 0 ? resolve() : reject(new Error(`CREATOR_VIDEO_ENCODING_FAILED: ${ffmpegError}`))); });
    // Attach immediately so an encoder startup error cannot become unhandled.
    void finished.catch(() => {});
    const trace: unknown[] = []; const screenshots: string[] = []; const visited = new Set<string>(); const cells = new Set<string>();
    let index = 0, travelled = 0, stagnantFrames = 0, maximumDistance = 0; let previous: number[] | undefined; let failure: string | undefined;
    const start = performance.now();
    const readState = () => session.page.evaluate(() => {
      const s = window.__WORLDKIT_CREATOR__!.snapshot(); const actor = Object.values(s.subjectStatesByEntityId)[0]!;
      return { tick: s.tick, position: actor.positionMetersXYZ, camera: s.camera, action: actor.activeActionId, movementMedium: actor.movementMedium };
    });
    let state = await readState(); const startPosition = [...state.position]; const initialTick = state.tick;
    try {
      for (let frame = 0; frame < durationSeconds * framesPerSecond; frame++) {
        if (this.cancelled.has(operationId)) throw new Error("CREATOR_OPERATION_CANCELLED");
        const target = targets[index % targets.length]!;
        const dx = target.positionMetersXYZ[0] - state.position[0]; const dz = target.positionMetersXYZ[2] - state.position[2];
        const distance = Math.hypot(dx, dz);
        if (distance <= (target.toleranceMeters ?? 2.5) && Math.abs(state.position[1] - target.positionMetersXYZ[1]) <= (target.toleranceMeters ?? 2.5)) { visited.add(target.id); index++; stagnantFrames = 0; }
        const next = targets[index % targets.length]!;
        const nx = next.positionMetersXYZ[0] - state.position[0]; const nz = next.positionMetersXYZ[2] - state.position[2];
        const forward = (state.camera as any).controlForwardXYZ ?? [0, 0, -1];
        const delta = creatorSteeringYawDelta(forward, [nx, nz]);
        state = await session.page.evaluate(async ({ delta, ticks }) => {
          const api = window.__WORLDKIT_CREATOR__!;
          await api.adjustCamera({ yawRadiansDelta: delta });
          const s = await api.runFixedInput({ actions: ["move-forward"], ticks });
          const actor = Object.values(s.subjectStatesByEntityId)[0]!;
          return { tick: s.tick, position: actor.positionMetersXYZ, camera: s.camera, action: actor.activeActionId, movementMedium: actor.movementMedium };
        }, { delta, ticks: 60 / framesPerSecond });
        if (previous) {
          const moved = Math.hypot(state.position[0] - previous[0]!, state.position[2] - previous[2]!);
          travelled += moved; stagnantFrames = moved < 0.02 ? stagnantFrames + 1 : 0;
        }
        previous = [...state.position];
        cells.add(`${Math.floor(state.position[0] / 5)}:${Math.floor(state.position[2] / 5)}`);
        maximumDistance = Math.max(maximumDistance, Math.hypot(state.position[0] - startPosition[0]!, state.position[2] - startPosition[2]!));
        const bytes = await session.page.locator("canvas").first().screenshot({ type: "png", timeout: 30_000 });
        if (!ffmpeg.stdin.write(bytes)) await new Promise<void>((resolve, reject) => {
          const drain = () => { ffmpeg.stdin.off("error", error); resolve(); };
          const error = (cause: Error) => { ffmpeg.stdin.off("drain", drain); reject(cause); };
          ffmpeg.stdin.once("drain", drain); ffmpeg.stdin.once("error", error);
        });
        if (frame % (10 * framesPerSecond) === 0) {
          const file = path.join(candidate.root, `playtest-${String(Math.floor(frame / framesPerSecond)).padStart(3, "0")}.png`);
          await writeFile(file, bytes); screenshots.push(file);
        }
        if (frame % framesPerSecond === 0) {
          trace.push({ simulationSeconds: (frame + 1) / framesPerSecond, targetId: next.id, tick: state.tick, positionMetersXYZ: state.position, action: state.action });
          await this.progress(operationId, { phase: "real-controller-exploration", seconds: (frame + 1) / framesPerSecond, requestedSeconds: durationSeconds, visitedTargets: [...visited], travelledMeters: travelled });
        }
        if (state.position[1] < candidate.config.worldBounds.heightRangeMeters[0] - 10) { failure = "PLAYER_FELL_OUTSIDE_WORLD"; break; }
        if (stagnantFrames > 8 * framesPerSecond) { failure = `PLAYER_STUCK_NEAR_TARGET: ${next.id}`; break; }
      }
      ffmpeg.stdin.end(); await finished;
    } catch (error) { ffmpeg.stdin.destroy(); ffmpeg.kill("SIGTERM"); await finished.catch(() => {}); throw error; }
    const actualSeconds = (state.tick - initialTick) / 60;
    const passed = !failure && session.errors.length === 0 && actualSeconds >= durationSeconds - 0.1 && visited.size === targets.length;
    const report = { kind: "experimental-native-controller-playtest", status: passed ? "passed" : "failed", sourceHash: candidate.sourceHash, requestedDurationSeconds: durationSeconds, actualSimulationSeconds: actualSeconds,
      wallTimeSeconds: (performance.now() - start) / 1000, framesPerSecond, videoPath: output, keyframes: screenshots, targetCount: targets.length, visitedTargets: [...visited], uniqueFiveMeterCells: cells.size,
      travelledMeters: travelled, maximumDistanceFromSpawnMeters: maximumDistance, failure, finalPositionMetersXYZ: state.position, browserErrors: session.errors,
      limitations: ["Executed authored waypoint path only; not exhaustive navigation proof", "Capture cadence is evaluation video cadence, not production realtime performance", "No NPC hot edit or video model inference in this experiment"] };
    await writeJson(path.join(candidate.root, "playtest-report.json"), report);
    await writeJson(path.join(candidate.root, "playtest-trace.json"), trace);
    this.lastPlaytest = { sourceHash: candidate.sourceHash, report };
    this.lastPlaytestFiles = {};
    for (const file of [output, ...screenshots, path.join(candidate.root, "playtest-report.json"), path.join(candidate.root, "playtest-trace.json")]) Object.assign(this.lastPlaytestFiles, await this.hashTree(candidate.root, path.relative(candidate.root, file)));
    await session.page.evaluate(() => window.__WORLDKIT_CREATOR__!.reset());
    return report;
  }

  async triviews() {
    const candidate = await this.prepare(); const session = await this.open(candidate);
    const targets = (candidate.config as any).visualTargets ?? [];
    const subjectId = candidate.bootstraps.runtimeBootstrap.initialControlledEntityId;
    const rows = [{ id: subjectId, name: "Controlled subject", appearancePrompt: "Use the user's original subject appearance." }, ...targets.filter((t: any) => t.id !== subjectId)];
    const images = [];
    for (const target of rows) {
      if (!/^[a-zA-Z0-9._-]+$/.test(target.id)) throw new Error("CREATOR_TARGET_ID_INVALID");
      const image = await this.saveCapture(session, { view: "entity-triview", entityIds: [target.id], azimuthRadians: target.frontYawRadians ?? 0, widthPixels: 1536, heightPixels: 640 }, `triview-${target.id}`);
      images.push({ ...target, image });
    }
    const manifest = { kind: "experimental-runtime-triview-manifest", sourceHash: candidate.sourceHash, viewOrder: ["front", "right", "back"], images };
    await writeJson(path.join(candidate.root, "triview-manifest.json"), manifest);
    return manifest;
  }

  async submit() {
    const candidate = await this.prepare();
    if (!this.lastPlaytest || this.lastPlaytest.sourceHash !== candidate.sourceHash || this.lastPlaytest.report.status !== "passed" || Number(this.lastPlaytest.report.actualSimulationSeconds) < 180) throw new Error("CREATOR_SUBMIT_REQUIRES_PASSING_180_SECOND_PLAYTEST_ON_CURRENT_SOURCE");
    const meets = (key: string, minimum: number) => typeof this.lastPlaytest!.report[key] === "number" && Number.isFinite(this.lastPlaytest!.report[key]) && Number(this.lastPlaytest!.report[key]) >= minimum;
    if (!meets("actualSimulationSeconds", 180) || !meets("targetCount", 3) || !meets("uniqueFiveMeterCells", 15) || !meets("maximumDistanceFromSpawnMeters", 30)) throw new Error("CREATOR_EXPLORATION_COVERAGE_INSUFFICIENT: require 3 targets, 15 distinct 5m cells and 30m from spawn; duration alone is not exploration.");
    const opening = await this.preview(); await this.triviews();
    await this.verifyFiles(candidate.root, candidate.sealedFiles);
    await this.verifyFiles(candidate.root, this.lastPlaytestFiles);
    const report = { kind: "experimental-native-creator-delivery", status: "submitted", scope: "real SDK Native experimental creation/capture/playability; not formal production publication", sourceHash: candidate.sourceHash,
      sceneId: candidate.config.id, opening, playtest: this.lastPlaytest.report, createdAt: new Date().toISOString(), toolVersion: CREATOR_TOOL_VERSION };
    await writeJson(path.join(candidate.root, "delivery.json"), report);
    const archive = path.join(this.workspace, "creator-delivery.tar.gz");
    const temporaryArchive = `${archive}.${randomUUID()}.part`;
    const selected = [...Object.keys(candidate.sealedFiles), ...Object.keys(this.lastPlaytestFiles), "candidate.json", "runtime-snapshot.json", "runtime-audit.json", "opening-world.png", "triview-manifest.json", "delivery.json"];
    const tri = JSON.parse(await readFile(path.join(candidate.root, "triview-manifest.json"), "utf8"));
    selected.push(...tri.images.map((row: any) => path.basename(row.image.path)));
    const artifactHashes: Record<string, string> = {};
    for (const file of [...new Set(selected)]) Object.assign(artifactHashes, await this.hashTree(candidate.root, file));
    await writeJson(path.join(candidate.root, "artifact-hashes.json"), { sourceHash: candidate.sourceHash, files: artifactHashes });
    await execFileAsync("tar", ["-czf", temporaryArchive, "-C", candidate.root, "--", ...Object.keys(artifactHashes), "artifact-hashes.json"]);
    const delivery = { ...report, archivePath: archive, archiveSha256: sha256(await readFile(temporaryArchive)) };
    await rename(temporaryArchive, archive);
    await writeJson(path.join(this.workspace, "creator-result.json"), delivery);
    return delivery;
  }

  async start(type: string, work: (operationId: string) => Promise<unknown>): Promise<CreatorOperation> {
    const id = `op-${randomUUID()}`;
    const operation: CreatorOperation = { id, type, status: "queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.operations.set(id, operation); await this.saveOperation(operation);
    this.pending = this.pending.catch(() => {}).then(async () => {
      if (this.cancelled.has(id)) { operation.status = "cancelled"; await this.saveOperation(operation); return; }
      operation.status = "running"; await this.saveOperation(operation);
      this.activeOperationId = id;
      try { operation.result = await work(id); operation.status = this.cancelled.has(id) ? "cancelled" : "succeeded"; }
      catch (error) {
        operation.error = error instanceof Error ? error.message : String(error);
        if (error instanceof CreatorRuntimeFailure) operation.authoringDiagnostics = error.authoringDiagnostics;
        operation.status = this.cancelled.has(id) ? "cancelled" : "failed";
      }
      this.activeOperationId = undefined;
      operation.updatedAt = new Date().toISOString(); await this.saveOperation(operation);
    });
    return { ...operation };
  }
  private async saveOperation(operation: CreatorOperation) { await writeJson(path.join(this.evidenceRoot, "operations", `${operation.id}.json`), operation); }
  async progress(id: string, progress: unknown) { const operation = this.operations.get(id); if (operation) { operation.progress = progress; operation.updatedAt = new Date().toISOString(); await this.saveOperation(operation); } }
  async getOperation(id: string, waitSeconds = 0): Promise<CreatorOperation> {
    if (!/^op-[a-f0-9-]{36}$/.test(id)) throw new Error("CREATOR_OPERATION_ID_INVALID");
    const end = Date.now() + Math.min(25, Math.max(0, waitSeconds)) * 1000;
    while (true) {
      const operation = this.operations.get(id);
      if (!operation) throw new Error("CREATOR_OPERATION_UNKNOWN_IN_CURRENT_SESSION: restart requires a new operation; disk records are diagnostics only.");
      if (!["queued", "running"].includes(operation.status) || Date.now() >= end) return operation;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  async cancel(id: string) { const op = await this.getOperation(id); this.cancelled.add(id); if (id === this.activeOperationId && ["queued", "running"].includes(op.status)) await this.closeSession(); return { id, cancellationRequested: true }; }
  private async closeSession() { const session = this.session; this.session = undefined; if (session) { await session.browser.close().catch(() => {}); await new Promise<void>(resolve => session.server.close(() => resolve())); } }
  async close() { for (const op of this.operations.values()) if (["queued", "running"].includes(op.status)) this.cancelled.add(op.id); await this.closeSession(); }
}
