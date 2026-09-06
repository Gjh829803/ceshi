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
