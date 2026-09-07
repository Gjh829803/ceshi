# Overnight 300 humanoid worlds — 2026-09-06

User authorization: generate 300 human-led, open scenes from the existing test
sets, supplement from the explicitly supplied 1,000-image list, use the optimized
cloud pipeline, prioritize known-good accounts, include other accounts in the
first batch, assess actual quality and scale production. Deadline: **2026-09-07
08:00 Asia/Shanghai = 2026-09-07 00:00 UTC**.

## Fixed inputs and runtime

Worktree: `creator-camera-triview-reliable-ten`.
Control directory: `.codex-tmp/overnight-human-300-20260906` (OUT below).
Master selection: 16 original test-set references plus 284 from the user list,
300 unique SHA256s. 97 existing and 360 supplement contact-sheet candidates were
inspected for humanoid, outdoor/open ground and visible forward continuation.
Selection provenance and excluded indices are in `selection-audit.json`.
Images/prompt files are already copied and hashed under `OUT/inputs`.
The original dataset requests retain their creative requirements; the runner
removes the same historical block/centered-camera phrases used in prior runs.
Do not add scene-specific advice or change input bytes after preparation.

Use the ready lock at
`docs/evaluations/gpt6-three/humanoid-motion-repair-20260906/runtime-lock.json`:
7486b980ac3656ad705e9d9f9902f50e204c828b7db4519a87a10ee38d39d6b0.
GPT-6 Astra / xhigh, Codex CLI 0.153.3, 90min per generation, G-bot guidance,
SDK walk/run intent fix, smooth opening camera and representative three-views.
No new model/runtime/prompt experiments in this campaign. Host scale changes do
not modify the installed Creator capsule. D/E/F remain denied.

## Processes and ownership

- `controller.py`: owns `campaign.json`, wave creation and status; PID lease via
  flock. First probe wave: 37 cases, A/B/C/G twice and 29 other eligible accounts
  once. Subsequent waves use account decisions. Each wave has one existing durable
  `three-eval-supervisor.mjs`, fixed manifests/payloads, exact job/request identities.
  Total cap 64; 8 live tasks per historically verified account, 4 per newly proven
  account, 2 per promising account. The historic-account cap increased from 4 to 8
  at 00:18 local after all 26 existing live requests showed actual CLI activity
  and later preview/test success. Only new requests use the higher provider cap;
  existing payloads, job identities, Creator prompt and runtime remain frozen. New jobs
  stop at 06:20; retrieval/publication continue. Pending job IDs reserve slots.
- `publisher.py`: owns the single campaign site, stages each wave through the
  production viewer and incrementally uploads changed files with manifest last.
  Playability follows verified delivery, not this assistant's quality assessment.
- Host automation `300`: every 10min in this task, inspect progress/review actual
  results, triage failures and write quality decisions. It must continue the work,
  not simply report unchanged status. Pause it after completion and final report.
- `caffeinate -i -w <controller pid>` prevents local idle sleep while dispatching.
  Check actual PIDs in `controller-owner.json`, `publisher-owner.json`, and per-wave
  `supervisor-owner.json`. Do not launch duplicates; reuse exact running jobs.

Start/restart daemons with `subprocess.Popen(..., start_new_session=True,
stdin=DEVNULL, stdout=<task log>, stderr=STDOUT)` only after checking the owner.
Use the existing project-local AWS/LWDP credentials; never copy secrets into tasks.
The first health snapshot has 48 accounts, 36 active, 33 not denied. A/B/C/G and
U01…U41 are stable labels by identity hash. Full IDs are private OUT files only.

## Actual quality assessment (task heartbeat/assistant owns these files)

Read `status.json`, `review-queue.json`, and individual verified payloads. The
queue populates after the publisher unpacks a delivered case. Inspect the original
reference and actual opening, the whole subject's capture, and side-view motion
frames from the real recorded episode; use a browser if the evidence is ambiguous.
Inspect world source/route evidence for substantial connected exploration space,
not just an opening screenshot. Do not edit or repair new production cases.

Write `OUT/quality-reviews.json` as:

```json
{"schemaVersion":1,"cases":{"TASK_ID":{"worldBuildHash":"...",
"accountIdentitySha256":"...","visualInspected":true,
"scores":{"composition":4,"structure":4,"subjectMotion":4,"exploration":4},
"verdict":"strong","evidencePaths":["..."],"reason":"..."}}}
```

