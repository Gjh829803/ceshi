# @worldkit/stream-protocol

Versioned session, source frame, codec, UI and input contracts shared by Host and
player. Media uses binary WebSocket packets: a big-endian four-byte JSON header
length, UTF-8 header and encoded video bytes. Control messages use JSON on a
separate WebSocket. Payload limits and input validation live here.

Frame headers preserve `sessionId`, session `epoch`, `mediaGeneration`, output
PTS/ID, source SDK epoch/tick/time/frame ID, UI revision and completeness watermark.
An eventual model adapter must preserve this mapping; output PTS alone cannot
select the corresponding UI state. This package does not implement a model service.

`stream.subscribe {epoch,ui,clock}` changes a viewer's UI subscription independently
of its input/control channel; `clock: true` requires `ui: true`. The server replies
with `stream.subscribed` and restores the current UI checkpoint. `ui.clock` carries
source time, simulation tick, UI revision and completeness watermark for UI-only
presentation. Combined playback continues to use video source-frame mappings.

`source.diagnostics {epoch,diagnostics}` reports producer-local sampled capture and
encode completion counts, sample duration and current encoder queue every second.
It is independent of UI subscription and does not advance the simulation.

Input receipts preserve the Host's session-wide `sequence` plus `clientId` and
`clientSequence`, which the Host adds before forwarding input to the producer.
Players match only their own echoed client identity/sequence when timing receipts;
reconnect or another viewer's sequence must not be mistaken for a local request.
Action receipts retain their existing unique `actionId` correlation.
