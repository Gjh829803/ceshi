# Creator evaluation gallery

A plain static gallery for the five frozen GPT-6 experiments. It deliberately
distinguishes delivery, browser availability and quality. It does not promote
Native worlds into the formal WorldPackage registry or imply a production gate
has passed.

`results.json` is written by the trusted Host from the frozen selection and a
curated `publication.json`. It contains only public reference/prompt context,
selected media, case status and bounded metrics. Source trees, CLI events,
credentials and private paths are not copied into the public directory.

Statuses:

| Value | UI and admission |
| --- | --- |
| `running`, `queued`, `verifying` | Visible reference; no playable link |
| `ready` | Passing static artifact check and independent browser report |
| `issues` | Verified original delivery; Host confirms startup/controls, names independently observed content defects |
| `failed` | No delivered playable artifact is published |

The gallery fetches new results every 30 seconds. Unchanged cases do not reload
an active iframe. Switching from play to video/tri-views pauses simulation;
switching back resumes. An independent window link supports fullscreen browser
play. Controls require a keyboard; the responsive phone layout is useful for
comparison and review, not a touch-control implementation.

Feedback lives only in browser localStorage. Export downloads all reviews from
that browser with case/source identity. It does not call an external messaging
or evaluation-write service.

## Prepare and publish a reviewed update

From this worktree:

```sh
python3 scripts/cloud/prepare-creator-evaluation-site.py \
  --evaluation-root .codex-tmp/gpt6-five-case-eval \
  --publication .codex-tmp/gpt6-five-case-eval/publication.json \
  --output .codex-tmp/gpt6-five-case-eval/evaluation-static
python3 scripts/cloud/publish-creator-evaluation-site.py \
  --source .codex-tmp/gpt6-five-case-eval/evaluation-static \
  --pod <current-ray-head-pod>
```

Preparation rechecks the exact selected file hashes against the already verified
archive manifest. Cases live under `cases/<case-id>/<source-hash-prefix>/`;
original payload files remain unchanged. Publication writes sibling temporary
files then renames them, with the manifest last. It does not change Kubernetes
resources or routing. The [gateway deployment](../../deploy/creator-evaluation/README.md)
owns those separate operations.

Validation includes actual public HTTP iframe startup, video seeking, four
lighthouse tri-views, tab pause/resume, score persistence, five visible cases,
known-issue availability and disabled pending links, plus rendered desktop and
mobile review. Evidence is in the local experiment's `host-review/platform/`.