Scores 1–5 are anchored judgments from actual evidence, not automatic metrics.
If motion or exploration cannot be verified, record `null`/`unverified` and do not
promote on invented scores. Technical passed, generation duration, code size and
token count never substitute for quality. Read actual `accountRouting.verified`
and `identitySha256`, not just requested account. If runtime/account identity
mismatches, quarantine the sample and investigate rather than grading it.

Update the corresponding row in `OUT/account-decisions.json`:

- Existing A/B/C/G: `verified-good`, unless current evidence warrants pausing.
- One satisfactory sample: `promising` (limited production and a second sample).
- Two satisfactory different-scene samples: `production-good` (expanded queue).
- Clearly poor output: `quarantine`; keep evidence and avoid causal overclaims.
- Pending: `probation`; no new assignment without reviewed evidence.
- Set `availability: blocked-usage-limit` or `blocked-capacity` for actual CLI
  availability errors; this is **not** a quality verdict. Keep the previous quality.
  Clear only after the cited reset/cooldown and healthy recheck or a successful
  actual execution. Many 100% weekly health entries failed another usage window.

`qualityEvidence` must list the actual reviewed task IDs/build hashes. Controller
reads decisions each cycle and permits unknown accounts only after explicit review.
Keep `account-policy.json` frozen; its explicit `probation` allowlist is sufficient.
Do not change request assignments for a prepared/submitted task. A deliberate
terminal retry is a new wave/attempt identity, same image/prompt/runtime.

## Failure recovery and deadline

Review exact CLI `error`/`turn.failed` messages, not only CREATOR_CODEX_EXIT_1.
Initial probe already showed usage-limit and model-capacity failures; record
`initial-account-failures.json` and decisions. No different model substitution.
A provider failure can still have a valid final Creator archive (historical case
05). Retrieve fixed outputs by exact job/task, validate archive with the existing
Host unpacker, and publish recovered results with accurate provenance. Do not
regenerate when a valid final archive already exists. Preserve the failed outer
job status separately. The default controller withholds retries when a result
file exists so a human/heartbeat can reconcile this first.

Keep max 64 non-terminal jobs, at most one POST in the current runner's dispatch
critical section, unknown POST reconciliation and fixed artifact downloads.
Before expanding ensure actual CLI count increases and shared capacity is healthy.
The user wants 300 usable outputs, not 300 POST receipts. Report shortfall honestly
at 08:00 if quota/capacity/content failures prevent it. Continue recovering known
artifacts but do not claim future completion or leave stale active automation.

Shared gallery (all 300 slots and wave process status):
http://k8s-lwdp-worldkit-1b0222fb6d-f0f26ee23663e783.elb.us-east-2.amazonaws.com/creator-evals/three/runs/overnight-human-300-20260906/

Safe extra endpoints: `production-status.json`, `account-quality.json`. Full
account credentials/identities never enter public artifacts. After completion,
preserve manifests, requested+actual accounts, each attempt, quality evidence,
recovery reports, delivery hashes and final summaries in an evaluation report.

## Verified final archives with incomplete preview receipts

Viewer commit `3315fd1e` adds separately labeled recovery for the exact
`THREE_EVENT_PREVIEW_UNVERIFIED` failure only, after complete archive/video/hash
verification and actual account identity checks. The original state, Agent source,
archive and failed execution remain unchanged. Public UI keeps the failed process
status while allowing the original artifact to be played. Other receipt/identity
failures are not admitted through this path. Per-case `host-recovered-delivery.json`
is Host evidence, not an Agent success receipt. Controller reports `delivered`,
`recoveredArtifacts`, and their unique union `availableArtifacts` separately, and
queues recovered builds for the same quality assessment. No regeneration occurs.

## Account-slot starvation diagnosis at 01:12 local

The deployed service (`5441829`, `codex_home.py`) scans only indices
`0..account_concurrency-1` in its shared flock slot pool. Its configured default
is 20. An actual nonblocking snapshot found A/B/G/U05 slots 0..7 occupied while
8..19 were free. New wave requests therefore use provider `account_concurrency=20`
to address the full configured pool; **Host caps remain 8 historically verified,
4 newly proven, 2 promising, 64 overall**. This does not launch 20 cases per
account or change Agent context. Existing payloads remain immutable. The snapshot
and driver logs are in OUT. U14 passed its first scene but then hit its actual
usage window; several following driver failures were health filtering, not model
quality failures. Its `blocked-usage-limit` decision prevents new submissions.

