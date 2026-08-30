# WorldKit Cloud Scene Orchestration

This directory moves execution and durable artifacts to the LWDP cloud without
changing the Scene production behavior. The worker calls the existing
`pnpm agent:world` command; its Planner, Builder, Host replay, Runtime capture,
and Visual Reconstructor remain authoritative and unchanged.

## Production boundary

- `submit-worldkit-cloud-scene.mjs` uploads immutable user inputs and creates
  one durable `scene-production` worker stage.
- `launch-worldkit-cloud-worker-job.mjs` starts one digest-pinned Kubernetes Job
  for that execution. It reads the LWDP token and capture signing key from
  Kubernetes Secrets; neither value appears in the Job payload or logs.
- `run-worldkit-cloud-scene-worker.mjs` claims the lease, downloads inputs into
  an ephemeral workspace, runs the existing pipeline, heartbeats internal
  `WORLDKIT_STAGE` markers, uploads all artifacts and logs to S3, and reports
  one terminal stage result.
- `run-worldkit-cloud-scene-batch.mjs` submits up to 20 test-set cases while
  persisting only a small recovery manifest locally and in S3.
- `monitor-worldkit-cloud-scene-batch.mjs` polls the exact execution IDs from
  that manifest. It never relies on a collection listing or rediscovers work.

The worker stage has a six-hour deadline. Infrastructure retry uses the same
immutable request ID and source hashes. A new Planner or Builder result is never
silently substituted during a downstream-only recovery.

## Required cloud configuration

The worker Job expects the following in namespace `lwdp`:

- ServiceAccount `lwdp-be`, with access to the configured S3 prefixes.
- Secret `lwdp-generation-token`, key `token`.
- Secret `worldkit-cloud-capture-signing`, key `private.pem`.

The corresponding capture public key is a trust root owned outside the
artifact bundle. Do not copy the private key into the repository, S3 inputs,
Cloud Execution payloads, prompts, or logs.

Always launch the image as an ECR digest (`repository@sha256:...`), never by a
mutable tag. The Dockerfile is at `deploy/cloud-worker/Dockerfile`.

## Verification

```bash
pnpm test:cloud-orchestration
pnpm typecheck
```

One real cloud smoke must reach `succeeded` and publish
`cloud-artifact-manifest.json` before starting a 20-case batch.
