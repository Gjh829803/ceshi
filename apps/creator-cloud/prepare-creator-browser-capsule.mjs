#!/usr/bin/env node
/**
 * Export Playwright's pinned Linux headless Chromium with the Jammy library
 * closure, then prove it renders WebGL2 inside dependency-free Ubuntu 22.04.
 * The build context contains this script alone: no checkout, config or login.
 *
 * node apps/creator-cloud/prepare-creator-browser-capsule.mjs [--output-dir PATH]
 * --source-mode jammy-apt uses Jammy apt libraries and a cached CfT browser.
 * Add --existing-export PATH to verify/package a previously extracted capsule.
 * --package-only checks library loading but leaves WebGL verification pending
 * for a real x86_64 worker when the local Docker host emulates that CPU.
 */
import { createHash } from "node:crypto";
import {
  chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync,
  lstatSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceImage = "mcr.microsoft.com/playwright@sha256:75d2d72c89da49d06aa7f6e623987392019aebbc52c09fd8cd6e2c94c7c7d71d";
const verificationImage = "ubuntu@sha256:2edbbc5dc405e9612ba3584ce95480277e3eb374407b5505fe26f17df77c7dbc";
const browserVersion = "151.0.7922.34";
const browserRevision = "1234";
const browserDirectory = `chromium_headless_shell-${browserRevision}`;
const browserBinary = `browsers/${browserDirectory}/chrome-headless-shell-linux64/chrome-headless-shell`;
const scriptPath = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const run = (command, argv, options = {}) => {
  const result = spawnSync(command, argv, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
};
const readCommand = (command, argv) => execFileSync(command, argv, { encoding: "utf8" }).trim();
const allFiles = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? allFiles(join(directory, entry.name)) : [join(directory, entry.name)])
  .sort();

const smokeHtml = `<!doctype html>
<html><meta charset="utf-8"><title>WorldKit browser capsule</title>
<style>
html,body{margin:0;background:#102331;color:#f5f1e8;font:22px sans-serif}
main{padding:28px 44px}h1{font-size:30px;margin:0 0 8px}p{margin:7px 0}
canvas{display:block;margin:18px 0;background:#172e3b;border:1px solid #57737f}
#result{color:#72e1aa;font-size:19px}.caption{font-size:17px;color:#a9c0c8}
</style><body data-webgl-status="pending"><main>
<h1>WorldKit cloud browser · 云端浏览器</h1><p>Ubuntu 22.04 · Chromium ${browserVersion}</p>
<canvas width="864" height="310"></canvas><p id="result">Checking WebGL2…</p>
<p class="caption">Real GPU-process software rendering · No network · Isolated capsule</p>
</main><script>
try {
 const canvas=document.querySelector('canvas');
 const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});
 if(!gl) throw new Error('WebGL2 unavailable');
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,'#version 300 es\\nconst vec2 p[3]=vec2[3](vec2(-.75,-.7),vec2(.75,-.7),vec2(0.,.75));void main(){gl_Position=vec4(p[gl_VertexID],0.,1.);}'));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'#version 300 es\\nprecision highp float;out vec4 color;void main(){color=vec4(.2,.8,.45,1.);}'));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);gl.clearColor(.09,.18,.23,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);
 const pixel=new Uint8Array(4);gl.readPixels(432,155,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
 if(pixel[1]<180||pixel[0]>80||gl.getError()!==gl.NO_ERROR)throw new Error('WebGL readback failed: '+pixel);
 const debug=gl.getExtension('WEBGL_debug_renderer_info');
 const renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
 document.body.dataset.webglStatus='passed';document.body.dataset.webglPixel=String(pixel);
 document.body.dataset.webglRenderer=renderer;
 document.querySelector('#result').textContent='PASS · WebGL2 rendered and read back '+pixel;
}catch(error){document.body.dataset.webglStatus='failed';document.querySelector('#result').textContent=String(error);}
</script></body></html>`;

function extractInContainer(outputDirectory, resolvedSourceImage) {
  assert(process.platform === "linux" && process.arch === "x64", "Extraction requires Linux x86_64");
  const osRelease = readFileSync("/etc/os-release", "utf8");
  assert(osRelease.includes('VERSION_ID="22.04"'), "Browser libraries must come from Ubuntu 22.04");
  assert(process.report.getReport().header.glibcVersionRuntime === "2.35", "Expected glibc 2.35");
  const originalBrowser = `/ms-playwright/${browserDirectory}`;
  assert(existsSync(originalBrowser), `Missing pinned Chromium revision ${browserRevision}`);
  mkdirSync(join(outputDirectory, "browsers"), { recursive: true });
  cpSync(originalBrowser, join(outputDirectory, "browsers", browserDirectory), { recursive: true, dereference: true });
  // Validation in the source image is not validation in the receiving worker.
  rmSync(join(outputDirectory, "browsers", browserDirectory, "DEPENDENCIES_VALIDATED"), { force: true });
  const version = readCommand(join(outputDirectory, browserBinary), ["--version"]);
  assert(version.includes(browserVersion), `Unexpected browser: ${version}`);

  const libDirectory = join(outputDirectory, "lib");
  mkdirSync(libDirectory, { recursive: true });
  const libraries = new Map();
  const hostLibraries = new Set();
  // Keep the host's glibc and loader together. Shipping only part of libc6 can
  // break the worker's Node/Python executables even on two Jammy patch levels.
  const usesHostGlibc = (name) => /^(?:ld-linux-x86-64\.so\.2|lib(?:c|m|dl|pthread|rt|resolv|util|anl|nss_dns|nss_files)\.so\.\d+)$/.test(name);
  const browserElfFiles = allFiles(join(outputDirectory, "browsers"))
    .filter((path) => readFileSync(path).subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])));
  // NSS loads these modules dynamically, so they do not all appear in ldd.
  const nssModules = ["libsoftokn3.so", "libfreebl3.so", "libfreeblpriv3.so", "libnssckbi.so"]
    .map((name) => `/usr/lib/x86_64-linux-gnu/${name}`).filter(existsSync);
  for (const modulePath of nssModules) libraries.set(basename(modulePath), modulePath);
  for (const elfPath of [...browserElfFiles, ...nssModules]) {
    const ldd = readCommand("ldd", [elfPath]);
    assert(!ldd.includes("not found"), `Unresolved dependencies for ${elfPath}: ${ldd}`);
    for (const line of ldd.split("\n")) {
      const match = line.match(/^\s*(\S+)\s+=>\s+(\/\S+)\s+\(/);
      if (!match) continue;
      const [, name, libraryPath] = match;
      if (usesHostGlibc(name)) hostLibraries.add(name);
      else if (!libraryPath.startsWith(outputDirectory)) libraries.set(name, libraryPath);
    }
  }
  for (const [name, libraryPath] of libraries) copyFileSync(realpathSync(libraryPath), join(libDirectory, name));

  mkdirSync(join(outputDirectory, "fonts"), { recursive: true });
  const fontPackages = ["fonts-liberation", "fonts-wqy-zenhei", "fonts-noto-color-emoji"];
  for (const name of ["liberation", "wqy", "noto"]) {
    const fontPath = `/usr/share/fonts/truetype/${name}`;
    if (existsSync(fontPath)) cpSync(fontPath, join(outputDirectory, "fonts", name), { recursive: true, dereference: true });
  }
  assert(allFiles(join(outputDirectory, "fonts")).length > 0, "Capsule requires fonts");
  mkdirSync(join(outputDirectory, "etc"), { recursive: true });
  writeFileSync(join(outputDirectory, "etc/fonts.conf"), `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig><dir prefix="relative">../fonts</dir><cachedir prefix="xdg">fontconfig</cachedir>
<alias><family>sans-serif</family><prefer><family>Liberation Sans</family><family>WenQuanYi Zen Hei</family><family>Noto Color Emoji</family></prefer></alias>
<alias><family>serif</family><prefer><family>Liberation Serif</family><family>WenQuanYi Zen Hei</family></prefer></alias>
<alias><family>monospace</family><prefer><family>Liberation Mono</family><family>WenQuanYi Zen Hei</family></prefer></alias>
</fontconfig>\n`);
  if (existsSync("/usr/share/X11/xkb")) cpSync("/usr/share/X11/xkb", join(outputDirectory, "share/X11/xkb"), { recursive: true, dereference: true });

  const licenseDirectory = join(outputDirectory, "licenses");
  mkdirSync(licenseDirectory, { recursive: true });
  const packages = new Set(fontPackages);
  for (const libraryPath of libraries.values()) {
    const lookupPaths = [libraryPath, libraryPath.startsWith("/lib/") ? `/usr${libraryPath}` : libraryPath];
    for (const lookupPath of lookupPaths) {
      const packageQuery = spawnSync("dpkg-query", ["-S", lookupPath], { encoding: "utf8" });
      if (packageQuery.status !== 0) continue;
      for (const line of packageQuery.stdout.trim().split("\n")) packages.add(line.split(": ")[0]);
      break;
    }
  }
  for (const packageName of packages) {
    const packageBase = packageName.split(":")[0];
    const copyright = `/usr/share/doc/${packageBase}/copyright`;
    if (existsSync(copyright)) copyFileSync(copyright, join(licenseDirectory, `${packageBase}.copyright`));
  }
  const activate = `# Source after setting WORLDKIT_BROWSER_CAPSULE_ROOT to an absolute path.
: "\${WORLDKIT_BROWSER_CAPSULE_ROOT:?Set WORLDKIT_BROWSER_CAPSULE_ROOT before sourcing activate.sh}"
export PLAYWRIGHT_BROWSERS_PATH="$WORLDKIT_BROWSER_CAPSULE_ROOT/browsers"
export LD_LIBRARY_PATH="$WORLDKIT_BROWSER_CAPSULE_ROOT/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export FONTCONFIG_FILE="$WORLDKIT_BROWSER_CAPSULE_ROOT/etc/fonts.conf"
export FONTCONFIG_PATH="$WORLDKIT_BROWSER_CAPSULE_ROOT/etc"
export XKB_CONFIG_ROOT="$WORLDKIT_BROWSER_CAPSULE_ROOT/share/X11/xkb"
`;
  writeFileSync(join(outputDirectory, "activate.sh"), activate);
  mkdirSync(join(outputDirectory, "bin"), { recursive: true });
  writeFileSync(join(outputDirectory, "bin/chromium-headless"), `#!/bin/sh
set -eu
WORLDKIT_BROWSER_CAPSULE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
export WORLDKIT_BROWSER_CAPSULE_ROOT
. "$WORLDKIT_BROWSER_CAPSULE_ROOT/activate.sh"
exec "$WORLDKIT_BROWSER_CAPSULE_ROOT/${browserBinary}" "$@"
`);
  chmodSync(join(outputDirectory, "bin/chromium-headless"), 0o755);
  writeFileSync(join(outputDirectory, "verification.html"), smokeHtml);
  // Some upstream XKB aliases are absolute symlinks. A relocatable capsule
  // must contain their bytes rather than rely on the source filesystem.
  for (const path of allFiles(outputDirectory)) {
    if (!lstatSync(path).isSymbolicLink()) continue;
    const sourceStat = statSync(path);
    assert(sourceStat.isFile(), `Unexpected directory symlink in capsule: ${path}`);
    const bytes = readFileSync(path);
    rmSync(path);
    writeFileSync(path, bytes, { mode: sourceStat.mode & 0o777 });
  }
  const packageVersions = readCommand("dpkg-query", ["-W", "-f=${Package}\t${Version}\n", ...packages]).split("\n");
  const files = allFiles(outputDirectory).map((path) => ({ path: relative(outputDirectory, path), contentSha256: hash(path), sizeBytes: statSync(path).size }));
  writeJson(join(outputDirectory, "manifest.json"), {
    schemaVersion: 1, kind: "worldkit-creator-browser-capsule", id: `chromium-${browserRevision}-jammy-x64`,
    sourceImage: resolvedSourceImage, playwrightVersion: "1.62.1", browserRevision, browserVersion,
    browserKind: "chromium-headless-shell", browserExecutable: browserBinary,
    requirements: { platform: "linux", architecture: "x86_64", glibcVersion: "2.35", baseDistribution: "Ubuntu 22.04", mode: "headless" },
    hostLibraries: [...hostLibraries].sort(), bundledLibraries: [...libraries.keys()].sort(), packageVersions,
    environmentSetup: "Set WORLDKIT_BROWSER_CAPSULE_ROOT, then source activate.sh before starting Node/Playwright.",
    limitations: ["No headed Chrome, Firefox or WebKit.", "Requires a matching Playwright 1.62.1 Node package supplied separately.", "Uses software WebGL in validation; not proof of a production GPU driver or video throughput.", "No SDK, Node runtime, credentials, profiles or remote model configuration are included."],
    files,
  });
  console.log(JSON.stringify({ phase: "extracted", browserVersion: version, fileCount: files.length, sizeBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0) }));
}

