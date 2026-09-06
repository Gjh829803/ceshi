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

## Style transport failure and recovery

Style job gen_5536e94dcc91ed6f produced an 87,510-byte plan but failed EPISODE_EVENTS_CHANGED. The Agent had rewritten the three transport filenames advertised by the provider, including truncating the live event stream (98,172 zero bytes); the launcher correctly rejected its hash mismatch. This result is not admitted.

The launcher now writes diagnostics in a private sibling directory outside the model workspace and promotes authoritative files only after terminating the process group. It explicitly marks these filenames Host-owned in the prompt and records discarded model placeholders. The reproduction deliberately writes fake versions of all three files; final events must still equal actual subprocess transport bytes.

A failed plan can be passed as a hash-locked untrusted recovery candidate to a fresh cloud planner, whose input hash and task ID differ. Six completed captures are independently revalidated and reused across postprocessing-only resumes. New resume.ts requires a stopped predecessor checkpoint and the same output root. Relevant verification: 26 Episode Vitest and 24 Node tests passed, plus typecheck; tests cover candidate identity/tampering, genuine capture reuse with zero planner/GPU calls, and corrupted-media rejection.

Frozen recovery release-r3: source archive 2d23a739f9303633e950959b57af1687a4b14e63f40384131bbe04b68e5aa49f; source world/runtime remain unchanged. Candidate SHA256 f8d90f393ea2092882104958109e7a956e6600f3ba089a5f54268464208ec107. It resumes the terminal failed host-r2 S3 manifest, preserves all failed-stage journals and all six recordings, and will publish under gvs2-pre-seedance-20260905-r3/host-r3.

## Image pool recovery

Recovery planner gen_c3597feb9fc31fbf succeeded, with Host-private diagnostic ownership, no discarded model files, and identical event file/transport SHA256 bbe1d7dc00cf65396d173d366e085a3217a1d012e00894bf08207d9fca46633c. Ten style plans are admitted; the local style-plan.json and style-plan.html expose them as text plans, not generated images.

The first ten T2I jobs in r3 all failed at CLI startup on the same exhausted service-pool account (actual usage-limit errors, zero images). No quotas were reset or purchased. The caller now supports Host-selected existing account IDs through the service's supported codex_account_ids option, distributes jobs deterministically, retains the normal service health filter, and rejects changing routing while an earlier attempt is active, unknown or already delivered. It preserves old terminal failure journals. Tests: 25 Node tests passed, plus typecheck.

Release-r4 archive SHA256 c473ee3d302b932ae39431854b6d0666d7c17562ee70601639d9806db5dbe654. It resumes the terminal r3 checkpoint and uses two existing accounts that had just succeeded on this case's planning tasks. Exact account IDs remain in private runtime configuration. Host Job three-episode-gvs2-host-20260906-r4, pod three-episode-gvs2-host-20260906-r4-zd7vf, namespace lwdp. Capture reuse was confirmed; no new planner/capture run occurred. All ten initial anchor images succeeded by 2026-09-06 01:54 Asia/Shanghai; anchor review gen_5655e5e9cf3e77ce is running. Final output prefix: s3://leap-world-us-east-2/world-model/platform/worldkit-three-episode/gvs2-pre-seedance-20260905-r4/host-r4.

The old Builder prompt smoke prerequisite was later materialized from the same authorized Kubernetes Secret into this checkout's ignored private runtime configuration, with no value logged; that 19-test file passed on recheck. The unrelated legacy Google credential test remains unverified in this checkout.

## Review attachment collision discovered in cloud

All ten ORIGINAL r4 anchors generated successfully. Reviewer gen_5655e5e9cf3e77ce then reported that every supplied view was the identical instrument-themed image. Inspection of the deployed LWDP _download_task_assets confirmed its destination is asset.name, not asset.id. The caller had supplied distinct IDs/S3 hashes but the same basename image.png; later downloads overwrote earlier inputs. The verdict and the ten resulting repair requests are invalid Host evidence, not valid image-quality findings.

