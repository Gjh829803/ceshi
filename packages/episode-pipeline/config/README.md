# Episode configuration

- `episode-style-variants.json`: style generation and resume concurrency.
- `episode-visual-event-director.json`: event generation and Vertex adapter settings.
- `prompts/`: style planning, image generation, visual review and video-event prompts.
- `three-episode-review-calibration.json`: user-confirmed image-review calibration.
- `three-episode-runtime.example.json` and `three-episode-launcher-runtime.example.json`: Host and capsule-launcher configuration templates.
- `three-episode-seedance-provider.example.json` and `three-episode-seedance-admission.example.json`: provider, request registration, capacity and budget templates.

Templates require actual deployment values. Credentials remain outside Git.
Preparation requires `--stop-before-seedance`; provider dispatch and video recovery
use the separate [Seedance lane](../../../docs/three-episode-seedance.md).
