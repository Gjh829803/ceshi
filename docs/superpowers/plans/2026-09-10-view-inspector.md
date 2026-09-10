# View inspector implementation plan

Implement the user-approved reassessment in the existing isolated display worktree. Root owns integration; UI implementer owns only display-panel.tsx, an optional display-controls.tsx, display CSS, and display-panel.test.ts. A read-only reviewer checks final source.

## Contract

display-settings.ts owns six picture modes, display-only scope/selection/visibility, temporary helper-only viewing, independent helpers and pure reset/isolation/preset operations. Object rows are logical objects with existing identities and actual collider bindings. Unknown ownership stays unmapped. Shared scope drives visual and helper filtering. No simulation, animation, gameplay selection or camera ownership changes.

## Execution ledger

- [x] Root: state tests, object context/catalog, source transaction and scoped helper drawing.
- [x] UI: picture selector plus view inspector; common scope, Objects/Helpers tabs, search/group rows, descriptions, independent reset, quick presets, persistent state summary, pin to right area and mobile drawer.
- [x] Root: main/shell integration and browser regression scripts.
- [x] Verify: focused tests, typecheck, lint, census, real browser source isolation and responsive controls, editor build, runtime prebuild.
- [x] Synchronize reviewed files to current checkout after baseline comparison (26 files, SHA-256 verified; unrelated camera assessment preserved).

Ruling: select through the object list first; direct picking, fade, same-frame comparison and more skeletal/camera diagnostics remain follow-ups. This supplies the approved selection/isolation workflow without taking gameplay input. No production jobs or publishing.

## Verification evidence (2026-09-10)

- 57 tests passed across display settings, scene transaction, scope, WebGL preview, browser controls, shell, Creator preset workspace and SDK Episode contracts (8 files).
- Root TypeScript check and targeted ESLint passed. Test census: 94 files, 29 contract and 65 resource-heavy. Git diff whitespace check passed.
- Real editor display smoke at port 5186 passed six picture modes, both helper-only modes, byte-identical source pixels with stable simulation tick/camera, object isolation/restore, exact vehicle seat ownership, collider scope/ground filtering, independent resets, pinned panel, map/reset transitions and 390x760 mobile drawer; no browser errors.
- Existing browser smoke passed real driving, form input isolation, modal resume and small-screen footer accessibility; no browser errors.
- Independent review found omitted pickup collider ownership. Adapter now reads actual target colliders and loose-crate body colliders; real Rapier regression covers selection and reset. No secondary clock, camera ownership or source transaction issue found.
- Full app smoke exposed mobile drawer translation and overlay stacking missed by isolated CSS. Component test now compiles actual global Tailwind CSS, reproduces the failure before the fix and passes after it. Full-page mobile smoke also passes.
- Editor production build passed. Diagnostic previews deliberately omit source shadow passes; original renderer output remains untouched.
- Runtime prebuild: `.codex-tmp/view-inspector-runtime/runtime-manifest.json`; runtime hash `33c833b78211d4fd7e6bc360aacf57b38a1eb82b570d0e0d9c6afa2cf05d0086`, manifest SHA-256 `4cea4845d22a55d26084e3c59797f19848c778ca7e24d25d76ea69fc4bd9a2fb`. The live Vite editor consumes worktree source; this manifest identifies the rebuilt SDK runtime bytes.
- Local visual evidence: `.codex-tmp/display-evidence/picture-explanations.png`, `view-inspector-pinned.png`, `view-inspector-mobile.png`. Also visually inspected the current in-app browser with the pinned inspector and live scene.
