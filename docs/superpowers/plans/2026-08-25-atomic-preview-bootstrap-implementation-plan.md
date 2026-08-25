# Atomic Preview Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan. In this run the approved dependency graph has `worker_limit=0`, so the main agent executes the plan sequentially with superpowers:executing-plans.

**Goal:** Close HSE-00 by giving Studio-backed Playground Preview one atomic, fail-closed bootstrap that binds one Studio attempt, Canonical AuthoringSpec V4, and the complete final Scene Brief implementation map.

**Architecture:** A pure Studio-side assembler validates the before/after record snapshot, generated evaluation identity, canonical AuthoringSpec hash, and implementation-map closure. The HTTP route performs file I/O around that assembler and exposes only `/preview-bootstrap`. Playground performs one fetch, defensively repeats contract validation, feeds an in-memory canonical AuthoringSpec into the existing Authoring compiler owner, and derives capture targets only from the returned map.

**Tech Stack:** Node.js ESM and `node:test` for Studio; TypeScript, Vitest, `@whitebox-world/authoring`, and `@whitebox-world/runtime-contracts` for Playground; pnpm workspace gates.

**Design authority:** `docs/superpowers/specs/2026-08-25-atomic-preview-bootstrap-design.md`

---

## Task 1: Pure atomic bootstrap assembler (`HSE00-01`)

**Files:**

- Create: `apps/studio/preview-bootstrap.mjs`
- Create: `apps/studio/preview-bootstrap.test.mjs`
- Modify: `apps/studio/package.json`

**Step 1: Write the failing contract tests**

Create generated and imported fixtures with valid AuthoringSpec/map joins. Assert that the generated case returns exactly:

```js
{
  kind: "worldkit-studio-preview-bootstrap",
  schemaVersion: 1,
  worldId,
  sceneId,
  attempt,
  attemptStartedAt,
  authoringSpecHash,
  authoringSpec,
  implementationMap,
}
```

Add adversarial cases for record-after attempt drift, evaluation-run attempt drift, cross-scene map, wrong canonical AuthoringSpec hash, missing mapping/group closure, not-ready capture, and an imported trusted world with synthetic identity.

**Step 2: Run RED**

Run `node --test apps/studio/preview-bootstrap.test.mjs`. Confirm it fails because `preview-bootstrap.mjs` does not exist.

**Step 3: Implement the minimum pure owner**

Export:

```js
export class StudioPreviewBootstrapError extends Error {
  constructor(code, message) { /* stable code */ }
}

export function assembleStudioPreviewBootstrapV1({
  worldId,
  recordBefore,
  recordAfter,
  authoringSource,
  implementationMapSource,
  evaluationRunSource,
}) { /* validate and return defensive value */ }
```

Use a local sorted-key JSON serializer plus `node:crypto` SHA-256 because Studio is a plain Node ESM app and must not import TypeScript source. Match the authoritative protocol's JSON semantics. Validate the full map identities, mapping/group closure, target roles, colors, and unique runtime ownership. Generated records require a matching evaluation run; imported records use `createdAt` as `attemptStartedAt` and validate an evaluation run if one is present.

**Step 4: Run GREEN and register the test**

Run `node --test apps/studio/preview-bootstrap.test.mjs`, then add the file to `apps/studio/package.json`'s `test` command and run `pnpm --filter @whitebox-world/studio test`.

**Step 5: Commit**

Commit the pure authority slice as `feat(studio): assemble atomic preview bootstrap`.

## Task 2: Studio route and public proxy clean break (`HSE00-02`)

**Files:**

- Modify: `apps/studio/server.mjs`
- Modify: `apps/studio/server.test.mjs`
- Modify: `apps/studio/public-proxy.mjs`
- Modify: `apps/studio/public-proxy.test.mjs`

**Step 1: Write failing HTTP and allowlist tests**

Add real-server coverage that writes a coherent record, AuthoringSpec, final implementation map, and evaluation run, then asserts:

- `GET /api/worlds/:id/preview-bootstrap` returns the complete joined bootstrap with `cache-control: no-store`;
- stale evaluation identity returns `409` with `STUDIO_PREVIEW_ATTEMPT_DRIFT`;
- a missing artifact returns `404` with `STUDIO_PREVIEW_NOT_FOUND`;
- the old `/authoring-spec` and `/visual-capture-targets` routes return `404`.

Add public-proxy assertions that the new GET route is forwarded and the two removed routes are forbidden.

**Step 2: Run RED**

Run `node --test apps/studio/server.test.mjs --test-name-pattern='preview bootstrap'` and `node --test apps/studio/public-proxy.test.mjs --test-name-pattern='public Studio pages'`. Confirm the new route/allowlist expectations fail.

**Step 3: Implement the route boundary**