Promising accounts now have at most two attempts awaiting a quality decision,
even if those attempts are already terminal. Completing a trial does not silently
authorize more trials before its outcome is reviewed. Completed provider execution
with confirmed cleanup releases Host execution capacity during artifact download;
`pendingDeliveries` remains separate and retrieval continues through final drain.

## Automatic account availability circuit breaker

`automatic-availability.json` is controller-owned. It blocks new assignments
immediately after an observed CLI usage-limit/model-capacity error, or after
three startup failures for the same requested account in 15 minutes. This is
independent of quality and does not stop in-flight tasks. Health snapshots alone
are not sufficient: G exhausted its usage window (CLI reset Sep 11) while an older
health snapshot remained eligible, causing a pre-model rejection burst. G and U14
remain availability-blocked. A deliberate recovery may acknowledge the current
block by adding its `jobId` to that account decision’s `availabilityClearedForJobIds`,
only after verified reset/health recovery; a new failure blocks again. Never clear
quota blocks just because the weekly snapshot says 100%.

At 03:05 local, `account-decisions.json` expands U12 to 8 after inspected
orchard/river-valley samples (023, 069, 190), and U33 to production-good at 4
after distinct satisfactory samples 027 and 090. Mixed samples remain recorded.
At 03:20, inspected U37 ruins/snow-valley samples 192 and 196 also passed
the quality check and reached 7/7 and 6/6 route targets. Current limits are
U05=8, U12=8, U37=8. At 03:49, U33 also expanded from 4 to 8 using its
previously inspected distinct satisfactory samples 027/090 and healthy actual
provider activity. Later inspection graded 217 satisfactory and 219/220 mixed
(limited later-route coverage and simplified canyon forms); 218 remains pending.
See `u33-capacity-expansion.json`. A/B report platform `quota_low`, and C's
19:00 UTC health snapshot reports `auth_failed`; preserve their in-flight tasks
but do not bypass admission filtering.
Capacity reprobe wave-27 completed weak samples on U35/U22/U04/U09/U31;
these accounts are quality-quarantined. Their already-running second references
in wave-29 remain intact for comparison; do not dispatch a third sample.
`capacity-paired-dispatch.json` records the six second-reference assignments.
U26 samples 024 and 211 were inspected as mixed and weak; it is now also
quality-quarantined. All quality judgments are based
on reference/opening images, recorded motion samples and route/source evidence;
none of these Host decisions modifies Agent input or blocks artifact playback.
Exact target hits are supporting evidence, not a substitute for that inspection:
compare nearest distances, tolerance, route geometry and actual frames. Some
targets in inspected 223/224 missed a 2–3 metre tolerance although the real route
visibly entered the surrounding area; retain genuinely unvisited regions as
unverified rather than labelling every missed target impassable.

Production accounts require two distinct visually inspected, hash-matching good
samples. `productionConcurrency` may explicitly raise a selected proven account
from 4 to at most 8; use the current per-account decisions above and in
`account-decisions.json`, preserving mixed samples. Promising accounts still
have a maximum of two unreviewed attempts.

At 04:05 local, Host admission stopped waiting for at least four free slots.
Any positive free capacity now refills on the next controller cycle, retaining
all per-account/global limits, quality routing and availability breakers.
Seven controller tests passed, including an end-to-end cycle with one free slot
and a full-capacity cycle that must not prepare another task. Existing live job
IDs/payload hashes and detached supervisors were preserved during the parent-only
restart; evidence is in `single-slot-refill-adjustment.json`.

At 04:23, a bounded U03 calibration used the next two unused master references
260/261 in wave-47, without input changes. Its only prior sample 013 was mixed
because of weak color separation, with usable motion and 6/7 route targets.
U03 remains probation, not bulk-production eligible. Inspect both new actual
outputs before any promotion; preserve the original mixed judgment. The fixed
jobs are recorded in `u03-paired-calibration-dispatch.json` and already running:
`gen_f1824def1d4c6541` / `gen_2c0275a8e0bf81ab`. Do not dispatch them again.

