# Agent-facing API

The only current Agent world-authoring API on this branch is Block World V2:

```text
world.mjs
  -> direct metric THREE.Mesh boxes with immutable preset refs
  -> Scene extraction and provider-neutral Manifest
  -> Subject-relative Block check
  -> Host-owned 32-meter chunk clustering and runtime compilation
```

Use `.codex/skills/worldkit-block-builder/SKILL.md` for hosted Builder work and
[`Three.js Block World Authoring Design`](superpowers/specs/2026-08-26-threejs-block-world-authoring-design.md)
for the public contract. Agent code does not write a second JSON world,
implementation map, physics values, or Runtime objects. The portable Skill
runtime injects the real `THREE` namespace before the ESM module loads.

The Agent never authors chunk metadata. The Host coalesces same-semantics shapes
without crossing chunk or visual/interaction identity boundaries. Babylon
restores visible metric blocks as thin instances, keeps all far render batches
available, and owns only a bounded Subject-centered ring of merged Chunk
collision in Havok.

The existing Canonical/IR/ExecutionPlan packages are internal Host transport and
runtime services. Browser Protocol V5 remains the runtime observation/control API.