Import the pure assembler. For `/preview-bootstrap`, read the record and required artifact sources, distinguish not-found from invalid authority, read the record again, invoke the assembler, and return a fresh JSON value with `private, no-store`. Map only the four designed stable error codes to `404`/`409`; unexpected errors remain server errors. Delete the two legacy route handlers.

Change the public allowlist from the two legacy suffixes to `preview-bootstrap`, keeping `reference` separately allowed.

**Step 4: Run GREEN**

Repeat the two focused commands, then run `pnpm test:studio`.

**Step 5: Commit**

Commit as `feat(studio): expose atomic preview bootstrap`.

## Task 3: Playground single-fetch consumption (`HSE00-03`)

**Files:**

- Modify: `apps/playground/src/authoring-loader.ts`
- Modify: `apps/playground/src/authoring-loader.test.ts`
- Modify: `apps/playground/src/main.ts`

**Step 1: Write failing loader tests**

Replace the projected-target test with `loadStudioAuthoringPreviewV1` tests. Build a complete valid implementation map and assert:

- exactly one bootstrap fetch occurs;
- the returned Authoring load succeeds and targets are defensive copies of `implementationMap.visualCaptureGroups`;
- attempt `0`, malformed discriminator, world/scene/spec mismatch, wrong canonical hash, invalid full map, and non-2xx responses fail before adapter creation.

**Step 2: Run RED**

Run `pnpm exec vitest run apps/playground/src/authoring-loader.test.ts --testNamePattern='Studio authoring preview'`. Confirm it fails because the new loader is absent.

**Step 3: Implement the defensive client loader**

Import `stringifyCanonicalJson`, `validateSceneBriefImplementationMapV1`, and the map type. Export a narrow route-scoped `StudioPreviewBootstrapV1` interface and:

```ts
export async function loadStudioAuthoringPreviewV1(
  worldId: string,
  fetchBootstrap: AuthoringSourceFetcher,
  options?: AuthoringSceneLoadOptionsV1,
): Promise<{
  loaded: AuthoringSceneLoadResult;
  visualCaptureTargets: readonly RuntimeCaptureTargetV1[];
  attempt: number;
  attemptStartedAt: string;
}>;
```

Fetch once, validate the wrapper and complete map, recompute the canonical hash, verify every identity join, deep-clone the map-owned capture groups, and call the existing `loadAuthoringScene` with an in-memory canonical JSON `Response`. Delete `loadRuntimeVisualCaptureTargets`.

**Step 4: Integrate startup**

In `main.ts`, keep the no-`world` `worldkit run` path unchanged. When `world` exists, call `loadStudioAuthoringPreviewV1` once against `/api/worlds/:id/preview-bootstrap`. Remove the Preview `Promise.all`, both old URLs, and old return-type references.

**Step 5: Run GREEN**

Repeat the focused Vitest command, run `pnpm typecheck`, and use `rg` to prove the two removed route names and loader export no longer exist in active source.

**Step 6: Commit**

Commit as `feat(playground): consume atomic preview bootstrap`.

## Task 4: Documentation, audit disposition, and final integration (`HSE00-04`)

**Files:**

- Modify: `docs/15-creator-studio.md`
- Modify: `docs/reviews/2026-08-24-workspace-structure-authority-review.md`
- Modify only if generated by an approved command: tracked generated artifacts

**Step 1: Update active documentation**

Document `/api/worlds/:id/preview-bootstrap` as the only Studio Preview injection route and explain its attempt/spec/map binding. Remove the two retired route names.

**Step 2: Update the finding objectively**

Mark `HSE-00` implemented on this branch, cite exact source/test evidence, update outstanding P1 counts and the work graph, and preserve HSE-01/HSE-02 as open. Do not claim Browser rendering or manual interaction evidence.

**Step 3: Run final unchanged-tree gates once**

Run, in order:

1. focused assembler, HTTP/proxy, and Playground loader tests;
2. `pnpm test:studio`;
3. `pnpm typecheck`;
4. root `pnpm test` once (it already includes scene tests);
5. `pnpm build` once;
6. `git diff --check`;
7. `git status --short`, `git diff --stat`, and generated/untracked mutation audit.

Do not rerun narrower commands already covered on the unchanged tree unless a later fix invalidates their inputs.

**Step 4: Run independent completion review**

Use the project-local `reviewing-with-cursor` skill in read-only mode. Reproduce every actionable finding locally, fix only confirmed defects with a failing regression first, and rerun only the invalidated focused/full gates described by the review protocol.

**Step 5: Commit and push**

Commit the truthful docs/final fixes, verify branch/upstream state, and push `codex/hse-00-atomic-preview-bootstrap`. Report the exact commit(s), gate evidence, remaining HSE findings, and branch state.