At 05:09, both U03 samples 260/261 were actually inspected as satisfactory,
with color, clothed motion and connected-region evidence (limitations retained).
U03 became production-good at 8; its first eight production jobs 280–287 have
actual CLI activity. The original gray 013 remains mixed. U33 subsequently fell
below the provider quota threshold (18% in the 20:00 UTC snapshot); retain its
quality decision but stop new admission while unavailable.

## Recovering a timed-out existing build without another model run

Cases 218/221 timed out after successful same-build playtests; case 228 has the
same recovery path. Host copied only their explicit closed candidate source,
compiled playable and original evidence, verified source/runtime/build hashes,
then reopened the unchanged files in an isolated browser with external requests
blocked. The recovery produces a Host-labelled checkpoint, never an Agent final
receipt. Original failure states and original recordings remain intact.

The existing viewer checkpoint mechanism shows “中间可玩版本 · 尚未正式交付”.
Controller `runnableCheckpoints` counts these separately; `availableArtifacts`
is the unique union of normal delivery, recovered final archives and runnable
checkpoints. Intermediate checkpoints do not satisfy final campaign completion;
only 300 normal or recovered final archives may create `complete.json`.
A later final delivery supersedes a checkpoint without double
counting; a later failure cannot hide a saved playable. A checkpoint pointer
holds fresh generation retries. Checkpoint counts require matching job/case/lock,
verified actual account identity and the Host archive verification record.

The bounded recovery tools and evidence are under OUT:
`select-timeout-snapshots.py <case-number>`, `recover-timeout-files.py`,
`preview-recovered-candidates.mjs`, `install-recovered-checkpoints.py`, then
`verify-checkpoints-public.mjs <case-number>`. Run dependent steps only after the
previous step succeeds. Existing snapshots/checkpoints are retained and
revalidated, not rebuilt. Select only a confirmed terminal timeout with a clean
180+ second same-build playtest and opening capture. All new recovered builds
must pass the existing checkpoint archive verifier and fresh browser startup.
Remote source files and Agent prompt are never modified.

Public HTTP pages receive the existing host-compat UUID shim. Verification
checks that exact shim's SHA and excludes only its known tag when comparing
HTML; compiled world bytes remain identical. `checkpoint-public-verification.json`
records real public browser readiness, intermediate notice and links. Eleven
controller tests and two publisher tests cover identity, retry holds and
cross-attempt precedence. Original frozen runtime lock remains unchanged.

Retry budgets distinguish provider rejections from world authoring. A case has at
most 4 confirmed provider attempts and at most 2 attempts with evidence of model
work. Missing/ambiguous evidence counts conservatively as model work. Explicit
pre-model quota/capacity/slot rejections do not consume both world attempts. A Host
queue-deadline cancellation can retry only after confirmed cleanup and no model
work; user cancellations never qualify. A final receipt always holds regeneration
for artifact recovery.

At 05:40, all 300 unique inputs had been submitted; this does not mean 300
deliveries. The controller then continued confirmed eligible failures. Case 083
has a same-job/request controlled-stop record and lastGuard queue-deadline with
confirmed cleanup and no model work. A later provider timeout message had hidden
that reason; retry eligibility now reads those explicit records as well, while
rejecting user cancellation, mismatched job/request IDs and incomplete cleanup.

