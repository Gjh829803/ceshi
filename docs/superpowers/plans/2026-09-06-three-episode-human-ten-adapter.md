# Human-ten delivery adapter

Scope: local adaptation only. No cohort registration, cloud generation, actual case recording or deployment. Existing deliveries and author modules remain immutable.

| Task | Owner / files | Depends on | Blocks | Integration and verification | Mode |
|---|---|---|---|---|---|
| A1 | Main / compat camera, provenance | Pinned Creator camera source and delivery runtime hash | A2 | Preserve original follow, quaternion and collision kernel; add only Episode relocation. Contract tests cover rebase/reset and original source equivalence. | sequential |
| A2 | Main / compiler.ts, source.ts | A1 | A4 | Hash-bound compile-time camera override in derived runtime; exactly one camera writer, original scene/source preserved. | sequential |
| A3 | Main / presentation module, browser fixture | Existing renderer canvas contract | A4 | Hide DOM UI and auxiliary canvases without removing nodes needed by author callbacks; world-renderer-only capture. | sequential |
| A4 | Main / packaging tests and evidence | A2,A3 | None | Compile/verify delivered cases locally; synthetic runtime/browser gates only. No actual case episode. | main-agent-only |

The pinned camera is a compatibility kernel selected by the original delivery runtime hash. It replaces the default camera import at bundle time, not an extra runtime camera or physics world. Other deliveries keep their default kernel. Build/cache identities include the override bytes. The fixed-step clock, physics and recording port remain SDK-owned.

UI removal applies to HTML overlays (instructions, HUD, menus, notifications and secondary canvases); world-space signs and materials remain world geometry. The derived page starts with UI hidden and marks only the observer's renderer canvas visible. Original source and compiled author entry hashes must remain equal. The presentation asset and changed HTML belong to the derived playable hash.
