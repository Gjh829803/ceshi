# Recording and Video Workbench

## Boundary

Recording is a separate, explicitly user-triggered module. It is not a stage of automatic world generation and does not change Scene Brief, WorldSpec, AuthoringSpec, Canonical World State, runtime capture or styled tri-views.

The source of motion truth is the real Babylon canvas recording. Generated video is a downstream visual product, never runtime or simulation evidence.

## Per-recording workflow

1. `CanvasRecorder` records only the Babylon canvas through a fixed 1280×720, 16:9 capture canvas requested at 24 fps.
2. The browser uploads a WebM or MP4 body to the Studio recording API.
3. Studio streams at most 256 MB to a temporary sibling file, checks the container signature, then normalizes it to 1280×720 at exactly 24 fps. It truncates the duration to a positive integer number of seconds and verifies the exact `seconds × 24` frame count before atomically promoting it.
4. The user explicitly requests prompt/video generation for one saved recording.
5. The prompt job freezes the Studio's currently selected `cloud` or `local` Codex backend, then receives the real whitebox recording, the primary-subject styled tri-view, the styled opening frame, and optional landmark tri-views with stable roles.
6. Re-generating after changing the selected backend rewrites the prompt on the newly selected backend; retrying on the same backend may reuse its successful prompt.
7. A configured video adapter receives the final prompt and authorized references. The request requires synchronized environmental/action sound effects and forbids music, speech, narration, singing, or dialogue.
8. Provider output is conformed back to 1280×720 at 24 fps with an audio stream and exactly the same frame count as the normalized whitebox recording.
9. Source and generated videos remain separately inspectable and downloadable.

A failed prompt or provider call never destroys the recording and never falls back to an unreviewed prompt. The operation can be retried from persisted inputs.

## Local API

```text
GET  /api/recording-worlds/:sceneId/recordings
POST /api/recording-worlds/:sceneId/recordings
POST /api/recording-worlds/:sceneId/recordings/:recordingId/generate
GET  /api/recording-worlds/:sceneId/recordings/:recordingId/source
GET  /api/recording-worlds/:sceneId/recordings/:recordingId/generated
GET  /api/recording-worlds/:sceneId/recordings/:recordingId/prompt
GET  /api/recording-worlds/:sceneId/recordings/:recordingId/prompt-template
GET  /api/recording-worlds/:sceneId/recordings/:recordingId/bundle
```

The upload request includes `X-WorldKit-Recording-Duration-Ms`. Provider credentials, Authorization headers, signed URLs and provider download URLs are never written to portable result JSON.

## Provider adapters

The repository includes one experimental reference-video adapter and non-secret example configuration. That configuration is an integration example, not the SDK protocol and not a commitment to a model name, endpoint or concurrency setting.

Provider-specific request shapes stay behind the adapter. The stable workbench contract is:

- source recording;
- ordered reference roles;
- final prompt;
- generated video or structured provider failure;
- sanitized run metadata.

## Download bundle

The per-recording ZIP contains available portable inputs and outputs:

- original whitebox recording;
- Planner `world-plan.png`;
- prompt template and final prompt;
- styled opening frame and styled tri-views;
- generated video;
- sanitized run metadata;
- recording manifest.

Temporary bundle directories are removed after the HTTP response closes.
