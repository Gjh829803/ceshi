# @worldkit/stream-host

Local CLI/service owning world sessions, Chromium producer lifecycle, encoded
whitebox video, UI observations and remote input routing. It reuses Creator
compilation and the SDK's existing capture/input owners. Playwright starts the
browser; WebCodecs encodes frames without a screenshot loop.

```sh
# From repository root: build the debug app, then serve the maintained example.
pnpm dev:stream
# Or supply a project directory / directory containing project subdirectories:
pnpm --filter @worldkit/stream-host exec tsx src/cli.ts \
  --worlds /absolute/worlds --web-root /absolute/stream-web/dist --port 53900
```

Open the returned localhost URL. The HTTP API exposes `GET /v1/worlds`,
`POST /v1/sessions` (`{worldId}` plus optional `Idempotency-Key`), authenticated
`GET`/`DELETE /v1/sessions/:id`, and `POST /v1/sessions/:id/reset`.
The returned descriptor carries the session bearer token and UI artifact identity.
Reset recreates the producer and increments the session epoch.

The public `startStreamHost` API accepts `worldsDirectory`, optional `webRoot`,
`port`, `fps`, `width`, `height`, `headless` and `allowedOrigins`.
The service binds loopback. Cross-origin embedding must explicitly allow the
consumer origin (`--allow-origin http://localhost:3000`). It is not a public
multi-tenant deployment: gateway authentication/TLS, GPU launch configuration,
model adapters and authorization of user-uploaded modules remain deployment work.

See [Agent UI authoring](../creator-host/docs/agent/ui.md) and
[the design](../../docs/superpowers/specs/2026-09-17-world-streaming-ui-design.md).

Sessions with no open control or media clients expire after 60 seconds. Rejoining
within that grace period keeps the same world, state and epoch. HTTP status probes
do not extend the lease. Configure `idleSessionTimeoutMs` or CLI
`--idle-timeout-ms` (0 disables expiry for a deliberately persistent producer).
Stopping and expiry share the same idempotent cleanup, including browser context.

Video defaults can be set with CLI `--width`, `--height`, `--fps` and `--bitrate`
(bits/second), or the corresponding `startStreamHost` options. Session creation
accepts optional `video: {width,height,fps,bitrate}`. Authenticated
`POST /v1/sessions/:id/video` applies those four fields to a running producer.
It drains encoding, resizes the SDK renderer, configures a new encoder and starts a
new media generation/keyframe, without resetting world state or session epoch.
The current layout supports approximately matching aspect ratios (including the
854×480 rounded 16:9 preset). Settings updates are serialized against resets.
The descriptor includes current video settings; connected players receive
`session.video`. Bitrate is an encoder target, not guaranteed measured throughput.

The default demo catalog is [`examples/worlds`](../../examples/worlds/README.md).
Each direct child containing `project.json` is a world; dot directories are ignored.
Optional `case.json` metadata supplies a friendly title (`schemaVersion: 1`,
`title`, `uiProtocolVersion: 1`). The project directory name remains its stable ID.
The older `examples/three-creator` directory contains API/test fixtures and is not
loaded into the public demo catalog.
