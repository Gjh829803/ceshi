# Design QA — Focused 3C Tuning Workbench

## Evidence

- Source visual truth: the selected Product Design direction, amended by the user's browser annotations through 2026-09-03; the source is embedded in `artifacts/design/3c-camera-controls-comparison.png`.
- Current camera state: `artifacts/design/3c-camera-controls-implementation.png`.
- Medium-width camera state: `artifacts/design/3c-camera-controls-medium.png`.
- Full-view comparison: `artifacts/design/3c-camera-controls-comparison.png`.
- Earlier movement and viewport evidence remains in `artifacts/design/3c-tuning-workbench-*.png`.
- Source pixels: 1487 × 1058. Current implementation pixels and CSS viewport: 1327 × 1272 at DPR 1. Medium implementation pixels and CSS viewport: 900 × 1000 at DPR 1. The full comparison contains the source in a 1327 × 1272 `contain` frame beside the exact 1327 × 1272 implementation; no density resampling was required for the implementation.
- Compared state: G Bot humanoid, third-person free orbit, Draft Preview, camera tab, tuning rail open, advanced controls collapsed, `环绕焦点高度` explanation expanded.
- Primary interactions tested in the in-app Browser: switch to camera tab, expand/collapse a per-parameter explanation, open advanced parameters, inspect the advanced response group, and read live FPS plus version/build identity.

## Findings

- No open P0, P1, or P2 finding remains.
- Fonts and typography: the existing Inter/system stack, compact technical labels, monospace values, and mint active state remain coherent. Renamed camera controls are concrete and scannable; FOV is explicitly identified instead of described as generic width.
- Spacing and layout rhythm: the desktop viewport remains dominant beside the 390 px rail. Six primary camera controls fit above the fold, and the expanded explanation occupies a full-width row without compressing the slider. At 900 px the workbench becomes a full-width surface, preventing the earlier context-bar and footer collisions.
- Colors and visual tokens: the help affordance reuses the existing mint/cyan focus palette and restrained border treatment. Expanded help is visually subordinate to the editable values and has sufficient contrast on the dark rail.
- Image quality and asset fidelity: the real Babylon Runtime canvas and existing G Bot asset remain in use. No placeholder imagery, custom SVG, CSS illustration, or fake engine asset was introduced.
- Copy and content: `观察高度` is now `环绕焦点高度` and explicitly states that it is the orbit target, not camera height. `视野宽度` is now `视野角（FOV）`. Profile transition and dynamic FOV response explain their exact trigger conditions and live in Advanced rather than the primary path.
- Icons and affordances: every primary camera parameter has a small `!` button with a visible expanded state, focus ring, accessible label, `aria-controls`, and `aria-expanded`. It does not rely on hover-only disclosure.
- States and interactions: the primary order is distance, orbit target height, initial pitch, FOV, horizontal drag sensitivity, and vertical drag sensitivity. Profile transition and dynamic FOV response are present in the advanced `Camera Response` group. All numeric camera controls still use the existing live Camera Preview channel.
- Runtime information: footer FPS reuses the same sampled value as the existing HUD instead of creating a second estimator. Version shows Browser API v5 plus the trusted Host build commit, with the full 40-character build identity in its accessible title.
- Responsiveness: 1327 × 1272 and 900 × 1000 show no document overflow. At 1024 px and below, the context bar resolves to two rows and the tuning surface becomes full width; essential FPS and version telemetry remain available when the viewport footer is visible.
- Accessibility: native buttons and range inputs remain keyboard-reachable, range inputs have explicit accessible labels, help controls expose expanded state, active tabs are semantic, and focus is not communicated by color alone.
- Browser errors: final in-app Browser inspection returned no console error entries.

## Comparison history

1. P1 — Unsupported first-person controls remained visible in the context bar and camera rail. Fixed by limiting the 3C workbench to the supported third-person orbit profile while leaving lower-level Runtime protocol capability untouched.
2. P1 — Movement sliders visually implied live tuning even though numeric movement preview is not a current Runtime capability. Fixed with one section-level `候选配置` boundary and an explicit export/recompile effect model.
3. P2 — `仅草稿` repeated on every row obscured parameter names. Fixed by moving lifecycle copy into one concise notice and footer status.
4. P2 — Keyboard users saw a gamepad-specific movement deadzone control. Fixed by removing it from the keyboard-focused primary workbench.
5. P2 — The viewport had no framing control. Fixed with persisted Free, 16:9, 16:10, 4:3, and 21:9 options.
6. P2 — A fixed-ratio render aligned to the top instead of centering. Fixed with symmetric letterboxing.
7. P2 — The aspect-ratio field initially risked pushing Baseline/Draft outside the narrow context bar. Fixed with an explicit two-row narrow layout.
8. P1 — The first camera controls omitted follow distance but exposed configuration transition and FOV damping. Fixed by establishing a six-control primary order and moving response-only settings into Advanced.
9. P1 — `观察高度`, `视野宽度`, `镜头切换时间`, and `视野变化平滑` obscured the actual Runtime semantics. Fixed with concrete, trigger-aware names and descriptions verified against `camera-director.ts`.
10. P2 — Parameter explanations were present only as hidden dense provenance text. Fixed with a per-row, keyboard-accessible `!` disclosure that preserves both plain-language meaning and technical provenance.
11. P2 — The runtime strip lacked current FPS and build identity. Fixed by reusing the authoritative HUD FPS sample and adding API v5 plus trusted Host commit.
12. P2 — At 900 px, the one-row context bar and footer controls compressed and wrapped. Fixed by moving the full-width workbench breakpoint to 1024 px and retaining only essential telemetry at that width. Post-fix 900 × 1000 evidence has no overlap or document overflow.

## Implementation checklist

- [x] Prioritize the six free-orbit controls used most often.
- [x] Move profile transition and dynamic FOV response to Advanced.
- [x] Add accurate, expandable explanations to every primary camera parameter.
- [x] Add authoritative FPS and version/build identity to the runtime footer.
- [x] Preserve existing live Camera Preview behavior and candidate/export boundaries.
- [x] Verify desktop and medium-width states with zero document overflow.
- [x] Verify primary interactions and zero browser console errors.

## Follow-up polish

- P3: When a stable product release version replaces the current private `0.0.0`, the footer can show release version, API version, and build commit as three distinct provenance levels.

Final result: passed
