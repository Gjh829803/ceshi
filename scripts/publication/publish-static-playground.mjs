import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_BUCKET = "leap-world-us-east-2";
const DEFAULT_PREFIX = "world-model/sft/worldkit_seedance_review";
const DEFAULT_SOURCE_ORIGIN = "http://127.0.0.1:4398";

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Invalid argument '${key}'.`);
    }
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

function awsEnvironment() {
  return {
    ...process.env,
    AWS_ACCESS_KEY_ID: undefined,
    AWS_SECRET_ACCESS_KEY: undefined,
    AWS_SESSION_TOKEN: undefined,
    AWS_PROFILE: undefined,
    AWS_DEFAULT_PROFILE: undefined,
    HTTP_PROXY: undefined,
    HTTPS_PROXY: undefined,
    ALL_PROXY: undefined,
    http_proxy: undefined,
    https_proxy: undefined,
    all_proxy: undefined,
    AWS_SHARED_CREDENTIALS_FILE: resolve(
      PROJECT_ROOT,
      ".codex-tmp/runtime-config/aws-credentials",
    ),
    AWS_CONFIG_FILE: resolve(PROJECT_ROOT, ".codex-tmp/runtime-config/aws-config"),
    AWS_SDK_LOAD_CONFIG: "1",
  };
}

async function run(command, args, options = {}) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? PROJECT_ROOT,
      env: options.env ?? process.env,
      stdio: options.quiet ? ["ignore", "ignore", "pipe"] : "inherit",
    });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited ${code}: ${stderr.trim()}`));
    });
  });
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}.`);
  return response.json();
}

export function patchStaticPlaygroundEntry(source, publicBasePath) {
  const apiNeedle = "fetch(`/api/worlds/${encodeURIComponent(m)}/preview-bootstrap`,{cache:\"no-store\"})";
  const apiReplacement =
    "fetch(new URL(`worlds/${encodeURIComponent(m)}/preview-bootstrap.json`,document.baseURI),{cache:\"no-store\"})";
  let output = source;
  if (source.includes("/api/worlds/")) {
    if (!source.includes(apiNeedle)) {
      throw new Error("Static Playground could not locate the preview-bootstrap request.");
    }
    output = source.replace(apiNeedle, apiReplacement);
  }
  for (const root of [
    "assets",
    "subject-assets",
    "worldkit-assets",
    "scene-assets",
    "local-assets",
  ]) {
    output = output.replaceAll(`/${root}/`, `${publicBasePath}/${root}/`);
  }
  return output;
}

function patchIndex(source) {
  return source
    .replaceAll('src="/assets/', 'src="./assets/')
    .replaceAll('href="/assets/', 'href="./assets/');
}

async function copyDirectoryIfPresent(source, destination) {
  try {
    await cp(source, destination, { recursive: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function prepareStaticPlayground(input) {
  const playDirectory = join(input.temporaryDirectory, "play");
  await mkdir(playDirectory, { recursive: true });
  await Promise.all([
    copyDirectoryIfPresent(join(input.sourceDist, "assets"), join(playDirectory, "assets")),
    copyDirectoryIfPresent(
      join(input.sourceDist, "subject-assets"),
      join(playDirectory, "subject-assets"),
    ),
  ]);
  await writeFile(
    join(playDirectory, "index.html"),
    patchIndex(await readFile(join(input.sourceDist, "index.html"), "utf8")),
  );
  const assetDirectory = join(playDirectory, "assets");
  const { readdir } = await import("node:fs/promises");
  for (const entry of await readdir(assetDirectory)) {
    if (!entry.endsWith(".js")) continue;
    const path = join(assetDirectory, entry);
    const source = await readFile(path, "utf8");
    if (!source.includes("/api/worlds/") &&
        !source.includes("/assets/") &&
        !source.includes("/subject-assets/") &&
        !source.includes("/worldkit-assets/") &&
        !source.includes("/scene-assets/") &&
        !source.includes("/local-assets/")) continue;
    await writeFile(path, patchStaticPlaygroundEntry(source, input.publicBasePath));
  }
  const worldsDirectory = join(playDirectory, "worlds");
  await mkdir(worldsDirectory, { recursive: true });
  for (const sceneId of input.sceneIds) {
    const worldDirectory = join(worldsDirectory, sceneId);
    await mkdir(worldDirectory, { recursive: true });
    const bootstrap = await fetchJson(
      `${input.sourceOrigin.replace(/\/$/, "")}/api/worlds/${sceneId}/preview-bootstrap`,
    );
    await writeFile(
      join(worldDirectory, "preview-bootstrap.json"),
      `${JSON.stringify(bootstrap)}\n`,
    );
  }
  const css = join(playDirectory, "assets", (await readdir(assetDirectory))
    .find((entry) => entry.endsWith(".css")) ?? "");
  if (css !== assetDirectory) {
    await writeFile(css, `${await readFile(css, "utf8")}\n#recording-workbench-root,#record-button{display:none!important}\n`);
  }
  return playDirectory;
}

export async function publishStaticPlayground(options) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "worldkit-static-play-"));
  try {
    const catalog = await fetchJson(options.catalogUrl);
    const sceneIds = [...new Set(catalog.episodes.map(({ sceneId }) => sceneId))];
    const releasePrefix = `${options.prefix}/releases/${options.releaseId}`;
    const publicBasePath = `/${releasePrefix}/play`;
    const playDirectory = await prepareStaticPlayground({
      temporaryDirectory,
      sourceDist: options.sourceDist,
      sourceOrigin: options.sourceOrigin,
      sceneIds,
      publicBasePath,
    });
    await run("aws", [
      "s3",
      "sync",
      playDirectory,
      `s3://${options.bucket}/${releasePrefix}/play`,
      "--only-show-errors",
      "--cache-control",
      "public,max-age=31536000,immutable",
    ], { env: awsEnvironment(), quiet: true });
    return {
      sceneCount: sceneIds.length,
      url: `https://${options.bucket}.s3.us-east-2.amazonaws.com/${releasePrefix}/play/index.html`,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  for (const required of ["source-dist", "release-id", "catalog-url"]) {
    if (!args[required]) throw new Error(`--${required} is required.`);
  }
  const result = await publishStaticPlayground({
    sourceDist: resolve(args["source-dist"]),
    releaseId: args["release-id"],
    catalogUrl: args["catalog-url"],
    sourceOrigin: args["source-origin"] ?? DEFAULT_SOURCE_ORIGIN,
    bucket: args.bucket ?? DEFAULT_BUCKET,
    prefix: (args.prefix ?? DEFAULT_PREFIX).replace(/^\/+|\/+$/g, ""),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