The r4 Host (PIDs 1/17 in its own pod) was paused, checkpointed as failed with EPISODE_HOST_ATTACHMENT_NAME_COLLISION, and stopped. Three still-active invalid repair jobs were cancelled after exact-id status checks; seven had already succeeded and were retained. Their receipts are in .codex-tmp/three-episode-evidence/invalid-review-repairs.json. The complete 375-file stopped checkpoint is published at the existing r4/host-r4 prefix. No original images or videos were deleted.

The transport now derives unique filenames from asset IDs (including text inputs), rejects duplicate/reserved IDs, and gives each T2I reference a unique positional name. Review input identities include the attachment policy. Corrected review histories have a separate versioned filename, so invalid old verdicts/budgets remain as history while original anchor image recipes remain unchanged and reusable. Tests reproduce same-basename overwriting, verify distinct transport names, enforce unique review mappings, and prove legacy colliding-review histories cannot consume the new valid budget or regenerate original images. All 27 Node tests and typecheck passed. Commit b0772c31.

Recovery release-r5 is being frozen. It must resume the stopped r4 checkpoint, retain outputS3Root under r4/providers to reconcile/reuse existing image tasks, use the new r5 launcher for correct review attachments, and publish the resumed Host under r5/host-r5. Never rerun the valid style plan or six recordings.

Release-r5 is deployed: archive 1f2ec12fdb52f3b029eaf5e6c1038e2108a937ebeb2da32a25a3a37698ef27e9, Host three-episode-gvs2-host-20260906-r5 / pod three-episode-gvs2-host-20260906-r5-4w7jz. It reused all original ten anchor images without re-generation and started corrected anchor review gen_763ffdd23164ee38. Direct inspection of its actual input directory confirmed 11 PNGs, 11 unique filenames, and 11 distinct image hashes (one whitebox plus ten styled anchors). The raw first-round images are now available in .codex-tmp/three-episode-results/r2/report/initial-anchors/ and on http://127.0.0.1:53746/anchors.html, explicitly labelled first-round candidates.

## SDK animation reset discovered during full-set visual review (r6 supersedes r2–r5 captures)

The corrected anchor review passed 10/10. A subsequent real full-set review revealed that source starts 01–05 had horizontal bind-pose arms. The original first recording started normally; repeated resets after locomotion called mixer.stopAllAction(), then cross-faded the new idle action from an unscheduled cached action, leaving idle at zero weight. This is an SDK reset bug, not a style-generation defect. The earlier instruction to never repeat these recordings is superseded: all six must be recorded under the fixed runtime.

assets.ts now blends only from a scheduled action; clamped one-shot poses remain eligible. The failing real GLB reproducer measured a 0.606344750359036 m bounds discrepancy. The regression fix and clamped-action test pass. Actual Chromium on this exact source verified six reset→run→reset cycles: every first frame is tick 1, all 65 bone local transforms have identical idle hash 54fb35a4cb1ac479141a7f250ec8b058a4d5a99921687a9539160e352408837b, no browser errors. Evidence is under .codex-tmp/three-episode-evidence/animation-reset-case. Affected SDK/Creator/Episode closure: 19 files, 238 tests passed; latest Episode closure: 26 Vitest and 29 Node tests, typecheck and census passed.

New derived source is .codex-tmp/three-episode-test/source-animation-r6/source.json, world hash 522c7853c0be537848de0a13a79d9cd5807e61eebfd91576aae0972ac997c181; author source hash remains 48d42a6349772b8bb73a75e828e4e273e6d86b665580843ee488ded14acb37a2. Old r5 Host was paused, marked EPISODE_SDK_RESET_BIND_POSE, and closed to r5/host-r5; active obsolete reviews were cancelled, all evidence retained. Its workflow process was then stopped.

