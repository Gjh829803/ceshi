# Rapier native query refresh

This is a local compatibility build of Rapier JS 0.20.0. The exact upstream
commit, archive SHA-256, patch SHA-256 and build tools are in [build.json](build.json).
The archive retains the upstream Apache-2.0 license. It is installed through the
SDK manifest and pnpm integrity lock; no Rust compiler is needed for normal use.

Rapier 0.20's JS API does not expose query-index refresh without a physics step.
Calling a zero-duration step still runs the physics pipeline. Supplementing rays
in JavaScript does not refresh the native character controller's BVH and cannot
preserve its sliding, autostep, grounding and filtering behavior.

The [patch](query-refresh.patch) adds `World.updateSceneQueries(handles?)`, which
propagates body positions and calls the existing native `BroadPhaseBvh.set_aabb`.
It preserves deferred pair bookkeeping and does not integrate bodies, drain
events or add a second query world. Omit handles for a full refresh; a selective
refresh must include every inserted or changed collider, including a new collider
that reuses a deleted slot. Deleted handles are resolved against the current set.

Both query filtering and BVH insertion respect explicit collider disable and the
current parent-body enable state. A pending parent re-enable may legitimately
leave a collider marked `DisabledByParent` until the next physics step. Explicit
collider disable remains authoritative. Settled disabled colliders must never be
reinserted merely to refresh queries.

Regression coverage lives in
[rapier-query-refresh.test.ts](../../packages/three-world/src/rapier-query-refresh.test.ts):
no integration, handle reuse, transformed normals/witnesses, filters, native KCC
sliding/autostep/snap, disabled-body lifecycle and normal collision events.
The SDK shared-physics and existing character/vehicle suites cover consumers.

To rebuild, use Rust 1.92.0 with the `wasm32-unknown-unknown` target and a Node/npm
installation. Put the selected Rust toolchain first in PATH, then run:

```sh
node vendor/rapier-query-refresh/rebuild.mjs .codex-tmp/rapier-rebuild
```

The directory must not exist. This downloads public upstream source and build
dependencies, applies the checked patch and uses the checked Cargo/npm locks.
It only writes to the supplied directory. Rust/WASM optimizer or npm pack tool
changes may produce different bytes: compare hashes and rerun consumer checks,
then use a new hash-bearing archive filename and regenerate the pnpm lock.
Never replace an existing archive in place. Runtime source identities include
the SDK manifest; Creator dependency staging includes the exact archive bytes.

When upstream exposes equivalent semantics, prefer the official release after
running these contracts and runtime regressions, then remove this local build.
