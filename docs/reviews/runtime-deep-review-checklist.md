# Runtime deep-review checklist

Use this checklist for Babylon/Havok runtime changes and for branches that modify input, movement, physics, animation, camera, render scheduling, assets, or runtime protocols. It turns the useful parts of the 2026-08-20 independent review into a repeatable engineering practice.

## 1. Establish the authority map

Before reading individual functions, write down the single owner and downstream consumers for each relevant state:

| State | Expected authority | Typical consumers |
| --- | --- | --- |
| Ground support | Havok character support query | jump eligibility, gravity, action selection |
| Water membership | semantic water sensor | movement-mode selection |
| Subject facing | motion kernel/controller | visual root, snapshot, subject-relative input |
| Camera orbit | Camera Director | Babylon camera, Browser controls, snapshot |
| Active action | semantic action resolver | animation player, snapshot |
| Simulation time | fixed-step accumulator/tick | motion, animation, deterministic protocol |
| Resource lifetime | explicit owner stack/cache lease | instance, scene, engine disposal |

Search for a second derivation of the same state. Height sampling must not also decide whether physics says the subject is supported; camera code must not also rotate the subject; render frames must not directly define simulation speed.

## 2. Check installed engine semantics

When correctness depends on Babylon or Havok behavior:

1. Record the installed package version.
2. Read the installed implementation or authoritative API documentation for the exact method.
3. Add a small executable probe or regression test when coordinate order, interpolation, controller integration, cloning, animation sampling, or disposal order is not obvious.
4. Preserve the discovered assumption in a focused test rather than a comment alone.

Typical traps include Euler composition order, heightfield axes, character-controller gravity, support-query timing, skeleton clone isolation, animation-group frame units, and cleanup methods that can throw.

## 3. Exercise adversarial data and transitions

Do not use only symmetric or steady-state fixtures.

- Geometry: non-square terrain, asymmetric height values, multi-axis rotations, edges, steep triangle-interpolated slopes, and colliders at non-zero offsets.
- Motion: unsupported spawn, walking off a raised surface, landing, jumping, holding Jump, releasing and pressing again, and switching the controlled subject while moving.
- Camera/input: orbit without subject rotation, movement after orbit, reset while keys are held, pointer/wheel/keyboard parity, and immediate snapshot after rebind.
- Time: deterministic fixed input plus 30, 60, and 120 Hz-like render intervals, long-frame capping, pause, reset, and zero-tick calls.
- Assets: two instances from one asset, independent skeletons/clips/sockets, missing mappings, malformed inventory, partial construction, and retry after rejection.
- Lifetime: every owned resource disposed exactly once even when a sibling throws; raw provider messages and causes must not cross public diagnostics.

For every transition, assert both sides of the boundary and the immediate state—not only the result after another tick hides a stale value.

## 4. Review merges semantically

For a branch integration, inspect base, incoming, and target versions of every shared runtime owner.

1. Build an authority matrix describing which side owns each behavior.
2. List behaviors that exist on only one side.
3. Resolve at the state/behavior level instead of selecting a whole conflicted file.
4. Add a regression for each behavior that could be silently lost.
5. Search for stale aliases, duplicate owners, fabricated compatibility refs, and public terminology introduced by either side.

The merge is complete only when the combined behavior is demonstrated; a clean textual merge or passing typecheck is insufficient.

## 5. Validate evidence at the right layer

- Unit/contract tests prove deterministic state and error behavior.
- Runtime integration tests prove real Babylon/Havok wiring and resource ownership.
- Browser conformance proves the host, resolver, camera, input, and rendered output work together.
- Visual inspection proves that a passing hash corresponds to the intended visible pose or scene, not merely a changed background.
- Manual interaction is required when the acceptance claim depends on human control feel or physical display hardware.

Evidence reports must name the exact commands, test counts, artifacts inspected, known warnings, and capabilities that remain experimental or unsupported.

## 6. Required completion gates

Run the focused reproducer first, then run each relevant full gate once on the final tree. Reuse a passing result while its inputs are unchanged; do not use a narrower alias to repeat coverage already provided by a broader command. In particular, root `pnpm test` already discovers the two files behind `pnpm test:scenes`. `pnpm test:studio` is separate because Studio uses Node's test runner, and Browser verifiers, rendered inspection, manual interaction, and production builds prove different evidence layers.

For changes touching the canonical Babylon runtime, select from this read-only base closure according to the affected contracts:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Studio and LWDP use separate Node test lanes and are added only when their inputs are affected:

```bash
pnpm test:studio
pnpm test:lwdp-client
```

Browser and capability verification is a separate evidence layer. The current coverage map includes:

```bash
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

The verifier list is not a blanket instruction for a read-only review. At the time of this checklist,
those four commands can promote tracked golden artifacts on their success path. Until each producer has a
separate read-only `--check` and explicit update command, reviewers must either reuse exact-input evidence or
record the verifier as not run; they must not run it and then discard its writes. An authorized implementation
session may update artifacts only when that update is part of the requested change and the resulting diff is reviewed.

These lists are coverage maps, not an instruction to rerun every command after every edit. Evidence becomes stale only when a subsequent change can affect that command's inputs or claim:

- runtime or shared-contract changes: focused regression, `typecheck`, root `test`, `build`, and the directly affected Browser/capability verifier;
- verifier, fixture, or capture changes: that verifier and its focused tests; add `build` only when shipped code or bundling changed;
- Studio-only changes: Studio tests/build path, without repeating unrelated Vitest or Babylon gates;
- documentation-only corrections: `git diff --check` plus link/claim inspection, without runtime replay.

After an independent review finds a narrow defect, run its failing reproducer before the fix and its focused regression after the fix. Reopen the entire closure only when the fix changes a cross-cutting public contract, shared runtime authority, dependencies, or build graph. Otherwise rerun only the invalidated evidence. Also run any capability-specific verifier added by the branch. Inspect generated screenshots when visual behavior is part of the claim. A known warning must be classified and tracked; it must not be silently described as success or automatically treated as a blocker.
