# Current Three configuration

This directory contains public configuration and templates used by the current
Three production lane. Real credentials and instance-specific configuration stay
outside Git under ignored `.codex-tmp` or in deployment Secrets.

| File | Consumer / purpose |
| --- | --- |
| `episode-style-variants.json` | Episode style generation and resume concurrency |
| `episode-visual-event-director.json` | Episode event generation and Vertex adapter |
| `prompts/three-episode-style-director.md` | Style planning |
| `prompts/three-episode-image.md` | Styled image generation |
| `prompts/three-episode-review.md` | Image review |
| `prompts/episode-visual-event-director.zh-CN.md` | Video visual-event prompts |
| `three-episode-review-calibration.json` | User-confirmed image review calibration |
| `three-episode-device-plugin.json` | Three GPU infrastructure manifest generation |
| `three-episode-runtime.example.json` | Host runtime configuration template |
| `three-episode-launcher-runtime.example.json` | Capsule launcher configuration template |
| `workspace-boundary-debt.json` | Workspace-boundary verification |

The templates require actual deployment values before use. Episode entry points
still require `--stop-before-seedance`; configuration does not enable video
submission or automatic Creator delivery subscription.

Unused earlier scene/Episode/video-provider configs, migration ledgers, old env
examples and the old capture public key were removed. Historical records may name
those former paths; retrieve their original contents from Git history rather than
using them as current production instructions.

See the [production guide](../docs/three-sdk-data-production.md) for entry points
and configuration ownership.