Runtime rerun creates a fresh episode state, treats prior Agent routes and style plan as hash-locked untrusted candidates requiring fresh cloud submission, and only stages completed content-addressed image recipes for exact-input/file-hash cache reuse. No old captures, reviews or admission histories enter the new state. Secondary image prompts now separate the opening appearance dictionary from current-frame composition: absent/distant targets cannot be copied into the foreground. This addresses observed camel hallucinations without weakening review gates.

Immutable artifact publication/hydration now use bounded eight-way IO and coalesce identical content uploads; all active transfers settle before error return. The fixture verifies twelve equal artifacts produce one upload and restores all files with bounded concurrency. Source manifests are published only after every object succeeds. The global Creator outbox consumer is still unwired; this case run does not imply a global rollout. Seedance submissions remain zero.

Release-r6 is running: archive a0bef6e77d5c744e0b6dc652d7890e64bbf07de19d445a24ccd897568a8590f2; Host three-episode-gvs2-host-20260906-r6 / pod three-episode-gvs2-host-20260906-r6-vcp6r in lwdp; fresh episode episode-gvs2-three-20260906-r6. It hydrates r5/host-r5, and publishes to gvs2-pre-seedance-20260905-r6/host-r6. Report mirror: http://127.0.0.1:53747/; old 53746 report is explicitly historical/failed. SDK/orchestration fix committed as decdfc6a. Additional candidate-source/tampering admission regression passed (capture.test.ts: 10 tests).

R6 cloud planner gen_ac881292f73a5f1e succeeded with 4 observes, 6 probes, 1 submit, and exact unchanged six route intentions under the new world hash. GPU capture three-episode-capture-19e91f7ae4c70b82bced8852 completed all six segments without repair. Local SHA256 plus decoded ffprobe checks passed: all silent 1280x720 / 24fps / 720frames / 30sec. Cloud segment-01 first frame was visually inspected: normal arms-down idle, no UI. Local r6/capture-summary.json and media-verification.json preserve evidence. Style planner gen_cdd88f14128962ea succeeded, preserving all ten variant definitions byte-for-byte; original anchors were reused by exact hashes. Fresh anchor reviewer gen_078286c3cc984b13 is running. No Seedance request has been submitted.

R6 anchor review gen_078286c3cc984b13 terminated before a result: the default cloud Codex account hit its usage limit after transport reconnects. Raw authenticated diagnostic outputs (no credentials) are copied to .codex-tmp/three-episode-evidence/r6-review-quota. This is not an image rejection. The R6 Host closed its state as failed and is publishing its normal immutable checkpoint.

cloud.mjs now supports codexAccountIds and bounded explicit codexRetryAttempts, with separate exact request identities, echo validation and terminal-failed-predecessor guards equivalent to the T2I path. Its recovery tests prove failed journals remain, cache delivery is reused, and live/delivered work cannot be duplicated by routing changes. Twenty cloud tests and typecheck passed. Release-r7 will resume r6/host-r6 with the unchanged R6 SDK/source and existing selected account pool, preserving six captures and admitted plan. No quota purchase or reset was requested or performed.

R7 deployed: archive a8fbba2e1ed7a40712f8e3ce0b18c1d20410d6b3d52c7beedefde7e8fbbd5e45; Host three-episode-gvs2-host-20260906-r7 / pod three-episode-gvs2-host-20260906-r7-fs9vz. It resumes the closed 1,503-file R6 checkpoint and publishes r7/host-r7. Existing R6 report mirror/port 53747 is followed by sync-r7.py (session 91108); viewer server session 71674. Exact source SHA remains 7dae9c4774f5d53f497c0106dfb0c5198e03a675cc2242c83d3996a7753f2542. Platform health metadata showed the failed default account nominally active/100% despite its actual CLI usage-limit error; selected existing accounts were active at 51% and 22% in the last health snapshot. No health thresholds or eligibility filters were changed.

## R7 multi-reference registration failure and controlled input experiments

