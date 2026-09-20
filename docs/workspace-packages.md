# Workspace packages

This pnpm monorepo has two workflows: maintain capabilities and produce worlds /
recordings / styled videos. They share the same SDK. Packages follow responsibilities;
there are no separate development and production copies of the runtime.

| Directory / package | Responsibility |
| --- | --- |
| `packages/three-world` · `@worldkit/three` | World SDK: one Three/Rapier runtime, public contracts, characters, physics, animation and cameras |
| `packages/camera-collision` · `@worldkit/camera-collision` | Camera collision solver used by SDK camera owners |
| `packages/creator-host` · `@worldkit/creator-host` | Agent discovery/tools, compilation, browser bridge, self-check and local delivery |
| `packages/episode-pipeline` · `@worldkit/episode-pipeline` | Source admission, action planning, capture, style/video preparation, dispatch and recovery |
| `packages/preset-content` · `@worldkit/preset-content` | Shared models, handling presets, calibration scenes and profiles |
| `packages/browser-capture` · `@worldkit/browser-capture` | Shared browser launch and rendered-video encoding |
| `packages/cloud-generation-client` · `@worldkit/cloud-generation-client` | Generation-service requests, polling/reconciliation and artifact transfer |
| `packages/world-ui` · `@worldkit/world-ui` | UI contracts, source-time tracks and React/json-render adapter |
| `packages/stream-protocol` · `@worldkit/stream-protocol` | Shared session/media/UI/input wire contracts |
| `packages/stream-player` · `@worldkit/stream-player` | Shared Web video and DOM UI player, input collection |
| `packages/stream-host` · `@worldkit/stream-host` | CLI sessions, Chromium producers, media/control transport |
| `apps/stream-web` · `@worldkit/stream-web` | Local development preview using the shared player |
| `apps/sdk-playground` · `@worldkit/sdk-playground` | SDK development, inspection and interactive calibration |
| `apps/creator-cloud` · `@worldkit/creator-cloud` | Creator admission, cloud tasks, immutable runtime packaging, recovery and evaluation publication |
| `apps/creator-evaluation-site` · `@worldkit/creator-evaluation-site` | Delivered-world browsing and the existing shared-review UI |

The established `@worldkit/three` package, `ThreeWorld` API, asset IDs, MCP tool
names, project profiles, external service routes and production artifact identities
retain their meaning. Namespace alignment of the internal camera package does not
change its solver API or runtime execution.

## Internal layout

The browser capture, preset content, Creator Host and Episode packages keep only
package metadata, README and maintenance instructions at their roots. Runtime code
lives in `src/`, tests in `tests/`, maintainer utilities in `scripts/`, documentation
in `docs/` and default data in `config/`, where each responsibility exists.

Creator separates discovery, compilation, browser integration, tool execution,
schemas and CLI entrypoints. Episode separates source admission, planning, capture,
workflow, batch/cloud execution, visuals, review, reporting and Seedance dispatch.
Preset content groups vehicles, creatures, humanoids, environments, assets and
profiles; browser capture keeps its two shared modules directly under `src/`.
Public package export names and root production commands remain stable.

## Dependencies

SDK → camera collision. Preset content → SDK. Creator → SDK, preset content and
browser capture. Episode → Creator's build/source contracts, SDK, browser capture
and cloud generation client. Creator Cloud → cloud generation client and explicit
Creator toolkit source/configuration. Playground → SDK, preset content and Creator
asset-loading support. Browser launch/encoding and generation transport have no
upstream Host dependency. Runtime packages do not depend on applications.

Streaming Host → Creator, SDK, browser capture, UI and protocol. Player → UI and
protocol; stream-web → player and protocol. Creator compiles UI using world-ui.
The UI and protocol packages do not depend on the world runtime.

