# World streaming UI implementation receipt

Baseline: user-selected `dev` at `514fd6ba261f079620c47c49228c70d70f6e8cb1`.
Implementation worktree: `agent-whitebox-world-sdk-stream-design`, branch
`codex/world-stream-ui`. The original checkout is preserved.

## Delivered path

`stream-host` compiles a world with Creator, starts its Chromium page and captures
pure renderer pixels with source metadata. VP8/WebCodecs frames and separate UI
snapshots/commits travel over WebSockets. `stream-player` decodes frames, selects
matching UI state, renders the world's json-render/React components and samples
Motion values on the video's source clock. Input returns through one SDK lease.
`stream-web` uses this same player and service, with no duplicate simulation.

The maintained `examples/three-creator/streaming-ui` project includes a movable
character, custom health bar, declared damage/heal actions, typed component catalog
and source-time retargetable health animation. Creator produces component types,
CSS/assets and hashed module manifests. Relative imported image URLs resolve against
the world bundle even when the player is embedded elsewhere.

Agent discovery exposes `ui.md` through `creator_get_authoring_schema` and links it
from the programming guide. See [authoring instructions](../../packages/creator-host/docs/agent/ui.md)
and [running the Host](../../packages/stream-host/README.md).

## Verification

- 11 affected Vitest files / 65 tests passed: UI recording/history, protocol, player
  coordination, remote input, native input, capture/presentation, Creator compilation
  and discovery, Episode source export, and a real Chromium end-to-end session.
- The end-to-end test verifies video playback, world-owned health changes, actor
  displacement from remote input, control/media socket reconnection and epoch reset.
  Relevant tests were rerun after lifecycle and component asset fixes.
- TypeScript, focused ESLint, test census, workspace dependency boundaries, Markdown
  local links and diff whitespace checks are part of the final checks.
- Web app production build succeeds. Its main bundle is approximately 770 kB / 243 kB
  gzip; Vite emits a chunk-size advisory. No throughput claim follows from the build.
- SDK runtime prebuild succeeds: runtime hash
  `66de15ea7e1d1a61622e908e1892652182fccc63fe48870022dd62a75b477197`, manifest hash
  `8e6fa49e12871067b021d35e6cab683e8a9437abe202bcd71f4400975eda95cd`.
- The Codex in-app browser displayed the actual stream and DOM HUD at localhost;
  the observed session showed zero unmapped frames. This is local technical evidence,
  not production/GPU performance acceptance.

## Remaining scope

The working path is whitebox passthrough. World-model adapters and GPU deployment
have not been implemented or exercised. The service is loopback-bound; external
embedding requires an explicit allowed origin. Public gateway authentication,
transport encryption and multi-tenant admission belong to deployment integration.

Documents are static trees; custom typed array/object props support richer lists.
Dynamic topology/repeat, native App rendering, a producer-inspection iframe and
server-baked composite video are not included. The source page can be inspected via
`--headed`; the shared player remains the final interaction/display surface.

## Local development console follow-up

The debug app now uses shadcn/ui Button/Badge/Card/Tooltip/Collapsible and Lucide
icons. Root development dependencies own the CLI and default icon version; the
app declares its direct dependencies. The convention in AGENTS.md is explicitly
limited to local development Web pages, not production UIs or world HUDs.

The compact layout shows the connected same-origin Host and HTTP probe, real
media/control connection events and controller role. Twelve sampled metrics cover
FPS, receive bitrate, frame age, source time, UI revision, decoding, queue drops
and input receipt. Service selection across multiple remote Hosts is not included.

## Session lifecycle follow-up

The local console now restores tab-local sessions after refresh, including a
pending create request using the same idempotency key. Active recovery fetches the
current epoch/descriptor and preserves world state. A definitive expired/not-found
response clears the record; transient connectivity failures retain a retry action.
No access token appears in navigation URLs or diagnostic labels.

Host sessions expire after 60 seconds with no open viewer control/media sockets
(configurable; 0 disables expiry). Reconnect cancels expiry, status probes do not
extend it, and explicit stop/shutdown/expiry share idempotent context cleanup.
The browser integration regression includes refresh during creation, refresh after
health changes, continued remote input, reconnect/reset, idle resource reclamation
and recovery from an expired saved session.

## Layer display and video settings

The shared player now supports video-only, UI-only and combined display without a
session restart; UI-only now advances from source-clock messages without a client media connection.
The local console uses shadcn NativeSelect for resolution, target FPS and bitrate.

Per-session video settings reach the producer's actual encoder and SDK renderer.
Live changes drain the old encoder and start a new media generation/keyframe;
world state and session epoch are retained. The browser regression switches to
UI/video-only modes and back, changes 640×360/12 fps to 854×480/24 fps/1 Mbps,
checks actual decoded canvas dimensions, retained health/session identity and
subsequent input/reconnect/reset. Protocol tests reject invalid encoder settings.

## JSON layout follow-up

UI document elements declare familiar React/CSS positions, sizes, translate and
layer in `layout`, with separate `layoutReference` safe-area metadata. A pure resolver and strict validation define the geometry; the React adapter
owns the viewport wrapper while custom components own internal visuals/animation.
The sample health bar and bottom controls now declare placement in definition.json,
with outer coordinates removed from component CSS.

The player derives logical UI height from the actual video surface and exposes
CSS-pixel safe-area insets to embedders. Tests cover CSS edge/percentage sizing and translate,
invalid fields and exhausted safe areas; the real browser regression measures HUD
margins and width across player resize and encoded-resolution changes. This is a
static viewport layout contract, not a full responsive breakpoint/flow engine or
an implemented native App renderer.

## Connection topology and independent subscriptions

The debug console moves connection status to a top-level directed topology with
world, video, UI, player and reverse input nodes. Animated paths are tied to actual
traffic/subscription state. Heartbeats, control intent and receipts are separated.

UI-only now closes the client media socket/decoder and uses validated source-clock
messages; video-only unsubscribes UI but keeps input/control. Switching modes does
not restart the world. Source-side encoding may continue for other consumers.
The browser regression verifies zero open client media sockets in UI-only, continued
health actions/updates, and reconnection to video with retained world state.

## Console diagnostic follow-up

Added per-type UI traffic rates, source capture/encode interval counters and
client-clock receipt timings. The Host preserves the originating client sequence
alongside its session-wide input sequence so reload/reconnect cannot misattribute
receipts. Timing samples exclude idle heartbeats, have bounded memory and expiry,
and explicitly do not claim final picture response latency. Source diagnostics
expire after three seconds and invalid measurements degrade locally.

The console groups Media and Control connections, nests UI/input under Control,
and exposes a collapsed, bounded event history. Diagnostic observation adds no
simulation steps or camera/input owners. Creator/Episode runtime ownership remains
unchanged; the real Host/player integration exercises this diagnostic consumer.
