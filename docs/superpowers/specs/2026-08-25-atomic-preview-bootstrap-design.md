# Atomic Preview Bootstrap Design

**Status:** implementation authority

**Baseline:** `main@749b594bb35830b5c92f8e6b7df1c645e36fc530`

**Finding authority:** `docs/reviews/2026-08-24-workspace-structure-authority-review.md` (`HSE-00`)

## 1. Goal

Close the Studio Preview authority race by replacing the separate AuthoringSpec and visual-capture-target reads with one fail-closed bootstrap that binds the current Studio attempt, Canonical AuthoringSpec hash, and complete final Scene Brief implementation map in one response.

This slice implements `HSE-00` only. It does not clean up the broader Hosted draft/final/manifest vocabulary (`HSE-01`), compose the public Studio process topology (`HSE-02`), or change Runtime, Browser V5, Gameplay, camera, physics, capture, or generated-schema ownership.

## 2. Current failure

Studio currently exposes:

- `GET /api/worlds/:worldId/authoring-spec`, which serves `authoring.json` directly; and
- `GET /api/worlds/:worldId/visual-capture-targets`, which reads the final implementation map but returns only `{ targets }`.

Playground Authoring mode requests both routes through `Promise.all`. The target loader validates only the projected target shape. It never receives the implementation map's `authoringSpecHash`, while neither route consumes the Studio record attempt or `evaluation-run.json` attempt identity.

All retries write the same `artifacts/scenes/:sceneId` directory. A successful old attempt and a new in-progress or newly published attempt can therefore be observed through separate reads. Textually valid inputs can be semantically cross-attempt or bind different AuthoringSpec content.

## 3. Considered approaches

### A. One atomic Host bootstrap — selected

Studio reads and validates all Preview authority inputs, checks the record before and after the read, and returns one closed response. Playground performs one request and defensively revalidates the response before creating the Runtime adapter.

This is the smallest change that removes the multi-request race and establishes one Preview input owner.

### B. Immutable artifact directory per attempt — deferred

Publishing each attempt into a separate immutable directory provides stronger storage isolation, but changes generation paths, cleanup, recovery, deliverables, visual tooling, and retention. That is larger than the reproduced HSE-00 defect and is not required once one bootstrap validates a stable attempt snapshot.

### C. Two routes plus a generation token and client retry — rejected

Returning a token from both existing routes would preserve two reads and require retry/reconciliation logic in the browser. It creates a second consistency algorithm instead of making the Host own the snapshot.

## 4. Authority and contract

Studio is the single serialized-response owner. Existing Authoring V4 and final `SceneBriefImplementationMapV1` remain the domain owners; HSE-00 does not define aliases for either.

The only Studio Preview route is:

```text
GET /api/worlds/:worldId/preview-bootstrap
```

Its successful JSON response is:

```ts
interface StudioPreviewBootstrapV1 {
  kind: "worldkit-studio-preview-bootstrap";
  schemaVersion: 1;
  worldId: string;
  sceneId: string;
  attempt: number;
  attemptStartedAt: string;
  authoringSpecHash: `sha256:${string}`;
  authoringSpec: AuthoringSpecV4;
  implementationMap: SceneBriefImplementationMapV1;
}
```

`implementationMap.visualCaptureGroups` is the only capture-group field. The bootstrap must not add a second top-level `targets` or `visualCaptureGroups` projection. `authoringSpecHash` equals both `sha256CanonicalJson(authoringSpec)` and `implementationMap.authoringSpecHash`.

The contract is route-scoped for this unreleased Studio/Playground integration. HSE-00 does not add a new general-purpose package or place Hosted attempt state in Runtime contracts. The existing final implementation-map type and validators remain in `@whitebox-world/runtime-contracts`; Playground owns only the narrow bootstrap wrapper type needed to consume this route. HSE-01 may later move Hosted wire types to a dedicated owner as an explicit clean break.

## 5. Server snapshot algorithm

The route performs these steps in order:

1. Read `recordBefore` for `worldId`.
2. Require a positive integer `attempt`, a valid `sceneId`, `captureStatus: "passed"`, and a non-empty attempt start identity. Generated records use `startedAt`; imported trusted worlds use their stable `createdAt` as the synthetic attempt start.
3. Read `authoring.json`, `scene-implementation-map.json`, and `evaluation-run.json` when the record represents a generated attempt.
4. Parse AuthoringSpec and the final implementation map as JSON records.
5. Compute the AuthoringSpec hash with the same sorted-key canonical JSON semantics as the authoritative protocol.
6. Validate the complete final implementation-map shape, mapping/group closure, scene identity, AuthoringSpec identity, and AuthoringSpec hash join.
7. For generated worlds, require `evaluation-run.json` to match `worldId`, `sceneId`, `workflowPolicyVersion`, `attempt`, and `startedAt`.
8. Read `recordAfter` and require its `id`, `sceneId`, `attempt`, attempt start, status/capture publication state, and workflow policy to equal `recordBefore`.
9. Return one newly allocated response value. No file paths or provider objects enter the response.

An imported `origin: "existing-scene-brief-world"` has no execution attempt process. Its persisted `attempt: 1` and `createdAt` form the synthetic attempt identity, while the canonical AuthoringSpec and final map hash join still must pass. If an evaluation run is present, it must also match rather than being ignored.

The pure snapshot assembler lives outside the HTTP route so stale/cross-attempt cases are deterministic unit tests rather than timing-dependent filesystem tests.

## 6. Failure semantics

The Host fails closed and never returns a partial bootstrap:

