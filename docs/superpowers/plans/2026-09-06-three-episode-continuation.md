# Three Episode continuation and integration

Authorization recovered from task 01a071ae-8b68-7e91-a456-eb0b93040624: implement on a new branch, test gpt6-holdout-gvs2-00007837--three-sdk, deliver six recordings and ten styles, stop before any Seedance request. Latest steering requires recording to exclude the independent UI layer. Branch: codex/three-episode-agent-production.

| ID | Deliverable | depends_on | blocks | Exclusive owner / resources | Evidence | Mode |
|---|---|---|---|---|---|---|
| EP1 | SDK recording and presentation contract | existing SDK v2 | EP2 | Main agent: packages/three-world, bridge | Real physics and Chromium; clean renderer bitmap with UI canvas/output visible | main-agent-only |
| EP2 | Frozen portable source and planner MCP | EP1 | EP3 | Main agent: source.ts, browser.ts, mcp.ts, cloud-launcher; isolated release/inputs | Source hashes, relocated MCP tests, cloud tool receipt | sequential |
| EP3 | Cloud route plan and GPU capture | EP2 | EP4 | Main agent: workflow/capture/route-controller/capture-cloud, exact case Job and S3 prefix | Six 30-second 720-frame traces, failures repaired by cloud planner only | sequential |
| EP4 | Ten styles and render preparation | EP3 | EP5 | Main agent: visuals/cloud/prompts, episode-owned provider IDs and S3 outputs | Immutable anchors, complete target tri-views, events, 60 prepared requests, zero video submissions | sequential |
| EP5 | Reviewable report and continuation checkpoint | EP4 | delivery | Main agent: report, documentation, test manifest | Verified report assets and scoped validation summary | main-agent-only |

Current evidence: 37 focused Vitest tests and 23 Node tests passed; clean Episode PNG/JPEG matched raw renderer bytes while DOM UI, first UI canvas and model output were visible. UI images and JSON are under .codex-tmp/three-episode-evidence/ui. Typecheck passed after fixing CLI optional values. Test census passed after registering five new test files. Full gates continue; previous aggregate failed package-boundary checks and was restarted after switching Host type imports to the public @worldkit/three entry.

Cloud release-r1 was uploaded but no planner Job was created. It lacked current presentation source and is superseded for this test by release-r2. Original source world hash: 691e0d665a0075c3da173654778952c068618267f82870e5ae1311ef9abc99fd. Derived UI-capable world hash: 1f87ba592c948dd81277c41f671c297d9d4edf22406989bfb3c57fbc62b0514e.

Do not call mocks cloud evidence. Do not silently advance to Seedance. The current outbox helper deduplicates Episode notifications but is not yet connected to the Creator delivery service; automatic all-world production is not deployed by this single-case test.

## 2026-09-06 integration checkpoint

- Fixed CLI exact-optional typing and public package import boundaries; registered all TS and Node suites.
- Reproduced real RouteController ROUTE_BLOCKED being misclassified as an SDK failure. Added the exact route-error handoff and regression tests. This final orchestration correction is local and is not in the already frozen release-r2 Host process; if r2 reaches a route failure, resume the same checkpoint with this correction without repeating successful provider work.
- Final Episode closure: 25 Vitest tests passed; 23 Node tests passed. SDK/UI tests previously passed, including actual clean PNG/JPEG pixel equality. Resource-heavy gate: 52 files / 762 tests passed. Build, typecheck, test census and diff checks passed. Contract aggregate: 3,233 passed / 3 skipped, with two missing project-local credential prerequisites and one new Node census failure; the census defect was subsequently fixed and its 10-test closure passed. The credential-dependent tests are not claimed passing.
- Actual case captures: .codex-tmp/three-episode-evidence/case-ui/episode-clean-world.png and episode-page-with-ui.png; they show the same world with and without DOM UI, no browser errors, tick 1. This is interface inspection, not six production recordings.
- Frozen runtime: release-r2; source archive SHA256 0108d0ad36e540c69d546f3d5668142051155896bd298530a9994f89c6a36f37. Source upload Job three-episode-gvs2-upload-20260906-r2 completed.
- Cloud Host Job: three-episode-gvs2-host-20260906-r2, namespace lwdp. Planner LWDP job gen_9ce6e7edbf1abfe1, request three-episode-ep-plan-53af50fe0b06140850c6bee5b17c6b68-e1b927651bf9df33a92d08fa. Submitted once, now Ray RUNNING, no planner output yet at this checkpoint.
- S3 checkpoint: s3://leap-world-us-east-2/world-model/platform/worldkit-three-episode/gvs2-pre-seedance-20260905-r2/checkpoints/planning-20260906-0033. Hash-closed 10-file publication preserves the exact provider intent/state and report; never clear these journals for a retry.
- Final Host publication prefix: s3://leap-world-us-east-2/world-model/platform/worldkit-three-episode/gvs2-pre-seedance-20260905-r2/host-r2. Seedance submissions remain zero.

Cloud progress: planner gen_9ce6e7edbf1abfe1 succeeded. Its receipt shows four successful observations, six successful start probes, and one successful plan submission. GPU Job three-episode-capture-32f63ef6772b8b4e7b0ed692 recorded all six segments to 720 frames on the first plan; no route repair was needed. Publication/admission and visual stages are still pending at this checkpoint.

All six cloud recordings were admitted. Local downloaded report media passed SHA256 checks and ffprobe: every file is silent H264, 1280x720, 24/1 FPS, 720 decoded frames and 30.000000 seconds. Real browser report playback passed (six video elements, first clip progressed past one second with no media error). Report: .codex-tmp/three-episode-results/r2/report, served on http://127.0.0.1:53746/. Style Director job gen_5536e94dcc91ed6f is running.
