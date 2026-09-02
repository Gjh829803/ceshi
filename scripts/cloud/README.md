# WorldKit Cloud Scene Orchestration

This directory moves execution and durable artifacts to the LWDP cloud without
changing the Scene production behavior. The worker calls the existing
`pnpm agent:world` command; its Planner, Builder, Host replay, Runtime capture,
and Visual Reconstructor remain authoritative and unchanged.

Episode production uses the same boundary. Studio submits one custom
`episode-production` worker stage rather than the service's built-in fine-grained
Episode template. The worker hydrates one already-admitted Scene manifest into an
ephemeral workspace, runs the unchanged `pnpm episode:run` workflow, builds the
portable review ZIP, uploads the complete Episode tree plus a hash-closed manifest
to S3, and destroys the workspace. Planner, six independent captures, one-call
Gemini events, direct Seedance 2.5 720p, conformance, and their retry behavior
stay inside the existing workflow.

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
- `submit-worldkit-cloud-episode.mjs` binds one Episode request to an admitted
  Scene execution and creates exactly one `episode-production` worker stage.
- `run-worldkit-cloud-episode-worker.mjs` owns GPU Babylon capture, the complete
  downstream Episode workflow, S3 publication, heartbeats and cancellation.

The ten-style worker stage has a twelve-hour deadline. Infrastructure retry uses the same
immutable request ID and source hashes. A new Planner or Builder result is never
silently substituted during a downstream-only recovery.
Episode attempts publish a hash-closed partial manifest before reporting a
terminal failure. A later attempt, or an explicitly adopted replacement Cloud
Execution after the original attempt budget is exhausted, may resume only from
that declared manifest and its exact source execution identity. Resume checks
content identities rather than download mtimes, so S3 hydration never causes a
completed Gemini, Seedance, or conformance stage to rerun.

Creator Studio's `cloud` backend is this end-to-end path. It stores only the
Cloud Execution identity and admitted remote artifact index, streams verified
artifacts from S3 on demand, and never falls back to local Host capture. The
`local` backend is an explicit developer lane. A transient browser capture
failure receives one Host-only retry inside the isolated worker; a later manual
Host recovery reuses the exact prior manifest through the same Cloud Execution.
Creation, dispatch and Worker launch are separately persisted recovery points:
after a lost response or Studio restart, the Host looks up and advances the
same `execution_id`, and `kubectl apply` only idempotently restores its pinned
Worker Job. It does not create another execution or rerun an admitted Agent.
Nested Codex submission capacity and transport failures receive at most three
Stage attempts with isolated request IDs and S3 prefixes. A terminal Codex task
that delivers none of its required outputs receives the same bounded treatment;
an authored self-check or world-validation failure does not. If Ray completed but
LWDP progress is stale, the Worker may continue only from an exact 1/1-success
delivery report plus a single-task manifest whose declared output URIs exactly
match the current task. A non-terminal LWDP record may be failed early only when
the exact Ray submission reports a narrow infrastructure terminal such as a
dead node, dead Job supervisor, or unavailable Runtime Env Agent; authored-code
and validation failures are never inferred by this probe. Cloud Host-only
recovery is available only when the remote manifest contains the complete
Planner and Builder handoff. If Planner completed but Builder failed for one of
those infrastructure reasons, the same Cloud Execution may instead hydrate the
hash-closed Planner Brief, self-check, palette, planning images, and references,
replay the trusted Planner checks, and run only the existing `--build-only`
continuation. An early Planner/submission failure still performs a full retry.

## Required cloud configuration

The worker Job expects the following in namespace `lwdp`:

- ServiceAccount `lwdp-be`, with access to the configured S3 prefixes.
- Secret `lwdp-generation-token`, key `token`.
- Secret `worldkit-cloud-capture-signing`, key `private.pem`.
- Episode workers additionally require Secret `worldkit-episode-runtime`, with
  keys `infinite-canvas.key`, `gemini.env`,
  `google-service-account.json`, `aws-credentials`, and `aws-config`.

The Worker `LWDP_USER_ID` must always be copied from the same project-local LWDP
config used to create the Cloud Execution. LWDP isolates executions by tenant;
falling back to a generic `worldkit-studio` user after submitting as
`partner_codex` makes a valid execution appear as HTTP 404.

Create or update the Episode Secret directly from the project-local runtime
configuration without printing its values:

```bash
pnpm cloud:episode:apply-runtime-secret -- --namespace lwdp
```

Episode capture is scheduled on a GPU worker pool and requests
`nvidia.com/gpu: 1` by default. The image bakes a static Playground with the
worker-local `5297` asset origin; Studio listens only on loopback `4297` inside
the disposable pod. Large videos and the ZIP are served to Studio through
short-lived S3 URLs so Browser Range playback never hydrates them locally.
The production config owns the optional Kubernetes `nodeSelector` and
`tolerations`; the current cluster selects the scale-to-zero Karpenter
compatible Karpenter pools through only `workload-type=ray-gpu`, and tolerates
the GPU and Ray taints shared by those pools. Capacity type, AZ/FSx zone and
image cache are intentionally not pinned because Episode production is S3-only:
Karpenter may choose primary/fallback and Spot/On-Demand capacity according to
availability. Do not hard-code a synthetic `workload-type=gpu` label in the
Worker manifest.

`config/cloud-episode-production.json` is enabled only with a built and pushed
digest-pinned image. The image contains Chromium/Playwright, ffmpeg, Python
provider clients, AWS tooling and `zip`, because the portable bundle is built
inside the disposable Worker. A mutable tag or an image that predates the
Episode worker is invalid.

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
