# WorldKit evaluation center

The read-only evaluation UI combines the existing Studio's task-list,
observable-trajectory, event-stream and deliverable patterns with the Three
playable gallery. The original Studio files are already present in this branch;
its Native/Planner pipeline is not used as the Three status model.

Public entry: `/creator-evals/three/`. Header navigation links back to the existing
Studio and the preserved older five-case gallery. The page provides task search,
status filters, current activity, elapsed time, attempts and failure causes;
case details have process, artifacts, play and review tabs. Clicking a task
reveals its detail. Mobile tables scroll within their container.

## Data ownership

- `results.json` is the curated gallery manifest from
  `scripts/cloud/prepare-three-evaluation-site.py`. Playable readiness and content
  review come from that manifest; a runtime event never grants semantic acceptance.
- `progress.json` is `three-creator-run-progress` v1 from
  `scripts/cloud/three-eval-progress.mjs`. It is keyed by the same run and task IDs.
  Actual CLI/MCP observations take precedence over delayed provider queue counters.
  Retries retain each original job and failure; missing timestamps stay unknown.
- Only safe operation names, statuses, real times, bounded numeric progress and
  fixed failure descriptions are public. Raw reasoning, commands, source and
  account data are not displayed.
- Each ten-second refresh updates status without reloading a mounted playable,
  clearing local feedback or changing the selected tab. Event scrolling can follow
  new entries or preserve the user's position. Source observation age, not merely
  JSON regeneration time, determines whether live state is stale.
- Switching away from a playing scene pauses it. Returning resumes only a scene
  the page itself paused; a user's explicit pause is preserved. The adapter uses
  the actual Three Host/World observer, with the existing Native observer fallback.

Feedback is saved per evaluation in browser localStorage and can be exported as
JSON. Videos and full-object views are lazy-loaded. Technical IDs remain in an
expandable section, separate from the main task status.

Publication may provide a Host-only `displayTitle` for a case and `historyRuns`
for links to previous rounds. Neither field enters the model's input. The route
counter is labeled as the author's route goals; it is not an independent finding
that every destination is reachable. Tool completion and test acceptance retain
separate labels, including short tests and recordings below the required duration.

## Publication

Stage a new gallery directory with the existing Three stager. Publish through
`publish-creator-evaluation-site.py --source SITE --pod RAY_HEAD --gallery three`.
The gateway and other galleries remain unchanged. All files are atomically replaced,
with the manifest installed last.

To preserve a completed round, publish its staged directory with `--archive-run`.
It is mounted under `/creator-evals/three/runs/<runId>/`; an existing archive is
read-only. Identical files may be verified again, while a changed manifest, file,
or file inventory is rejected. The current run can then be published normally.

While a run is active, generate a fresh safe `progress.json` into SITE and call:

```sh
python3 scripts/cloud/publish-creator-evaluation-site.py \
  --source SITE --pod RAY_HEAD --gallery three --progress-only
```

This updates only the small progress snapshot. The publisher rejects a different
run/task set and rejects stale updates against the installed run. A stopped Host
observer is shown as stale; public clients never receive API or account credentials.

Validation: real local browser fixtures cover filters, task/tab selection,
automatic-refresh iframe identity, feedback persistence, pause/resume, event
scrolling, connection failure/recovery and 360/390px layouts. Public deployment is
also checked in a real browser. See `.codex-tmp/evaluation-center-ui-qa/` and
`.codex-tmp/three-sdk-v2-holdout/published-ui-check.json` for this implementation's
actual evidence; fixtures are not model-generated scene results.

New `interactive-preview` deliveries have no video or recorded-play metrics.
The gallery hides the video requirement and displays preview checks plus the
independent gameplay-review status. Archived recorded-episode cases retain their
actual video and timing.
