# Rapier native query refresh

This is a local build of Rapier JS 0.20.0. The exact upstream
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

`World.solverContactNormals(first, second)` copies world-space normals oriented
from the first collider toward the second, without stepping. It reads upstream
`ContactPair.solver_manifolds()` and includes only manifolds with solver contacts.
This includes the solver clusters used for compound and voxel shapes. The existing
geometric `contactPair` API omits those clusters; its empty solver-contact arrays
cannot establish that a clustered pair has no support. This observation API does not change
clustering, contact generation or physics solving. The regression covers both
clustered and ordinary contact, swapped order, copied results and separation.

The pinned Parry 0.30.2 source also receives [a voxel cast correction](parry-voxel-cast.patch).
Its candidate AABB includes `target_distance`, as the actual per-cell cast already
does. Otherwise a character approaching within its collision skin can miss the
floor until its physical capsule reaches the surface. The expanded AABB drives
both initial candidates and traversal. A grid edge rounded just inside that AABB
is treated as an immediate crossing, rather than discarding the entire sweep
direction. Positive/negative thin-wall casts cover this floating-point boundary.
The advancing candidate window retains one trailing cell, so a leading-edge
crossing cannot drop a cell still covered by the shape's trailing edge. The
per-cell narrow phase still selects the earliest hit.
These corrections do not enlarge the collider, change
controller offsets or add another collision path. The source archive checksum
and patch checksum are pinned in `build.json`; the Cargo lock uses that local
patched source. Native skin casts and the SDK camera/character tests cover it.

The KCC impulse path computes contact manifolds independently for each nearby
dynamic collider before combining them with their body/pose metadata. Parry may
overwrite the vector passed to `contact_manifolds`; treating it as append-only
could erase the contacted body's points or apply them to an unrelated body.
The impulse formula is unchanged. A two-body regression checks both insertion
orders, actual push velocity and zero impulse on the uncontacted neighbor;
the Creator furniture example verifies the complete SDK consumer.

To rebuild, use Rust 1.92.0 with the `wasm32-unknown-unknown` target and a Node/npm
installation. Put the selected Rust toolchain first in PATH, then run:

```sh
node vendor/rapier-query-refresh/rebuild.mjs .codex-tmp/rapier-rebuild
```

The directory must not exist. This downloads public upstream source and build
dependencies, applies the checked patches and uses the checked Cargo/npm locks.
It only writes to the supplied directory. Rust/WASM optimizer or npm pack tool
changes may produce different bytes: compare hashes and rerun consumer checks,
then use a new hash-bearing archive filename and regenerate the pnpm lock.
Never replace an existing archive in place. Runtime source identities include
the SDK manifest; Creator dependency staging includes the exact archive bytes.

When upstream exposes equivalent semantics, prefer the official release after
running these contracts and runtime regressions, then remove this local build.
