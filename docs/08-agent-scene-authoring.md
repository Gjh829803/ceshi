# Block Builder scene authoring

Create `artifacts/scenes/<scene-id>/world.mjs` with the
[`worldkit-block-builder`](../.codex/skills/worldkit-block-builder/SKILL.md)
Skill. Directly create and bind the four admitted metric Three.js boxes, declare one controlled
Subject and centered third-person Camera, then run the Skill self-check.

The self-check derives the internal runtime transport and visual mapping. Repair
only `world.mjs`; do not hand-edit those derived files. Then run the Skill's
`render-visual-review.mjs`, open both left-Planner/right-Builder comparison PNGs,
and iterate on `world.mjs`. Build the uploaded view as an entry slice of one
continuous world, including the Brief's middle, side/rear off-camera, and remote
regions. Its top-down footprint must cover at least four times the
reference-visible geographic area without padding. Ground support connectivity
is required only when every movement mode is ground-based; hybrid/free-space
mode sets may use disconnected ground islands. The SDK derives ground-only cliff
boundaries automatically.

For design rationale, preset semantics and implementation status, read the
[`Block World design`](superpowers/specs/2026-08-26-threejs-block-world-authoring-design.md).
