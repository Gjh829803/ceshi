# Planner, Block Builder and visual generation

The current workflow has one authority per stage:

1. Planner: prose intent and two non-runtime images.
2. Block Builder: direct Three.js `world.mjs` plus two deterministic visual-review comparisons.
3. Trusted Host: extraction, checks, runtime compilation and capture.
4. Visual generation: styled images from verified whitebox evidence.

No stage may silently edit another stage's authority. Full commands and artifact
boundaries are in [`Hosted Scene Brief and Evaluation Workflow`](22-hosted-scene-brief-and-evaluation.md).