R7 recovered reviewer gen_c406422c97d8cec7 worked correctly, but rejected all original anchors for a shared upward framing shift. All ten were repaired three times, each reviewed independently; four durable attempts per style were exhausted. Final reviewer gen_3aea914435b5735b rejected all ten. R7 is terminal failed at opening-anchors, with zero prepared requests and zero Seedance submissions. Its 34 provider jobs all completed; provider completion is not visual acceptance. R7/host-r7 contains the closed checkpoint; current candidates are mirrored in r6/report/anchors.html and comparison.html. The overlay comparison was tested in Chromium (ten styles, working opacity and style selection).

Three isolated diagnostics were generated outside the formal output tree, never admitted as production: normalized coordinates with whitebox+appearance (gen_0d8b31a560b9ba88); whitebox-only (gen_040bfcd39816ccb0); reversed appearance+whitebox references (gen_b97acc0cd3263343). The first and reversed variants retained the wrong framing. The whitebox-only candidate substantially restored the actual framing. Independent diagnostic reviewer gen_351d486f1dd84e58 confirmed source/candidate traveler bounds approximately [0.411,0.356,0.553,0.953] vs [0.410,0.347,0.553,0.956], horizon around 38% in both, and close target/contact/rein registration. It still rejected terrain-relief changes and missing sparse rocks. This is evidence that removing competing image geometry improves framing, not proof of full quality acceptance or a universally proven provider root cause. All diagnostic inputs, outputs and review are local under r6/registration-probe*; no diagnostic is smuggled into the production cache.

The next image-input policy is single-whitebox-text-appearance-v1. Native generation receives exactly one current scene/tri-view whitebox. After an anchor passes independent review, cloud Codex extracts a text appearance dictionary bound to its exact SHA256 and every ordered target ID. Later images receive this immutable appearance text; full-set reviewers still receive actual anchor/styled/whitebox images, so text extraction cannot substitute for visual acceptance. Anchor repair changes the dictionary identity and regenerates affected images. Reviewer context now includes proposed semantic variants and explicitly permits intentional identity changes while preserving registration/occupancy; position feedback uses normalized coordinates. Old multi-reference histories remain immutable; the revised input-policy history is separately named and has its own bounded four-attempt gate. This is a tested generator input-policy revision, not deletion of failed evidence.

All 31 Node tests and typecheck passed, including exact single-whitebox inputs, seven arbitrary target IDs, stale anchor/dictionary rejection, complete target binding, immutable anchor repair, resumable outputs and zero video calls. Release-r8 is being frozen; source/runtime and six R6 recordings remain unchanged. It will resume r7/host-r7 and publish r8/host-r8. The Creator-wide automatic delivery consumer remains unwired; no global rollout is claimed.

R8 deployed: archive fe679a250ac4b26df2b6932114502896d9ce4c244b792fbeb745bca373938ec7; Host three-episode-gvs2-host-20260906-r8 / pod three-episode-gvs2-host-20260906-r8-qqvxl. It resumes the closed 1,886-file R7 checkpoint and publishes r8/host-r8. Commit 33545560 implements the revised image input policy and appearance dictionaries. Local mirror remains r6/report on port 53747, now followed by sync-r8.py (session 3502); status-r8.py saves the Host log; sync-anchors-r8.py selects the new input-policy history specifically. Earlier candidate pages are explicitly marked old/stopped until new images arrive.

R8 progress at 2026-09-06 ~05:25 Asia/Shanghai: initial ten single-whitebox anchors generated; review gen_2fbc5729f15b8ed2 rejected all. Second review gen_1b93c6c616a7e120 accepted style-01 (porcelain) and rejected nine. Third review gen_f50d7ee9ee9ab163 again accepted one and requested repairs for nine, including local postal-paper contours, tissue enclosure, fungal feet and registration drift. The final allowed fourth-attempt generation for those nine is running; no appearance-dictionary, secondary-image, Gemini-event or prepared-request stage has been reached by this real case. Keep existing request journals and let this bounded run conclude; do not describe image generation/provider success as quality acceptance. Final results may remain failed quality findings to align with the user.

