# Babylon Native Import Profile Bake-off

**Date:** 2026-08-28
**Decision:** ACCEPT Deep ESM; REJECT root barrel
**Artifact:** `artifacts/native-import-profile/bakeoff.json`

## Question

Choose one Babylon.js import dialect for AI-authored Native scene modules without retaining a second supported style. The comparison used source-equivalent fixtures that reference only `Color3`, `MeshBuilder`, `StandardMaterial`, `TransformNode`, and `Vector3`; neither fixture creates an Engine, Scene, Render Loop, Camera, Physics object, timer, or input owner.

## Environment and method

- `@babylonjs/core`: `9.23.0`
- resolved Vite: `7.3.6`
- Node: `22.21.0`
- macOS: `15.7.3`, `x86_64`
- CPU: Intel Core i9-9880H
- Vite programmatic build: ES output, `minify: false`, `sourcemap: false`, `write: false`, `inlineDynamicImports: true`
- no external imports

The Deep ESM fixture imported the five symbols from their exact official module files. The root-barrel fixture imported the same five symbols from bare `@babylonjs/core`. The installed Babylon package declares every `**/index.js` side-effectful along with a large set of provider modules, so the root index cannot be assumed to have the same graph as deep imports.

## Results

| Candidate | Outcome | Modules | Babylon modules | JavaScript bytes | Elapsed |
| --- | --- | ---: | ---: | ---: | ---: |
| Deep ESM | measured twice | 330 | 328 | 2,884,740 | 10.779–22.098 s |
| root barrel | rejected; manually stopped | unavailable | unavailable | unavailable | more than 150 s |

The missing root-barrel values are intentionally `null` in the artifact. They were not fabricated after the candidate exceeded the observation budget. Repeated attempts also showed that retaining the rejected full build as a Vitest contract would add unbounded duration and contention to every repository gate.

## Decision

Deep ESM is the sole current Babylon Native Import Profile:

```ts
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
```

The rejected root-barrel experiment is not retained as an executable compatibility path or recurring benchmark. Task 3 permanently enforces the decision at the `@whitebox-world/native-babylon` package boundary by rejecting bare `@babylonjs/core`, namespace imports, legacy `babylonjs`, and paths outside the frozen profile.

This bake-off answers the dependency and bundle-boundary question only. BNA-6 remains responsible for measuring AI first-pass generation and repair success using the one selected profile; it must not reopen two public dialects.