| HTTP | Code | Meaning |
|---|---|---|
| `404` | `STUDIO_PREVIEW_NOT_FOUND` | World or required Preview artifacts do not exist |
| `409` | `STUDIO_PREVIEW_NOT_READY` | Current attempt has not published trusted whitebox capture |
| `409` | `STUDIO_PREVIEW_ATTEMPT_DRIFT` | Record/evaluation identities changed or disagree |
| `409` | `STUDIO_PREVIEW_AUTHORITY_MISMATCH` | AuthoringSpec, map, mappings, groups, or hashes do not close |

Errors use `{ code, error }` with `cache-control: no-store`. There is no fallback to the two removed legacy Preview routes.

Playground reports a stable Authoring startup failure before adapter creation when the bootstrap request or defensive validation fails. It must not start with Authoring alone, empty capture groups, or a stale implementation map.

## 7. Client data flow

In Studio-backed Authoring mode (`world` query present), Playground performs exactly one network request through `loadStudioPreviewBootstrapV1`.

The loader:

- requires the exact wrapper discriminator and closed identity fields;
- recomputes `sha256CanonicalJson(authoringSpec)`;
- validates the complete final implementation map with `validateSceneBriefImplementationMapV1`;
- checks world/scene/spec/hash joins; and
- serializes a defensive canonical copy of the AuthoringSpec for the existing Authoring loader and derives capture targets only from `implementationMap.visualCaptureGroups`.

`loadAuthoringScene` remains the single Authoring parse/normalize/compile owner. The bootstrap loader supplies its validated AuthoringSpec as an in-memory canonical response; it does not duplicate normalization or compilation. Adapter startup continues to configure capture targets before mount and first render.

Non-Studio Authoring mode, where `world` is absent and `worldkit run` injects the default AuthoringSpec source, remains unchanged and uses no capture groups.

## 8. Clean break and public proxy

Studio is explicitly unreleased. The old `/authoring-spec` and `/visual-capture-targets` routes are removed rather than retained as aliases. The public proxy allowlist replaces those paths with `/preview-bootstrap` and rejects the removed paths.

README and Creator Studio documentation name the atomic route and state that it is the only valid Studio Preview injection path. This does not change the existing rule that plain `pnpm dev` must not be combined with `?authoring=1`.

## 9. Verification

Required focused evidence:

- pure assembler accepts one coherent generated attempt;
- stale evaluation attempt, changed record-after attempt, cross-scene map, wrong AuthoringSpec hash, incomplete mappings/groups, and malformed wrapper all fail with the stable code;
- imported trusted worlds receive one synthetic, internally closed bootstrap;
- the HTTP route returns one bootstrap and removed routes return `404`;
- public proxy permits only the new bootstrap route;
- Playground loader rejects hash/attempt/map drift and returns defensive data for a valid response;
- `main.ts` Authoring startup consumes one fetch and no longer uses `Promise.all` for Preview authority.

Required integration evidence on the final unchanged tree:

- focused Studio and Playground tests;
- `pnpm test:studio`;
- `pnpm typecheck`;
- root `pnpm test` once;
- `pnpm build` once;
- `git diff --check` and tracked/untracked mutation audit;
- fresh host full-dimension completion review with every finding independently dispositioned.

Browser/render/manual claims remain separate. This slice changes startup input consistency, not visual output or interaction behavior, so no new production capability may be claimed from these tests.

## 10. Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | `depends_on` | `blocks` | Exclusive ownership | Input/output contract and integration point | Required evidence | Mode |
|---|---|---|---|---|---|---|---|
| `HSE00-01` | Pure atomic bootstrap assembler and adversarial identity tests | — | `HSE00-02`, `HSE00-03`, `HSE00-04` | `apps/studio/src/preview-bootstrap.mjs`, its test; wrapper field contract | record before/after + artifact values → complete bootstrap or stable coded failure | coherent, stale, cross-attempt, cross-scene, hash, closure, imported cases | `main-agent-only` |
| `HSE00-02` | Studio route clean break and public proxy boundary | `HSE00-01` | `HSE00-03`, `HSE00-04` | `apps/studio/src/server.mjs`, Studio route tests, proxy allowlist/tests | one `GET /preview-bootstrap`; old routes absent | real HTTP success/failure, no-store, allow/deny tests | `sequential` |
| `HSE00-03` | Playground single-fetch loader and startup integration | `HSE00-01`, `HSE00-02` | `HSE00-04` | `apps/playground/src/authoring-loader.ts`, loader tests, `main.ts` | bootstrap response → Authoring loader input + map-owned capture groups | valid defensive copy; wrapper/hash/map/attempt negatives; single-fetch startup | `sequential` |
| `HSE00-04` | Docs, audit disposition, final integration and review | `HSE00-01..HSE00-03` | — | `docs/15-creator-studio.md`, audit report, final gate evidence | current implementation → truthful active docs and historical finding disposition | focused tests, Studio, typecheck, root test, build, mutation audit, independent review | `main-agent-only` |

All ready mutation work shares the same route contract or startup integration. `worker_limit=0`; the main agent owns the full sequence. Independent review remains read-only after host integration.

## 11. Non-goals

- Do not add immutable per-attempt artifact directories.
- Do not change Studio retry scheduling, queue concurrency, artifact generation, or recovery.
- Do not rename or version-clean the final/draft Hosted implementation-map family in this slice.
- Do not merge CaptureTargetManifest and RuntimeTriviewManifest here.
- Do not change Authoring V4, IR V4, ExecutionPlan V5, Browser V5, Snapshot V4, Gameplay, Runtime, camera, physics, or capture semantics.
- Do not retain old Preview routes or fields as compatibility aliases.