The report at port 53747 now exposes current single-whitebox candidates and an interactive opacity comparison. build-review-package.py is prepared under .codex-tmp/three-episode-results; it refuses running states and old image-policy histories, verifies asset hashes, packages six recordings plus the independent playable production-world and current candidate/QA data, and creates three-episode-gvs2-pre-seedance-review.zip. It has not yet been run. If the workflow becomes prepared, first download pre-seedance-manifest.json; if it ends failed, report that no valid 60-request closure exists. The package HTML embeds status for offline viewing. After the final review, rerun sync-anchors-r8.py and build-comparison.py before packaging, then verify the ZIP manifest and actual offline browser playback.

## Final R8 result and review package

The final reviewer gen_9a33c8df91e096ad completed successfully and returned needs-repair: only style-01 passed; style-00 and style-02..09 remained rejected after four durable attempts. Findings include projected scale/horizon/contact drift, an added mane crest, an open/widened loom compartment, and altered fungal target/feet contours. The pipeline stopped at THREE_EPISODE_OPENING_REPAIR_BUDGET_EXHAUSTED. All 42 R8 provider jobs completed, but visual acceptance is 1/10 opening anchors, 0/10 full image groups, 0/60 prepared requests and 0 Seedance submissions. The real case has not exercised appearance-lock extraction, subsequent tri-views, Gemini events or final 60-request closure; those code paths have fixture verification only. Creator-wide delivery subscription remains unwired. No additional rerender was started after the bounded R8 run.

The R8 Host pod terminated Failed as expected after publishing its closed failure result. S3 checkpoint r8/host-r8 has 2,361 files; artifact-manifest SHA256 b0e0db03b6cdfbc158eefc783ddf43584365785f05052d71379ab40955dd3a21. The remotely retrieved episode.json SHA256 2e790239fa7878461b2e6e7523d903d020079aec1e203053b4da5064c743cadc was verified against the manifest and confirms six completed recordings, failed image-quality stage and zero video submissions. Receipt: r6/cloud-closure-receipt.json. All local report polling helpers were stopped; the read-only local preview server remains available on 53747.

Final offline review package: .codex-tmp/three-episode-results/r6/three-episode-gvs2-pre-seedance-review.zip, 67,809,133 bytes, 67 files, SHA256 4953f8d5f7265f2380acf67b8614e5323affd21afc07b518a85281de489054a9. Every ZIP member hash and CRC was checked. It contains six verified videos, current ten anchor candidates with truthful verdicts, route/MCP/capture/QA records, cloud closure receipt, and the portable independent production-world. Offline Chromium tests passed six-video playback, all ten candidate images, and interactive opacity/style selection with no errors. The packaged world was served independently, reached __WORLDKIT_EVAL__.ready, exposed the fixed 1/60-second Episode port, and produced no browser errors. Package source hashes were revalidated, preserving the original author source and recording the new SDK runtime. No credentials are included.

Local report: http://127.0.0.1:53747/; candidates: /anchors.html; overlay comparison: /comparison.html; style definitions: /style-plan.html. Main status explains the quality failure in Chinese while episode-final.json preserves the exact cloud error. This is an honest failed-quality test handoff, not a completed end-to-end production rollout. Future work should address actual spatial fidelity of generated style images and the delivery consumer; do not clear the failed history or silently weaken the geometry gate.

## User calibration supersedes the former strict acceptance criterion

The user explicitly approved the current opening images 00, 01, 05, 06, 07, 08 and 09 and requested slightly looser review standards. This supersedes the earlier instruction to retain the strict geometry gate unchanged. The new policy three-episode-review@2-practical-correspondence judges usable overall staging/motion correspondence. Modest framing, scale/silhouette, decorative detail, small contact-edge changes and tiny background-stone discrepancies are non-blocking unless they materially alter principal entities, shot/visible side, occlusion, action space or readability. Major new obstacles/enclosures, principal pose/identity inconsistency, and UI/helper residue remain blocking. Shared palettes/motifs do not independently fail diversity.