Cross-package code imports explicit `exports` and declares direct dependencies.
SDK tests may use preset fixtures and Creator tests may verify downstream Episode
consumption; those edges are test-only. Production capsule projection omits them.
Repository integration scripts exercise whole workflows without reversing the
production dependency graph. Assets and deployment resources keep explicit
repository locations because their identities and consumers span components.

## Non-production Web UI

All Web pages outside the production pipeline use **React + Vite + shadcn/ui + Lucide
React**. This applies to Playground, local world/stream previews, debugging and
calibration consoles, inspection pages, visualization and reporting tools, and
other non-production pages. It is a common maintenance standard, not merely a
recommendation for the listed applications.

Use React for page composition/state, Vite for the development server and build,
shadcn/ui for application controls, and Lucide for icons. Specialized canvas/WebGL/chart rendering can be hosted within React.
New pages and migrations/substantial rewrites of existing pages follow this stack;
avoid introducing another UI stack or standalone imperative-DOM pages. Existing
pages are migrated as scoped work, not silently rewritten by this policy change.

Root development dependencies provide the `shadcn` CLI and default `lucide-react`
version. Each consuming app declares its direct React/UI dependencies and Vite
as a development dependency; root
installation is not a substitute for a pnpm package dependency. Keep adapted
components under the app's `src/components/ui`, with local `components.json` and
styling configuration. For example, run
`pnpm exec shadcn add button --cwd apps/stream-web`. Use explicit relative imports
in checked-in components so workspace typechecking can resolve them. Reuse the
app theme and keep developer layouts compact and informative. Do not create a
shared package solely for this convention.

Scope depends on responsibility, not hosting: a production page served locally is
still production UI. This standard does not impose React/Vite/shadcn/Lucide dependencies
on production pages, world HUDs, shared player runtime packages or Creator/Episode
production instructions.

## Instructions

Root `AGENTS.md` defines common repository rules. Nested `AGENTS.md` files define
maintenance rules for that component. Read applicable nested files before editing.

Creator production instructions start at
[task requirements](../packages/creator-host/docs/agent/README.md), followed on demand by
[programming](../packages/creator-host/docs/agent/programming.md),
[SDK navigation](../packages/creator-host/docs/agent/sdk.md) and
[asset navigation](../packages/creator-host/docs/agent/assets/README.md).
The cloud runner and discovery tools load these documents explicitly. A package's
maintenance AGENTS.md is not substituted for the production Agent's task prompt.
The [production workflow](three-sdk-data-production.md) remains the cross-stage entry.

## Commands

Run the existing production commands from the repository root; their semantics and
root-relative output paths are unchanged:

```sh
pnpm dev
pnpm three:creator --workspace /absolute/world --profile three-sdk --session
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/three-runtime
pnpm three:episode:source --payload /absolute/delivery/payload --output /absolute/source --world-id case-id
pnpm three:episode:run --source-manifest /absolute/source/source.json --output-root /absolute/episode --episode-id case-id --stop-before-seedance
```

Package scripts expose focused development entry points; use absolute external
input/output paths when invoking them with `pnpm --filter`. Repository scripts
retain test census, workspace boundaries and cross-package integration checks.
Building or validating a package does not start production or deploy a capsule.

## Frozen production runs

Queued Episode work keeps its original image and source-archive hashes. Operational
entrypoints select the known old or current path inside those frozen bytes; they
never replace the image/archive merely to obtain a new path. Streaming overlays
declare `sourceLayout` (`legacy`, `flat-package` or `structured-package`); omitted
values retain the historical `legacy` target. An overlay is installed only into
its matching hydrated layout, because pinned code contains layout-specific imports
and resource paths. Other layouts execute their archived workflow unchanged.
Creator supervision reads
its original pinned account-policy path from the saved plan; only equal bytes may
relocate to the package-owned default. See the
[workspace split receipt](reviews/2026-09-12-workspace-package-migration.md) and
[internal layout receipt](reviews/2026-09-12-package-internal-layout.md).