Older timeouts 034 and 096 also had clean 180+ second same-build evidence and
were recovered without another model call. 065 had no qualifying pair and is
not presented as runnable. The recovery helpers accept optional case numbers
to isolate dependent steps per case. Their original byte/hash verification is
unchanged. Some kubectl WebSocket reads ended with truncated data or a nil-stream
error; scoped reads can use the documented
[kubectl streaming environment flag](https://v1-32.docs.kubernetes.io/docs/reference/kubectl/kubectl/)
with WebSockets disabled. Read retries always target the same job/files; a
transport-exit warning is not discarded unless the complete returned archive
length and SHA verify. `timeout-transfer-attempts.json` records the actual result.
Public verification now preserves timestamped reports as well as the aggregate.

## Admission closed; artifact drain after 06:20

The last submission was at 06:18:10 local. The 06:20 cutoff has passed;
`admission-cutoff-verification.json` confirms no later submission or unresolved
plan. Do not open another generation attempt or expand account admission. Keep
the existing supervisors and publisher running to retrieve known jobs. Samples
280/287 were actually inspected as satisfactory; 68 distinct outcomes have now
been reviewed, with unreviewed results still playable.

Case 267 was recovered as another intermediate checkpoint. Its original build
`165a6e95c42473badd3d8c4cf788e25b509509a4b44525c1861e6bbdfe28edcc`
passed fresh local and public browser startup checks. Its generated source and
compiled world bytes were preserved, and its original timeout remains visible.

For repeated whole-archive truncation, use the existing OUT helper with
`WORLDKIT_RECOVERY_CHUNKED=1 python3 OUT/recover-timeout-files.py <case-number>`
(replace OUT with the actual control directory). This stages a Host-only copy of
the original archive under the exact job's `host-recovery` directory, outside the
Agent workspace, then reads 512 KiB chunks. Verify offset, length and SHA for
every chunk, followed by the complete archive SHA before extraction. This does
not alter the source, invoke the model, or create another generation job.
`chunked-transfer-<jobId>.json` records verified transfers; the original identity
and archive validators still apply. Case 267's 19,965,855-byte archive verified
after three whole-stream reads had been rejected as truncated. Follow the same
preview, checkpoint installation, publication and public verification sequence
after a successful transfer. Do not start duplicate recovery processes.

Case 277 was subsequently recovered the same way, including public browser
verification of the original compiled bytes. The seven intermediate cases are
034/096/218/221/228/267/277; individual recovery records and the aggregate public
verification are under OUT. Do not repeat recovery for these completed records.

`OUT/write-drain-audit.py` writes a timestamped, read-only outcome audit and a
latest pointer. It partitions the 300 distinct cases into final deliveries,
recovered finals, intermediate playables, active/retrieval cases and terminal
cases without an artifact. Historical failed attempts are counted separately;
an earlier failed attempt does not override a later successful artifact. The
audit reuses the observed CLI availability classification and distinguishes
authoring timeouts, account-slot timeouts and Host queue cutoffs. The 83 observed
provider startup failures include 76 requests routed to G; that early Host
admission failure must remain visible in the final explanation. Do not call all
startup failures model-quality failures, or infer every driver's detailed cause
from its exit code alone. The audit's review totals describe deliberately chosen
account-screening samples, not a random quality estimate for the whole campaign.
It does not publish or change any job, world, account decision or quality review.

Case 001's later attempt exposed two selection details: the earlier capacity
failure must be skipped, and the later explicit authoring timeout was classified
as `playtest` by the summary. Recovery selection now requires the exact launcher
timeout message plus a matching failed launcher report with `timedOut: true`,
case/task/runtime identity, matching state job ID and confirmed cleanup. It does
not depend on the summary category alone. The actual later attempt had a clean
297.46-second same-build episode and opening capture. Five negative checks reject
a non-timeout launcher, wrong job/task/runtime, or unconfirmed cleanup; evidence
is in `OUT/timeout-selector-verification-20260907-0712.json`. Snapshot retrieval
and downstream archive/browser checks remain separate required steps.

## Closed at the deadline; shared human feedback remains available

All known jobs have drained. The final result is 200 normal final deliveries,
3 recovered final archives and 9 intermediate playables: 212 available worlds,
with 88 cases without an artifact. The 300-final-delivery goal was not achieved
(97 short). At the initial 08:00 check, 211 were public; recovered case 079
published at 08:00:44 and then passed public browser verification. Its original
251.35-second clean episode and all original bytes remain preserved. The final
intermediate list is 001/034/079/096/218/221/228/267/277.

Controller and publisher have exited; heartbeat 300 is PAUSED. Do not restart
this closed campaign merely to poll unchanged state. See OUT/closed-20260907.json,
production-summary-20260907.md and deadline-outcome-20260907-0800.json for the
counts, deadline distinction, actual quality-review scope and failure causes.

The user's separately requested shared human-review UI is deployed. Viewer
commit c3cd56ac owns direct world links and per-person, per-build autosaved
pass/fail feedback. Publisher commit f72a66d1 preserves the fourth UI file,
reviews.mjs. The gateway uses versioned ConfigMap
worldkit-creator-reviews-73c283ecd613 and keeps artifact files read-only. Human
feedback persists in a separate private FSx mount; publishing artifacts must
never overwrite it. Shared human votes are not seeded from assistant account
checks and never gate play. The review service stays available after production
monitoring stops; cloud verification used a separate smoke run.