The seven exact current image SHA256 values, original whitebox hash, current world and plan hashes, explicit user instruction and decision identity are recorded in config/three-episode-review-calibration.json. The pipeline resolves these only for exact opening anchors; original cloud reports are not rewritten, and later images/tri-views cannot inherit an opening approval. A changed review policy re-evaluates current candidate bytes before generating another attempt; it does not reset the historical generation budget. Code/config must be included in a new frozen release before a cloud resume; this turn changed the policy and recorded/displayed user decisions, with no new cloud jobs or images submitted.

Current live report now shows 7/10 user-confirmed anchors and 02/03/04 pending reevaluation under the new standard. report/anchor-admissions.json and user-review-calibration.json overlay the unchanged raw anchor-history.json and cloud verdicts. The prior ZIP and sealed R8 S3 checkpoint remain historical strict-review snapshots. Local report, candidate labels and comparison dropdowns were checked in Chromium. Regression tests cover exact-world/plan/image scoping, reuse without regenerating approved anchors, preservation of raw cloud failures, and rejection of later-frame defects despite opening approval.

Calibration verification finished: 35 Node tests, typecheck and test census passed. Chromium confirmed seven user-approved cards, three pending cards, the corresponding comparison labels, and the homepage's calibrated/pending state without page errors. Raw anchor-history.json and final-anchor-review.json remain byte-identical to the prior verified review package. No SDK, recording, image bytes, original cloud verdict, archived ZIP or S3 checkpoint was changed.

## Player behavior correction — 2026-09-06

Latest user steering: too little camera rotation, no jump, and monotonous motion.
This continues EP3 and EP5 under main-agent ownership. Dependency order: reproduce
missing normal-travel inputs → versioned input controller/trace and cache identity
→ real six-clip local browser evidence → comparison page. Files owned here are
`player-controller.ts`, `playback-policy.*`, capture/workflow/dispatcher/report and
their tests. Frozen author scene, SDK physics/animation and cloud Agent plan remain
unchanged. No cloud image or Seedance submission is part of this correction.

Authority map: Agent owns starts and polyline; Host owns bounded input timing;
SDK Rapier owns support/jump/movement; SDK camera owns orbit and collision; fixed
step owns time; capture owns original renderer bitmap/encoder and session disposal.
The failing reproducer observed no camera input on healthy travel. Policy 2.1 adds
look pauses, moving glances, pitch changes, walk/run transitions and supported
00/02/04 jumps. Actual rendered/motion metrics guard the recording, not just input
counts. Input-associated jumps require upward takeoff and landing. Local probes
along the current edge are eligibility checks, not a full ballistic guarantee.

Developer replay uses `.codex-tmp/three-episode-results/player-v2-final` and the
exact r6 source and cloud route plan. Preview is `/player-v2.html` on port 53747;
old videos remain expandable comparisons. Local SwiftShader first-frame hashes
are different from the original cloud render: seven original user-approved
anchors remain in their original scope, without relabeling the new capture.

Final local evidence: all six videos completed and a second invocation hit all six
hash-verified caches. Each has 720 real frames, 1800 ticks, 30 s, 1280×720 at 24 fps,
no audio/padding. Rendered yaw ranges for 00–05: 65.6°, 62.9°, 106.7°, 74.5°,
151.1°, 185.0°. Walk/run time is present in every clip. Planned jumps completed
at 15.5→16.54 s (00), 16.375→17.54 s (02), 15.625→16.67 s (04). Receipt:
`.codex-tmp/three-episode-results/player-v2-final/verification.json`. Contact sheets
and actual browser video playback were inspected; this is not a manual gamepad
control-feel acceptance claim. User may compare old/new clips on the same page.

