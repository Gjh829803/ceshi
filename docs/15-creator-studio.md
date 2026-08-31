# Creator Studio

## Purpose

Creator Studio is a local or protected-hosted workbench for running the optional Scene Brief evaluation workflow, inspecting stage evidence, and opening verified worlds. It orchestrates Agents and trusted SDK commands; it is not another game engine, compiler or Canonical Schema owner.

The formal repository Planner/Builder workflow remains documented in `docs/12-plan-first-world-authoring.md` and `docs/13-multi-agent-world-authoring.md`. Studio's compact Scene Brief path is documented in `docs/22-hosted-scene-brief-and-evaluation.md`.

## Start

```bash
pnpm studio
```

- Studio: `http://127.0.0.1:4174/`
- Canonical preview: same-origin `/play?world=<scene-id>`

Studio starts or proxies the same unified Viewer used by `pnpm dev`, while its Host fixes the current attempt-bound Canonical source. The removed `?authoring=1` route is not a compatibility path.

## Current workflow

```text
Prompt + optional reference
  -> hosted Scene Brief Planner + self-check
  -> Authoring V4 Builder + self-check
  -> trusted normalization / IR V4 / ExecutionPlan V5
  -> Babylon/Havok runtime capture
  -> optional visual prompt/image providers
```

Studio carries one current unreleased workflow contract. It does not maintain V18-V23 runtime branches or import old WorldSpec/visual-plan records into the new hosted path.

## Isolation and persistence

Each case has an isolated working directory and is promoted atomically only after its required gates pass. Runtime data is stored under `apps/studio/data/` and is Git-ignored. Stage events, hashes, logs and evaluation receipts remain available after refresh or restart; an in-flight task whose process was lost becomes `interrupted` rather than being reported as running.

Evaluation image corpora are external inputs. Do not commit large generated/reference corpora to ordinary Git history. A corpus manifest must carry source, license/provenance, expected hashes and labels before a case is runnable.

## Public access

Copy `config/studio-public.env.example` to
`.codex-tmp/runtime-config/studio-public.env`, set `WORLDKIT_ACCESS_KEY` to at least 16 random
characters, then start the supervised entrypoint:

```bash
pnpm studio:public
```

The wrapper alone receives the Basic access key. It owns an internal Studio process on loopback
port 4197, proves that exact child ready with a private nonce, and only then opens the protected
proxy on loopback port 4175 (or `WORLDKIT_PUBLIC_PROXY_PORT`). The child environment does not
receive the Basic key or any `WORLDKIT_PUBLIC_*` wrapper setting. Child exit closes the public
listener; wrapper shutdown terminates the complete child process group with a bounded SIGTERM to
SIGKILL escalation.

`pnpm --filter @whitebox-world/studio public-proxy` remains a low-level command for a loopback
Studio that is already owned by an external supervisor. It may use
`WORLDKIT_PUBLIC_PROXY_TARGET`; `pnpm studio:public` does not delegate ownership to that target.

Both commands bind loopback only. They do not provide TLS, a tunnel, external artifact storage,
or long-lived production hosting. Quick tunnels are temporary demonstrations. A long-lived
deployment needs a fixed authenticated endpoint, external object storage for large artifacts,
and an isolated trusted worker.

## APIs

Core endpoints include:

- `GET /api/health`
- `GET /api/worlds`
- `POST /api/worlds`
- `GET /api/worlds/:id`
- `POST /api/worlds/:id/retry`
- `GET /api/worlds/:id/preview-bootstrap`
- `GET /api/worlds/:id/triviews/:visualTargetId`
- `GET /api/worlds/:id/styled-triviews/:visualTargetId`

The page does not perform a second hidden runtime capture through legacy `capture-start`, `capture-failed`, or `verify-entry` endpoints. Runtime capture is completed by the trusted CLI pipeline.

The Preview bootstrap is the only Studio-backed Authoring injection route. It atomically binds one Studio attempt, the Canonical AuthoringSpec hash, and the complete final Scene Brief implementation map. Playground rejects stale attempts, cross-scene maps, hash mismatches, and incomplete capture-group mappings before creating the Runtime adapter.

The Hosted visual contract uses `visualTargetId` as its only semantic identity. Builder writes the closed `worldkit-scene-brief-implementation-map-draft` with `visualTargetMappings`; the trusted host publishes the final `worldkit-scene-brief-implementation-map`; Runtime capture publishes `triviews/whitebox-triview-manifest.json` with `whiteboxTriviews` and canonical `imageUri` values. The retired `mappings`, capture-group `id`, and runtime tri-view manifest dialect are not accepted.

## Current boundary

The production path targets outdoor heightfield worlds. Interiors, caves, overhangs, dynamic platforms, vehicles, NPC behavior, flight, underwater navigation and networking must be reported as capability gaps unless a separately labelled experimental lane is explicitly selected.

Recording and downstream video generation are independent, user-triggered workflows documented in `docs/23-recording-and-video-workbench.md`.
