# Creator evaluation page

The gallery shows actual cloud task status, source identity, action coverage,
playable worlds, opening frames, recorded video, errors and shared human feedback.
`ready` means verified production artifacts are available. Coverage lists are test
objectives; tool completion and human evaluation are separate results.

## Run-specific publication

Stage with `scripts/cloud/prepare-three-evaluation-site.py`. SDK evaluations select
up to ten explicit task IDs. References, case inputs and deliveries are validated
against the plan, runtime lock and their actual file hashes before publication.

Keep display configuration in `RUN_ROOT/evaluation-publication.json`:

```json
{
  "schemaVersion": 1,
  "kind": "three-creator-host-publication",
  "runId": "three-sdk-actions-ten-20260908",
  "title": "Three SDK · 动作与主体十例评测",
  "description": "真实云端生成、动作场景条件与主体绑定验证。",
  "sourceIdentity": {
    "branch": "codex/three-sdk-data-production-20260907"
  },
  "cases": {}
}
```

`sourceIdentity` accepts the full `commit`, `sourceSnapshotSha256`,
`sdkSourceSha256` and `sdkVersion`. The stager takes `creatorRuntimeLockHash`
from the actual plan. Each case may define `displayTitle` and
`evaluation: {actions: [], sceneRequirements: [], checks: []}`; the selected
case manifest can provide the same evaluation metadata.

Publish only the intended run:

```sh
python3 scripts/cloud/publish-creator-evaluation-site.py \
  --source SITE --pod RAY_HEAD --gallery three --run-page
```

Its URL is `/creator-evals/three/runs/<runId>/`. Its files live under the existing
FSx evaluation root; this command does not change Kubernetes resources, the
current gallery or another run. The destination records its run/task ownership.
An existing archive cannot be overwritten as a live run. `--archive-run` creates
an immutable completed archive instead.

Use `sync-three-evaluation-site.py --run-page` for delivery updates. Add
`--progress-only` to the publisher for an already initialized run's small progress
snapshot. Only one publisher should write each run. Progress must match the
installed run/task set; stale snapshots are rejected. Files are atomically
installed, with `results.json` last.

## Shared feedback

`reviews.mjs` uses the existing same-origin `/creator-evals/api/reviews` service.
The `gallery` query identifies the exact run page. Reviewer identity uses the
existing session; each review is keyed by run, task, world build and reviewer.
The service remains the only shared review store. Source or world changes cannot
inherit an approval for different bytes.

User edits save automatically, uncertain writes retain the same mutation ID,
revision conflicts require an explicit choice, and offline drafts stay local.
An open playable keeps its original build during refresh; feedback targets that
actual playing build. No feedback is submitted by opening or publishing a page.

## Verification

Run `python3 scripts/cloud/prepare-three-evaluation-site.test.py` for staging,
artifact closure, source/coverage identity, ten-case selection and isolated
publication checks. Browser verification should cover desktop and mobile,
status/action filters, playback preservation on refresh, shared feedback identity,
and unavailable review/status services. Local fixtures must be visibly labeled.