Verification: 19 focused Episode tests passed; 35 Node tests passed; SDK/Creator/
Episode aggregate had 241 passing tests and one timing-sensitive Creator camera-cut
fixture failure. That exact unmodified test passed in isolation. Typecheck, test
census (368 registered files) and workspace-boundary gate passed. The aggregate
failure is retained in `/tmp/episode-player-full-vitest.log`; it is not represented
as a clean aggregate pass. Local preview additionally gained HTTP byte ranges:
206 payload/headers and browser seek to 14.7 s were verified; all six videos load.
The detached server receipt is `r6/preview-server-process.json` (port 53747).
No cloud rollout, new image generation or Seedance submission occurred here.

## Restore the original-reference style — 2026-09-06

User requests that one of ten first-frame styles match the original image. Missing
cause: the Director asked all ten to reinvent semantic identities and the r6 source
capsule omitted its optional referenceImage. Main-agent-only EP4→EP5 correction:
verify original bytes → portable reference closure + exact one-slot validator →
cloud Director repair of unaccepted style-02 → one image + independent reference/
spatial review → candidate-page update. Source/capture physics and the other nine
variant objects are unchanged. Files owned here: source.ts, visual-contracts.mjs,
visuals/workflow/report, Director/reviewer prompts and focused tests. No Seedance.

Recovered original SHA256 is
36e161e2a76971e1bacc300c0d228a584425703b0202e69cfec5d7250d819027,
verified against original Creator case-input.json: photographic blue wrapped
traveler, saddled reclining camel, golden sand and blue daylight. New source
capsule: `.codex-tmp/three-episode-test/source-reference-r9/source.json` (same
world/runtime, new reference closure; not yet a new cloud worker rollout).
Original-style job evidence lives in
`.codex-tmp/three-episode-results/source-style-20260906`. The generic default slot
is 00, current one-slot recovery is 02; seven user-accepted image IDs/bytes remain.
Generation continues to use one whitebox image; original appearance reaches the
Director and independent reviewer visually, and generation through the complete
bound style description. A changed plan does not rewrite historical approvals.

Original-style delivery completed: cloud Director gen_717099aba4a91c29, single
T2I gen_5a9071a81b5deebd, independent reviewer gen_ccf8a456f9fd6822 all succeeded.
New style-02 first frame SHA256:
375dc873eb024c1a28e3612443fb6a872907258be06109add4ff836919b26b38.
Reviewer passed recognizable photographic appearance and practical spatial
correspondence; residual angular camel/baggage surfaces were explicitly recorded
as non-blocking. Nine other plan objects and candidate images are unchanged.
Browser verified `/anchors.html#original-style`: ten cards, one original slot,
1280px image loaded. Comparison and style-plan pages updated. Current display uses
`report/anchor-selection.json`; historical `anchor-admissions.json`, prior plan,
cloud opinions and seven scoped user approvals remain intact. The new Director
plan is current `report/style-plan.json`; before-original-style files retain the
old plan/pages. Original image and source-style review are available on the page.

Verification: missing-slot failing reproducer before implementation; 38 Node tests
and 31 Episode Vitest tests passed, including corrupted-reference rejection,
portable source hash validation, one reserved slot, and single-whitebox generation.
Typecheck, census (368 registered files), workspace boundaries and diff checks
passed. Real cloud run submitted exactly one image; no secondary style views,
events, video requests or Seedance submissions were started. Implementation and
reference-capable source capsule are local; the three bounded cloud recovery jobs
used the existing pinned r8 launcher, not a global worker rollout.

## Authorized completion run — r9

The user asks to finish the remaining generation pipeline. The existing boundary
remains pre-Seedance. Use cloud GPU recordings with player-capture-2.1, the verified
r6 Agent route, the restored original-reference style at 02 and nine unchanged
style definitions. Main-agent-only dependency chain: validated continuation inputs
→ immutable r9 worker capsule → cloud six-clip capture → ten-anchor admission →
seventy later images (five views plus two target tri-views per style) → diversity
→ ten Gemini event calls → sixty prepared requests, zero Seedance submissions.