function prepareOnHost(outputDirectory) {
  const repoRoot = resolve(dirname(scriptPath), "../..");
  const installedBrowsers = JSON.parse(readFileSync(join(repoRoot, "node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/browsers.json"), "utf8"));
  const chromium = installedBrowsers.browsers.find((browser) => browser.name === "chromium-headless-shell");
  assert(chromium?.revision === browserRevision && chromium?.browserVersion === browserVersion, "Installed Playwright browser lock differs from capsule pin");
  const context = join(outputDirectory, "build-context");
  const existingExport = option("--existing-export", null);
  const exportDirectory = existingExport ? resolve(existingExport) : join(outputDirectory, "export");
  const evidenceDirectory = join(outputDirectory, "verification");
  mkdirSync(join(context, "apps/creator-cloud"), { recursive: true });
  mkdirSync(exportDirectory, { recursive: true });
  mkdirSync(evidenceDirectory, { recursive: true });
  if (!existingExport) {
    copyFileSync(scriptPath, join(context, "apps/creator-cloud/prepare-creator-browser-capsule.mjs"));
    copyFileSync(join(repoRoot, "deploy/creator-runtime/Dockerfile.browser-capsule"), join(context, "Dockerfile"));
    writeFileSync(join(context, ".dockerignore"), "**\n!Dockerfile\n!scripts/\n!apps/creator-cloud/\n!apps/creator-cloud/prepare-creator-browser-capsule.mjs\n");
    const sourceMode = option("--source-mode", "official-jammy");
    assert(["official-jammy", "jammy-apt"].includes(sourceMode), "Unknown browser source mode");
    const sourceArgs = [];
    let buildSource = sourceImage;
    if (sourceMode === "jammy-apt") {
      const cachedBrowserImage = option("--browser-source-image", "829115578968.dkr.ecr.us-east-2.amazonaws.com/worldkit-cloud-worker@sha256:64645bbc1f73f8bc814e320b9c388a087d7584fd09eb5a0450f0ef1702bc1d20");
      const cachedImageId = readCommand("docker", ["image", "inspect", cachedBrowserImage, "--format", "{{.Id}}"]);
      assert(/^sha256:[a-f0-9]{64}$/.test(cachedImageId), "Cached browser image must resolve to a content identity");
      run("docker", ["tag", cachedImageId, "worldkit-browser-source-gpt6-capsule:local"]);
      sourceArgs.push("--build-arg", `CACHED_BROWSER_IMAGE_ID=${cachedImageId}`);
      buildSource = `Ubuntu22 apt libraries; same-version CfT browser from cached worldkit image ${cachedImageId}`;
    }
    console.log(JSON.stringify({ phase: "build", sourceMode, sourceImage: buildSource, outputDirectory }));
    run("docker", ["build", "--platform", "linux/amd64", "--progress", "plain", "--target", sourceMode === "jammy-apt" ? "capsule-jammy-apt" : "capsule", ...sourceArgs, "--output", `type=local,dest=${exportDirectory}`, context]);
  }

  const capsuleDirectory = join(exportDirectory, "browser-capsule");
  const packageOnly = args.includes("--package-only");
  const singleProcessVerification = args.includes("--verify-single-process");
  const capsuleManifest = JSON.parse(readFileSync(join(capsuleDirectory, "manifest.json"), "utf8"));
  assert(capsuleManifest.browserVersion === browserVersion && capsuleManifest.browserRevision === browserRevision, "Exported browser version does not match the pinned browser lock");
  for (const file of capsuleManifest.files) {
    const filePath = resolve(capsuleDirectory, file.path);
    assert(filePath.startsWith(`${capsuleDirectory}/`), "Manifest contains an escaping file path");
    assert(!lstatSync(filePath).isSymbolicLink(), `Capsule must not contain symlinks: ${file.path}`);
    assert(realpathSync(filePath).startsWith(`${realpathSync(capsuleDirectory)}/`), `Capsule file resolves outside its root: ${file.path}`);
    assert(hash(filePath) === file.contentSha256, `Export integrity failed for ${file.path}`);
  }
  const libraryProbe = `set -eu
getconf GNU_LIBC_VERSION > /evidence/glibc.txt
/capsule/bin/chromium-headless --version > /evidence/browser-version.txt
export WORLDKIT_BROWSER_CAPSULE_ROOT=/capsule
. /capsule/activate.sh
for library in /capsule/lib/* /capsule/browsers/${browserDirectory}/chrome-headless-shell-linux64/*.so* /capsule/${browserBinary}; do
 ldd "$library"
done > /evidence/ldd-closure.txt
if grep -q 'not found' /evidence/ldd-closure.txt; then exit 1; fi
`;
  const browserCommand = `timeout 45 /capsule/bin/chromium-headless \\
 --headless --no-sandbox --disable-dev-shm-usage --disable-gpu-sandbox \\
 --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \\
 --no-first-run --no-default-browser-check --hide-scrollbars \\
 --window-size=960,540 --timeout=15000 ${singleProcessVerification ? "--single-process --no-zygote" : ""}`;
  const verifyScript = libraryProbe + (packageOnly ? "" : `
${browserCommand} --screenshot=/evidence/headless-webgl2.png file:///capsule/verification.html > /evidence/screenshot-stdout.log 2> /evidence/browser-stderr.log
${browserCommand} --dump-dom file:///capsule/verification.html > /evidence/dom.html 2> /evidence/dom-stderr.log
`);
  const verifyArgs = ["run", "--rm", "--platform", "linux/amd64", "--network", "none", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--tmpfs", "/tmp:rw,nosuid,nodev,size=1024m", "--shm-size", "256m", "--mount", `type=bind,source=${capsuleDirectory},target=/capsule,readonly`, "--mount", `type=bind,source=${evidenceDirectory},target=/evidence`, verificationImage, "bash", "-c", verifyScript];
  console.log(JSON.stringify({ phase: "verify", verificationImage }));
  run("docker", verifyArgs);
  const dom = packageOnly ? "" : readFileSync(join(evidenceDirectory, "dom.html"), "utf8");
  if (!packageOnly) assert(dom.includes('data-webgl-status="passed"'), "Headless WebGL2 smoke did not pass; inspect verification/dom.html");
  const pngPath = join(evidenceDirectory, "headless-webgl2.png");
  if (!packageOnly) assert(readFileSync(pngPath).subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), "Headless screenshot is not a PNG");
  assert(readFileSync(join(evidenceDirectory, "glibc.txt"), "utf8").trim() === "glibc 2.35", "Verification image is not glibc 2.35");

  console.log(JSON.stringify({ phase: "archive" }));
  const archiveName = `chromium-${browserRevision}-jammy-x64.tar.gz`;
  run("docker", ["run", "--rm", "--platform", "linux/amd64", "--network", "none", "--mount", `type=bind,source=${exportDirectory},target=/payload,readonly`, "--mount", `type=bind,source=${outputDirectory},target=/out`, verificationImage, "bash", "-o", "pipefail", "-c", `tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -cf - -C /payload browser-capsule | gzip -n > /out/${archiveName}`]);
  const archivePath = join(outputDirectory, archiveName);
  const contentSha256 = hash(archivePath);
  writeFileSync(`${archivePath}.sha256`, `${contentSha256}  ${archiveName}\n`);
  const result = {
    schemaVersion: 1, kind: "worldkit-creator-browser-capsule-verification",
    status: packageOnly ? "packaged-awaiting-runtime-verification" : "passed",
    runtimeVerificationStatus: packageOnly ? "pending" : "passed",
    browserProcessMode: singleProcessVerification ? "single-process" : "default",
    sourceImage: capsuleManifest.sourceImage, verificationImage, architecture: "x86_64", glibcVersion: "2.35", browserVersion, browserRevision,
    archive: { path: archivePath, contentSha256, sizeBytes: statSync(archivePath).size },
    capsuleDirectory, uncompressedSizeBytes: capsuleManifest.files.reduce((sum, file) => sum + file.sizeBytes, 0),
    screenshot: packageOnly ? null : { path: pngPath, contentSha256: hash(pngPath), sizeBytes: statSync(pngPath).size },
    dependencyReport: { path: join(evidenceDirectory, "ldd-closure.txt"), contentSha256: hash(join(evidenceDirectory, "ldd-closure.txt")) },
    webglRenderer: dom.match(/data-webgl-renderer="([^"]+)"/)?.[1] ?? null,
    webglPixel: dom.match(/data-webgl-pixel="([^"]+)"/)?.[1] ?? null,
    verificationCommand: ["docker", ...verifyArgs],
    manifest: { path: join(capsuleDirectory, "manifest.json"), contentSha256: hash(join(capsuleDirectory, "manifest.json")) },
  };
  writeJson(join(outputDirectory, "result.json"), result);
  writeFileSync(join(outputDirectory, "USAGE.md"), `# Creator browser capsule\n\nExtract \`${archiveName}\` into the task workspace, then:\n\n\`\`\`sh\nexport WORLDKIT_BROWSER_CAPSULE_ROOT=/absolute/task/path/browser-capsule\n. "$WORLDKIT_BROWSER_CAPSULE_ROOT/activate.sh"\nnode your-playwright-entry.mjs\n\`\`\`\n\nThis supplies Playwright 1.62.1 default headless Chromium revision ${browserRevision} through \`PLAYWRIGHT_BROWSERS_PATH\`. The caller supplies its own Node and Playwright packages. \`LD_LIBRARY_PATH\`, fontconfig and XKB paths are set by \`activate.sh\`. The standalone binary wrapper is \`$WORLDKIT_BROWSER_CAPSULE_ROOT/bin/chromium-headless\`.\n\nFor software WebGL on a native x86_64 worker, launch with \`args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]\`. No sandbox capability is claimed: Playwright uses its usual \`--no-sandbox\` behavior in the isolated worker. Headed browsers are not included.\n\nSHA-256: \`${contentSha256}\`\n\nLibrary loading is verified in clean Ubuntu 22.04 / glibc 2.35 with network disabled and no browser dependency packages installed. Runtime screenshot status: ${result.runtimeVerificationStatus}. \`result.json\` records exact evidence and image digests. The capsule contains no Node, SDK, provider credentials, home profiles or model configuration.\n`);
  console.log(JSON.stringify(result, null, 2));
}

if (args.includes("--help")) {
  console.log("node apps/creator-cloud/prepare-creator-browser-capsule.mjs [--output-dir PATH] [--source-mode official-jammy|jammy-apt] [--browser-source-image LOCAL_IMAGE] [--existing-export PATH] [--package-only] [--verify-single-process]");
} else if (args.includes("--extract-in-container")) {
  extractInContainer(resolve(option("--output-dir", "/export/browser-capsule")), option("--source-image", sourceImage));
} else {
  prepareOnHost(resolve(option("--output-dir", join(dirname(scriptPath), "../../.codex-tmp/gpt6-browser-capsule"))));
}
