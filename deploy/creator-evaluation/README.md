# Creator experimental evaluation gateway

This adds a read-only Creator gallery under the existing evaluation hostname.
It serves standalone, verified Native artifacts. It does not register a formal
WorldPackage, change RuntimeHost admission, or restart the Studio control plane.

Observed deployment on 2026-09-05:

- Namespace: `lwdp`.
- Existing public entry: `worldkit-cloud-monitor-public`, a `LoadBalancer`
  Service with TCP port 80 and named target port `monitor` (4175). There is no
  WorldKit Ingress to which an additional HTTP path can simply be appended.
- Public hostname:
  `k8s-lwdp-worldkit-1b0222fb6d-f0f26ee23663e783.elb.us-east-2.amazonaws.com`.
- Existing selector: `app=worldkit-cloud-control-plane`.
- Existing read-only proxy forwards to Studio port 4197 and preserves its route
  allowlist. The old `/play` route currently returns 502 because its configured
  Playground at `0.0.0.0:5197` is not listening; this gateway does not repair or
  reclassify those old worlds.
- `lwdp/fsx-public-output-p125-pvc` is Bound and represents the same FSx output
  volume used by the Ray task mount. No credentials are mounted in this service.

The new `worldkit-cloud-monitor-upstream` ClusterIP Service selects the
unchanged old monitor containers. The new `worldkit-creator-evaluation`
Deployment serves `/creator-evals/*` and forwards all other permitted read
requests to that upstream. Its FSx mount is read-only and limited to one subpath.

## Content contract

The main task stages files under:

```text
/fsx/pipeline/worldkit-creator-experiments/gpt6-five-case-20260905/evaluation-static/
  index.html
  ... gallery assets, manifest and original reference images ...
  cases/<case-id>/playable/index.html
  cases/<case-id>/playable/assets/*
  cases/<case-id>/playable/subject-assets/*
  ... selected opening frames, videos and verification reports ...
```

Stage only approved public artifacts, not task workspaces, logs, authentication
files or SDK source trees. Each playable directory is the exact verified
standalone output; copy updates to a new directory and publish the gallery
index atomically. A user link may append `?play=1`. Pending/failed cases should
remain visible with their actual status and no enabled playable link.

The subpath must exist and contain a nonempty `index.html` before the Deployment
can become Ready. HTML/JSON are served without persistent caching; byte ranges
allow browsers to seek evaluation videos. Static serving supports relative
module, Wasm and GLB paths and rejects filesystem escapes.

The existing public hostname uses HTTP. Chromium therefore exposes
`crypto.getRandomValues` but not `crypto.randomUUID`; the verified Creator
artifact uses the latter to name its runtime session. The gateway inserts a
synchronous `host-compat.mjs` script into HTML responses. It adds UUIDv4 only
when the native method is missing and draws every UUID from `getRandomValues`.
There is no weak entropy fallback or `crypto.subtle` replacement.

This is a recorded Host deployment transformation, not a change to the original
delivery. Files, archive hashes, original artifact manifests and Runtime guards
remain unchanged. `/creator-evals/deployment-transforms.json` identifies the
transform and its script SHA-256. HTML responses include
`x-worldkit-original-sha256` and `x-worldkit-served-sha256`; byte ranges and ETags
describe the served representation. The compatibility script runs before the
original deferred scene module. Its route and the transformation metadata route
are reserved for the Host and do not expose arbitrary filesystem content.

The current cloud artifact also contains root-relative `/subject-assets/*.glb`
URLs. For requests whose same-origin Referer identifies
`/creator-evals/cases/<case-id>/<hash>/playable/`, the gateway serves the subject
from that exact verified playable directory. It requires a single canonical
`worldkit-content-hash` query and verifies SHA-256 before returning bytes.
This is an internal route alias, not a redirect, and supports different locked
subjects across cases. Missing files, mismatched hashes and path escapes fail;
requests outside gallery Referers continue to the old monitor. The transform
record identifies this rule, and alias responses expose their artifact hash.
No original JavaScript bundle is changed. The current byte limit per subject is
64 MiB; this bound also limits hashing memory per request.

## Install isolated resources

Run from this branch, after content has been staged:

```sh
kubectl create configmap worldkit-creator-evaluation-code -n lwdp \
  --from-file=gateway.mjs=deploy/creator-evaluation/gateway.mjs \
  --from-file=host-compat.mjs=deploy/creator-evaluation/host-compat.mjs \
  --dry-run=client -o json | kubectl apply -f -
kubectl apply -f deploy/creator-evaluation/resources.json
kubectl rollout status deployment/worldkit-creator-evaluation -n lwdp --timeout=120s
kubectl port-forward service/worldkit-creator-evaluation -n lwdp 4417:4175
```

Verify the gallery, a real playable page, an asset/GLB, a video range request,
`/__creator_eval_health`, and the existing `/api/health` through port 4417.
The factory has local regression tests:

```sh
node --test deploy/creator-evaluation/gateway.test.mjs
```

## Main-task cutover and rollback

The main task owns this final change to the shared public Service, after the
isolated service is healthy and the real browser smoke has passed:

```sh
kubectl patch service worldkit-cloud-monitor-public -n lwdp --type=merge \
  --patch-file deploy/creator-evaluation/cutover-selector.json
```

This keeps the existing load-balancer hostname and port and does not mutate the
old Deployment. Public gallery URL:

```text
http://k8s-lwdp-worldkit-1b0222fb6d-f0f26ee23663e783.elb.us-east-2.amazonaws.com/creator-evals/
```

Rollback is only the selector change:

```sh
kubectl patch service worldkit-cloud-monitor-public -n lwdp --type=merge \
  --patch-file deploy/creator-evaluation/rollback-selector.json
```

Future control-plane deployment scripts currently recreate the old selector.
Coordinate that shared Service ownership rather than silently replacing it.
No existing Service selector is changed by applying `resources.json` alone.
When changing gateway code after initial install, update its pod-template
version annotation so subPath-mounted ConfigMap files are refreshed by rollout.

## Deployment verification recorded on 2026-09-05

The main task switched the public Service selector to
`app=worldkit-creator-evaluation`. The gateway is Ready, its public health route
returns 200, and the unchanged Studio `/api/health` still returns 200.

At 04:55:06 UTC, real Chromium against the public HTTP hostname completed the
lighthouse standalone smoke. It reported `isSecureContext=false`, a working
CSPRNG UUID method, a ready Native runtime, and input/contribution hashes equal
to the cloud audit. Fixed input advanced 1.04 meters; `?play=1` automatically
started live simulation and a real W keypress also advanced 1.04 meters. There
were no page errors or failed requests. The original archive and exported
playable files were not changed. This confirms deployment compatibility and a
short movement smoke; full scene quality remains a separate evaluation.

Evidence is retained locally at
`.codex-tmp/gpt6-five-case-eval/host-review/gateway/public-http-report.json`,
`public-http-playable.png`, and `deployment-record.json`. Local gateway tests
pass all three cases, including root confinement, tampered subject bytes,
unrelated Referer fallback, read-only proxy behavior, and UUID compatibility.
The selector-only rollback command above restores the old entrypoint without
removing either the experimental service or its artifacts.
