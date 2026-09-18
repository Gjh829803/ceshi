# @worldkit/stream-web

Development preview for the streaming Host. Select a world, inspect the shared
player, exercise UI actions and inspect frame/tick/UI revision diagnostics.

Run `pnpm dev:stream` from the repository root. This builds the application and
starts the same Host/producer path used by the CLI. The debug UI owns no simulation
or alternative player implementation. The producer is a separate Chromium page;
an embedded producer iframe inspection view is not currently included.

The compact console uses app-owned shadcn/ui components (Button, Badge, Card,
Tooltip and Collapsible) with Lucide icons. The root supplies the component CLI;
this app declares its own runtime dependencies. Connections show real media/control
WebSocket events. HTTP service health is probed every five seconds. Frame rate and
video receive bitrate are sampled every second; last-frame age is not end-to-end
latency. The first version connects to the same-origin Host shown in the service
list; it does not aggregate arbitrary remote services.

A tab stores only its session ID/access token or pending creation request ID in
sessionStorage. Refresh restores the current server descriptor and the same world;
a refresh during startup retries the same idempotency key. Closed/expired sessions
are cleared with an explicit message. Transient restore failures retain the record
and expose a retry action rather than silently creating another producer. Closing
the tab leaves the Host's reconnection grace period; “结束会话” releases it immediately.

The stage toolbar switches video/UI/combined display. Video controls offer 360p,
480p, 720p and 1080p, 12/24/30/60 target FPS and 0.5–12 Mbps target bitrate. Set them
before starting or apply them while running. UI uses decoded-frame source time in combined mode and independent source-clock
messages in UI-only mode; applying settings preserves the world. Actual throughput remains visible in
the metrics. The select control is the locally adapted shadcn NativeSelect.

The top connection diagram is a React/SVG topology in shadcn Card/Badge/Tooltip
components, using Lucide endpoint icons. Video, UI and reverse input paths animate
only with observed traffic in the last one-second sample; idle input heartbeats
keep a static connected line and never trigger motion. Connected nodes have
stream-colored backgrounds, inactive nodes retain a faint translucent stream color with dashed borders, and
pending/error states use amber/red. Reduced-motion preferences disable the motion.
It shows real client subscriptions and shared control transport separately. UI-only
closes media, video-only unsubscribes UI, and input/control remains available.

The “操作响应” switch beside the layer selector is enabled by default. It controls
all in-view input forwarding through the shared player's `interactive` prop.
Disabling it also dims the reverse-input topology path; playback and UI updates
continue. Session management and stream settings remain available outside the view.

The service panel groups two physical connections: Media WebSocket and Control
WebSocket, with UI downlink and input uplink nested inside Control. The topology
uses the same control group boundary while preserving independent subscriptions.

Monitoring separates actual source capture/encode FPS from target and client
presentation FPS, and separates UI deltas/checkpoints/clocks. Receipt timing shows
latest/P95 and the number of matched samples; its tooltip explains the 60-second,
128-sample window and that receipt timing excludes visible video response. Missing
or stale source samples display a dash. A collapsed recent-event list retains the
latest 50 entries in the page, merges consecutive identical events, and resets on
page refresh. It contains transitions/errors, not per-frame logs or access tokens.

The default demo catalog is [`examples/worlds`](../../examples/worlds/README.md).
Each direct child containing `project.json` is a world; dot directories are ignored.
Optional `case.json` metadata supplies a friendly title (`schemaVersion: 1`,
`title`, `uiProtocolVersion: 1`). The project directory name remains its stable ID.
The older `examples/three-creator` directory contains API/test fixtures and is not
loaded into the public demo catalog.

The topology canvas is 200 CSS pixels high; transport groups and reverse-input
routes retain their own status and traffic animations in the compact layout.
