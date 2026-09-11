# Display preview implementation plan

> Execute inline with superpowers:executing-plans and test-driven-development; use an independent read-only review before delivery. No production jobs.

**Goal:** Add the accepted first release of layered previews to Playground: material, clay, unlit, depth, normals, semantic colors, wireframe and collision-only, with subject/type filters and collision/interaction overlays.

**Architecture:** A Playground-owned diagnostic surface renders the existing scene and interpolated camera only after the source renderer finishes. It has no simulation or animation loop. All material, visibility, fog, lighting and helper changes are synchronous transactions restored in `finally`. The SDK source canvas and Creator/Episode contracts remain clean. The optional diagnostic renderer is allocated only when a preview is requested.

**Tech stack:** Existing Three 0.185.1, React/Radix, Vitest, Playwright. No new dependencies.

**Spec:** User-approved first-release proposal in this task; ownership constraints in [architecture](../../three-sdk-architecture.md).

## Constraints

- Keep original meshes, skins, transforms, physics and camera ownership.
- Derive categories from actual Playground roots; unknown geometry remains unclassified.
- Depth means linear camera-space metres; transparent surfaces use their alpha cutout, and blended surfaces are treated as surfaces in depth preview.
- Diagnostics are optional, never production gates or model-input pixels.
- Retain existing humanoid collision control and synchronize it with the new panel.
- Do not alter the unrelated untracked camera assessment in the main checkout.

## Tasks

- [x] Add transaction tests in `apps/three-playground/src/display-scene.test.ts`: original materials/visibility/layers restored after success and thrown render; child classification and current-subject isolation; preserve original alpha masks and skins. Run `pnpm exec vitest run apps/three-playground/src/display-scene.test.ts` before implementation.
- [x] Implement `display-settings.ts` (typed presets), `display-scene.ts` (transaction/material ownership), `display-overlays.ts` (real physics and declared anchors), and `display-preview.ts` (demand-driven diagnostic rendering from source frames). Keep helper visibility false outside rendering and release resources on map change/disposal.
- [x] Add a browser test `display-preview.test.ts` using real WebGL, source canvas pixels and scene snapshots. Check mode changes affect preview pixels while source pixels, camera and geometry remain unchanged; test pure Presentation capture and cleanup.
- [x] Implement `display-panel.tsx` with a Render popover, mode choices, visual filters, collision and interaction toggles, depth range, legend, and reset. Integrate through `shell.tsx` and `main.ts`; preserve keyboard isolation and responsive layout in `styles/workspace.css`.
- [x] Register tests in `scripts/lib/test-gate-manifest.ts`; run focused tests, typecheck, test census, editor build, Creator/Episode capture regressions and runtime prebuild. The independent video-encoder case is environment-blocked as recorded below.
- [x] Inspect real Playground screenshots at desktop and narrow widths; exercise stopped rendering, reset, map and subject changes, then review the final diff and deliver the local preview.

## Verification examples

Transaction failure must restore state:

```ts
expect(() => preview.render(settings, context, () => { throw new Error('draw failed'); })).toThrow('draw failed');
expect(mesh.material).toBe(originalMaterial);
expect(mesh.visible).toBe(true);
```

Independent output contract:

```ts
sourceRenderer.render(scene, camera);
expect(readPixel(sourceRenderer)).toEqual(originalPixel);
expect(readPixel(previewCanvas)).not.toEqual(originalPixel);
expect(camera.matrixWorld.toArray()).toEqual(originalCameraMatrix);
```

## Verification record

- Base: latest fetched `origin/main`, `e7c553e6`.
- Display scene, actual WebGL/Presentation, Shell and preset-workspace tests: 33 passed.
- Creator vehicle-camera tests: 6 passed with repository-local TEMP/TMP. The first run hit sandbox access restrictions in the system temporary directory; moving only the temporary test location resolved it.
- SDK Episode lifecycle tests: 8 passed. Episode capture suite: 10 passed; its real H264 encode case could not launch `ffmpeg` (`exit -4058`, executable absent from PATH). No encoding implementation changed.
- Real editor browser smoke: driving, input isolation, modal resume and small-screen layout passed with no browser errors.
- Real display smoke: all 8 modes preserve full source-pixel hashes and simulation/camera state while stopped; ground filtering, current-subject/overlay combination, map/reset transitions and the 390 px panel passed with no browser errors.
- Typecheck, targeted ESLint, test census (91 files), editor production build and runtime prebuild passed. Independent read-only review found a transparent-buffer depth-write defect; a failing real pixel reproducer now passes after the fix.
- Editor JS: `index-5o2MMiQx.js`, SHA256 `24b4e1c9495a01fcada14ab370cfc475884f74a6bfc3244a1dda553f5c063eaa`.
- Editor CSS: `index-DRNB5LcU.css`, SHA256 `ff3dc876c0179680dbff87638d984b06c0c66321c9032a1999a29190cc9ef0d3`.
- Runtime prebuild: `.codex-tmp/three-runtime`, runtime hash `33c833b78211d4fd7e6bc360aacf57b38a1eb82b570d0e0d9c6afa2cf05d0086`; manifest SHA256 `4cea4845d22a55d26084e3c59797f19848c778ca7e24d25d76ea69fc4bd9a2fb`.
- The optional diagnostic pass uses extra GPU work and omits source shadows. Default display uses only the source renderer. No external production, publishing or video jobs were started.
