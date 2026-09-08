# Current Three configuration

This directory contains public configuration and templates used by the current
Three production lane. Real credentials and instance-specific configuration stay
outside Git under ignored `.codex-tmp` or in deployment Secrets.

| File | Consumer / purpose |
| --- | --- |
| [`three-creator/asset-policy.json`](three-creator/asset-policy.json) | Creator Host asset admission and default humanoid |
| [`three-creator/account-policy.json`](three-creator/account-policy.json) | Creator Host account routing; frozen per run |
| `episode-style-variants.json` | Episode style generation and resume concurrency |
| `episode-visual-event-director.json` | Episode event generation and Vertex adapter |
| `prompts/three-episode-style-director.md` | Style planning |
| `prompts/three-episode-image.md` | Styled image generation |
| `prompts/three-episode-review.md` | Image review |
| `prompts/episode-visual-event-director.zh-CN.md` | Video visual-event prompts |
| `three-episode-review-calibration.json` | User-confirmed image review calibration |
| `three-episode-runtime.example.json` | Host runtime configuration template |
| `three-episode-launcher-runtime.example.json` | Capsule launcher configuration template |
| `three-episode-seedance-provider.example.json` | Seedance endpoint, private inputs and output policy |
| `three-episode-seedance-admission.example.json` | Registered requests, shared capacity and production budget |
| `workspace-boundary-debt.json` | Workspace-boundary verification |

Asset metadata belongs in [`assets/three-creator`](../assets/three-creator/README.md).
The Kubernetes device-plugin manifest belongs in
[`deploy/three-episode`](../deploy/three-episode/README.md); its generator stays in `scripts/cloud`.

The templates require actual deployment values before use. Episode preparation
requires `--stop-before-seedance`; the separate
[Seedance cloud lane](../docs/three-episode-seedance.md) has explicit submission
and delivery commands. Automatic Creator delivery subscription is not implemented.

See the [production guide](../docs/three-sdk-data-production.md) for entry points
and configuration ownership.
