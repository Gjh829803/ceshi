# @worldkit/stream-player

Shared Web player for encoded video plus source-timed React UI. The same component
is used by the local debug application and embedding consumers.

```tsx
import {WorldStreamPlayer} from '@worldkit/stream-player/react';
// session is the JSON descriptor returned by POST /v1/sessions.
<WorldStreamPlayer session={session} onError={console.error} />
```

Requires a secure-context browser with WebCodecs VP8 decoding (localhost qualifies).
The player uses a canvas for decoded video and a scaled Shadow DOM for the world's
React component bundle. It validates the module hash and uses a shared React/Motion
runtime. Components are trusted application code, not a JavaScript sandbox.

UI is selected using the displayed frame's source identity/revision/watermark.
Unmapped UI is hidden. Numeric tracks use source time, so packet arrival does not
start the animation early. No final combined video stream is exported.

Click the picture to focus keyboard input; drag to rotate and wheel to zoom.
UI controls emit catalog-defined actions. Blur/disconnect releases held input.
Only the controller sends actions; other viewers can render the same session.
Set `interactive={false}` to disable player input. The Host must allow the consumer
origin when it differs from the Host origin. React Native/native rendering is not
implemented in this package.

`onConnectionsChange` reports control/media WebSocket states and controller role.
`onDiagnostics` samples displayed FPS, media receive kbps, last-frame age, decoder
queue size, queue drops, source/UI identity and input receipt tick every second.
Last-frame age measures time since local presentation, not network round-trip or
end-to-end latency. Values continue updating while stalled so zero throughput is
visible independently of connection state.

`viewMode="combined" | "video" | "ui"` controls actual subscriptions as well as
visible layers. UI-only closes the client media WebSocket and VideoDecoder, then
presents snapshots/animation using source-clock messages on the control channel.
Video-only unsubscribes UI data while retaining control/input. Combined mode maps
UI to decoded source frames. Switching back from UI-only waits for a new keyframe;
it does not reset the world or session. The source producer may continue encoding
for other consumers; UI-only does not claim that backend encoding stops.
`onVideoSettingsChange` reports live session encoding changes. The debug consumer
updates its session descriptor to reflect dimensions, FPS and target bitrate.

`safeAreaInsets={{top,right,bottom,left}}` accepts nonnegative CSS-pixel insets
relative to the displayed video surface (default zero). The player converts these
to UI design units; `layoutReference: "safe-area"` widgets respect them. Overlay
height follows the actual surface instead of assuming encoded pixels equal UI
pixels, preserving bottom anchors across resolution rounding and player resize.

Connection telemetry includes `ui: subscribing | subscribed | paused` and media
`disabled` for UI-only. Diagnostics also report UI message/bit rates, UI presentation
FPS, outgoing input packet/event rates and input receipt age. Input packets include
heartbeat/held-state repair; event counts distinguish actual control intent.

Changing `interactive` from true to false immediately clears local held keys and
pointer capture and sends a final input release. While false, keyboard/pointer/
wheel handlers do not enqueue input, named UI actions are suppressed, and input
heartbeats stop. Re-enabling does not replay interactions made while disabled.
Video/UI subscriptions and world simulation remain independent of this flag.

Diagnostics distinguish `uiCommitsPerSecond`, `uiSnapshotsPerSecond` and
`uiClocksPerSecond`. These count received state deltas, full checkpoints and clock
messages separately; zero deltas does not imply a disconnected UI subscription.

`inputAckMs`, `inputAckP95Ms` and `inputAckSamples` measure matched real-input and
named-action receipts on the client's monotonic clock. Idle heartbeats are excluded.
Keyboard/pointer receipts acknowledge SDK input sampling; action receipts acknowledge
handler settlement. Neither includes subsequent video encoding or visible response.
P95 uses up to 128 matched samples in the last 60 seconds. Unmatched/duplicate replies
are ignored; pending requests expire after 30 seconds and are capped at 256. Coalesced
inputs without an individual matching receipt do not contribute a sample. No samples
means null latency, not zero. Disconnect and epoch reset clear receipt measurements.

`sourceDiagnostics` contains producer-local interval counts for completed captures,
encoded frames and the encoder queue. Divide counts by `sampleDurationMs / 1000`
to get actual source FPS. Samples expire after three seconds without an update;
invalid diagnostics are ignored locally. Source statistics remain available in
UI-only mode and are separate from UI traffic counts.

`onEvent` emits bounded-detail connection, subscription, mode, resync, session,
video-setting and error events. It does not log each frame, heartbeat or UI update.
Consumers own event retention and presentation.
