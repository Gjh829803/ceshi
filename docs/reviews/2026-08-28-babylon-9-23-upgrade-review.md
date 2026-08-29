# Babylon.js 9.23.0 upgrade review

## Scope and authority

This upgrade changes the Babylon-backed Runtime provider dependency family without changing public
WorldKit Schema, movement ownership, collision semantics, camera ownership, or fixed-step behavior.
The Runtime continues to own Babylon/Havok handles behind provider-neutral ports.

Resolved dependency set:

- `@babylonjs/core`: `9.23.0`
- `@babylonjs/loaders`: `9.23.0`
- `babylonjs-gltf2interface`: `9.23.0`
- `@babylonjs/havok`: `1.3.14`

`pnpm outdated -r` reports no newer version for this dependency family as of 2026-08-28.

## Engine-dependent audit

The Runtime traversal implementation identity is rotated to `9.23.0+1.3.14`, and the Recast
compatibility allowlist is updated to the resulting backend and adapter hashes. The following
installed Babylon files were compared byte-for-byte between `9.21.2` and `9.23.0` and were
unchanged:

- `Physics/v2/characterController.js` and its declarations
- `Physics/v2/physicsAggregate.js`
- `Physics/v2/physicsShape.js`
- `Physics/v2/Plugins/havokPlugin.js` and its declarations

Havok remains at `1.3.14`; no provider behavior was inferred solely from the package version.

## Verification evidence

- Focused Runtime/Recast compatibility: 5 files, 140 tests passed.
- TypeScript workspace typecheck: passed.
- Resource-heavy Runtime/physics/route suite: 31 files, 464 tests passed.
- Root production build and Native Scene production build: passed.
- Browser interaction: spawn was grounded, the fixed-input main-route probe reached
  `-0.0 / 14.0 / -36.1`, remained grounded, and emitted no warning or error logs.
- Contract suite: 2484 of 2485 tests passed. The sole failure is the existing
  `terrain-surface` ownership-boundary test invoking `git ls-files` in this Diversion workspace;
  the ten spawn-safety behavior tests in the same file passed.

The Native Scene button is a deterministic traversal probe, not target-driven Runtime pathfinding.
Recast graph construction and A* reachability remain trusted offline Route validation only.