`continue.ts` checks the original route's actual MCP receipt and prior source
manifest hash; scene/source/runtime and file inventories must match. It only seeds
a fresh workflow's existing Agent plan, without inventing Host routes. Cloud
capture reruns the enhanced input policy. `anchor-continuation.mjs` imports exact
candidate image bytes and durable spent attempts. A user opening approval carries
across the new plan header only when the complete variant definition, world,
whitebox and selected image are unchanged; its original receipt remains nested.
It cannot approve a later frame or changed variant. The two pending candidates
03/04 get at most two explicitly recorded extra repairs under the revised rubric;
other budgets are not reset. The original-reference 02 remains independently
reviewed, not user-approved. An opening hash mismatch stops reuse.

Pre-dispatch verification: 39 Node tests, 31 Episode Vitest tests and typecheck
passed. Exact input bundle is `.codex-tmp/three-episode-cloud-setup/recovery-r9`;
release creation/uploads use the trusted ray namespace head and never package
runtime credential files. A new immutable FSx release and S3 prefix isolate this
run from r8 and the local developer videos. Do not relabel a local video as cloud
capture or overwrite seven original user decisions.

R9 running: Host `three-episode-gvs2-host-20260906-r9-9r75r`; GPU Job
`three-episode-capture-7bebe1c4f99ffab9f3568c91` completed all six enhanced clips.
First frame 00 exactly matches f04985f5… and preserves the original user-approved
opening scope. Archive SHA256:
77325830a2132090401de10ee697fa51700926255d768b2da8dbb5214ea6dd3f.
S3 prefix: `s3://leap-world-us-east-2/world-model/platform/worldkit-three-episode/gvs2-pre-seedance-20260906-r9/host-r9`.
Preview: `http://127.0.0.1:53747/continuation/`. Local scoped monitors and evidence
are under `.codex-tmp/three-episode-results/r9`; the current provider stage is
style-plan gen_489e98038bfbd702. Source/route/model receipts remain immutable.

R9 image progress: ten anchors passed the revised opening review with zero
regeneration. All seventy later images completed; one style-02 segment-05 image
was repaired for reverting to low-poly shading. All ten full style groups then
passed their individual reviews. Global diversity review gen_8a3130bd31262f3d
passed spatial registration and distinguishability, but requested photographic
camel shading in the style-02 opening. The worker is applying that bounded
original-style revision; the other nine groups remain cached. Revised opening
SHA256 d0fc5cc85b55b31c8893bca2082cae5ca0bca174b6aade06791d7bc054602e19
passed the next opening review. Final readiness is not yet established: new
appearance-bound views, global review, events and request preparation remain.
The earlier `r9/image-verification.json` is explicitly a pre-revision checkpoint.

R9 recovery: `gen_b8c00a3bbbfc57b9` (only style-02 target-traveler, 1536×640)
remained running without any generated file for more than its 1200-second image
budget. Ray job status queries gave no task result and the state API timed out.
The main agent deliberately cancelled this one stalled job and confirmed LWDP
`cancelled` before retry. R9 published a closed 1,386-file checkpoint at 02:26:42
UTC. No other completed work was discarded.

R10 resumes that exact checkpoint with the same Episode ID and output paths.
`continue.ts --checkpoint-s3` revalidates the recorded source/route receipt and
hydrates only into fresh output. `imageRetryAttempts` allows one retry for the
exact style-image-f25be11214c68755fcc4438f task; `imageRetryCancelledJobs` names only
that confirmed cancelled job. Ordinary cancelled/user-stopped jobs remain blocked
from retries, and live/unknown outcomes still cannot be duplicated. The retry
rotates to the other existing account in the same pool. Model stays GPT-6/xhigh.
New regression failed before this narrow recovery support and passed after it;
40 Node tests, 31 Episode Vitest tests, typecheck and census passed.
R10 archive SHA256 6fcc93baeeedadd2ad6155cb83ba9ab51e35dd34b41db88db21591e36da6d7af;
Host prefix `s3://leap-world-us-east-2/world-model/platform/worldkit-three-episode/gvs2-pre-seedance-20260906-r10/host-r10`.
Final readiness is still pending, and Seedance submissions remain zero.
