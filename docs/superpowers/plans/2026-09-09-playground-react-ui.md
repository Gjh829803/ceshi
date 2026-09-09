# Playground React UI migration

User scope: migrate all editor UI on a new branch, preserve visual layout and
SDK execution/input behavior. React and local shadcn/ui form components own the
editor state; shared scene geometry, physics and profiles retain their owners.

Implementation:
1. Add an independent maintainer frontend in `apps/three-playground`, Vite + React
   + Tailwind, with a hash-verified catalog asset closure for dev and static build.
   Keep Creator authoring compiler dependency rules unchanged.
2. Render shell/sidebar/HUD/shortcuts/overlays with React, mounting HUD with a
   portal into Presentation. Preserve a stable world canvas and 100 ms UI sampling.
3. Convert inspector, asset library, scene/profile workbench, humanoid lab,
   equipment and performance views to React. Reuse shared scene/config modules;
   keep form actions immediate and per-subject state independent.
4. Validate actual input, modal pause/resume, focus restoration, reset, local
   persistence, source model lifetime, static build, types and test census.

File ownership during parallel work: inspector agent owns inspector and its test;
asset library agent owns library and its test; panels agent owns workbench,
humanoid/equipment panels, preview helper and panel tests. Root owns shared
components, tooling, shell, scene bridge and integration.

The original `examples/three-creator/sdk-capabilities` remains the Creator example.
Maintainer editor entry: `pnpm dev:editor`; static build: `pnpm build:editor`.
