# Three Creator Linux toolkit capsule

Build an independent Three/Rapier Creator runtime for Linux cloud evaluation.

Run from the repository root:

```sh
node scripts/cloud/three-capsule.mjs --stage-only
node scripts/cloud/three-capsule.mjs --dependencies-only
node --test deploy/three-creator-runtime/capsule.test.mjs
```

The default command only stages a provisional context. Dependency preparation
builds a cached Linux amd64 layer and exports `dependency-doctor.json`; it does
not export a usable SDK capsule. Source changes do not invalidate that layer.
Use a distinct `--output-root .codex-tmp/three-creator-capsule/<name>` when keeping
multiple dependency/build reports. Existing export directories are immutable.

After the integrated SDK/tool source has been reviewed and frozen, pass that
exact staged source hash to `--build --expected-source-hash sha256:<digest>`.
This fails if the live source closure differs. The build invokes the fixed
`scripts/three-creator/prebuild.ts` contract. It never
uploads files, invokes a model, changes shared workers or labels a provisional
source as cloud-ready. The trusted prebuild/compile doctor has a five-minute
timeout; Docker dependency/build phases have fifteen/twenty-minute timeouts.

## Closed build context

Only the Three package, Three Creator tools, browser bridge and the catalog's
original SHA-verified GLB files enter the source tree. Native/Babylon workspace
packages and host `node_modules` never enter it. The root manifest contains only
the direct dependencies consumed by these tools. The pnpm 9 lock importer
projection keeps exact resolution, patch and integrity records; the container
uses `pnpm install --frozen-lockfile`. Unused lock metadata is retained but its
Native dependencies are not installed. Changes to dependency/patch formats fail
closed and need review. The sole permitted dependency lifecycle build is esbuild.

The container uses the digest-pinned Node 20.20.2 Linux x64 image and pnpm 10.14.0.
No Docker build secrets, auth/config files, environment files, cloud account
folders or host package caches are forwarded. Parent-folder symlinks and source
symlinks are rejected. Capsule symlinks must be relative and contained; pnpm
shell shims are made relocatable. File SHA-256, x64 ELF headers and GLIBC version
requirements are audited. Browser bytes stay in the separately frozen Chromium
capsule.

## Export and remaining acceptance

`three-creator-toolkit.tar.gz` contains a single `toolkit/` directory:

- `runtime/bin/node`: the pinned Linux binary.
- `sdk/`: source closure, dependencies and assets.
- `prebuilt/three-raw` and `prebuilt/three-sdk`: each has `runtime/` and its pinned
  `runtime-manifest.json`, produced once by the trusted `prebuild.ts` tool.
- `sdk/source-manifest.json`: staged file hashes and original manifest identity.
- `doctor.json`: actual Linux dependency/compiler checks.
- `content-manifest.json`: every other capsule file/link and runtime identity.

Manifest paths are capsule-relative: `nodeBinary = runtime/bin/node` and
`toolkitRoot = sdk`. The local build report resolves both paths below the export
directory. A completed build means `built-cloud-doctor-required`, never cloud
acceptance. The external FSx workspace, pinned runtime manifest, MCP startup,
real browser images/controls, submission archive, nested public URL and HTTP
compatibility still require the separate cloud doctor before model evaluation.

`prebuiltRuntimeByProfile` records each capsule-relative root, manifest path,
plain-hex `manifestSha256` and `runtimeHash`. Per-profile MCP launchers must set
`WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT` to the absolute relocated profile root and
`WORLDKIT_THREE_PREBUILT_RUNTIME_MANIFEST_SHA256` to its plain-hex pin. These two
environment values are absent during prebuild. The compiler doctor then uses
the pinned prebuild for the very first author compilation, checks a second
cache hit, and includes Source101 asset selection in both profiles.
