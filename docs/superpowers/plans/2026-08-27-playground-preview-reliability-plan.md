# Playground preview reliability plan

This plan keeps Studio job execution, generated world artifacts, and the Babylon Runtime contract unchanged. It fixes only the browser preview lifecycle, inspector presentation, diagnostics, and the owned local preview process.

| ID | Goal and deliverable | Depends on | Blocks | Exclusive ownership | Input / output contract | Verification | Execution mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PVR-01 | Reuse one named play window for every Studio “进入世界” link. | none | PVR-04 | `apps/studio/public/index.html`, `apps/studio/public/app.js`, Studio tests | World `previewUrl` in; a stable `worldkit-playground` browsing context target out. | Static markup and render-function regression tests. | sequential |
| PVR-02 | Render only a bounded window of Feature rows while preserving selection and counts. | none | PVR-04 | New Playground feature-list module, `main.ts`, Playground styles and focused tests | Ordered `FeatureInspection[]` plus scroll position in; bounded DOM rows and exact selected ID out. | Large-list unit test and browser inspection with a 5k-feature world. | sequential |
| PVR-03 | Publish honest startup stage and sanitized nested Runtime failure evidence. | none | PVR-04 | Playground startup UI and Runtime Host error plumbing/tests | Internal Adapter failure in; stage-specific, sanitized diagnostic out. No raw provider message or cause crosses the Browser protocol. | Failure-path unit tests plus G Bot browser reproduction. | sequential |
| PVR-04 | Validate and refresh the owned preview service without touching Studio jobs. | PVR-01, PVR-02, PVR-03 | none | Test/build evidence and the process listening on port 5273 only | Final source tree in; passing focused/full gates and a fresh 5273 process out. | `pnpm typecheck`, affected tests, Studio tests, root tests/build, Browser checks on multiple worlds. | main-agent-only |

Authority remains unchanged: Runtime Host owns WorldSession lifecycle, Babylon owns render/physics resources, Studio owns job state, and the Feature list owns presentation only. Windowing must not change `adapter.inspectFeatures()` or selected Feature semantics. Restarting 5273 must not restart port 4297, mutate task records, or terminate generation children.
