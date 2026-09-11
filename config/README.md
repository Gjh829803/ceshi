# Configuration ownership

Repository-wide workspace-boundary debt lives in `workspace-boundary-debt.json`.
Production configuration belongs to its consumer:

| Owner | Configuration |
| --- | --- |
| [Creator Host](../packages/creator-host/config/asset-policy.json) | Asset admission and default humanoid |
| [Creator Cloud](../apps/creator-cloud/config/account-policy.json) | Account routing, frozen per run |
| [Episode pipeline](../packages/episode-pipeline/config/README.md) | Style/event prompts, review calibration, runtime and provider templates |
| [Three SDK](../packages/three-world/src/config/README.md) | Runtime defaults and developer effect switches |

Real credentials and instance-specific runtime settings stay outside Git in ignored
`.codex-tmp` or deployment Secrets. Asset metadata stays under `assets/three-creator`;
deployment resources stay under `deploy/`. The SDK does not import Host production
configuration. See [production entry points](../docs/three-sdk-data-production.md).
