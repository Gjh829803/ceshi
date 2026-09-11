# Episode pipeline maintenance

Read [the pipeline guide](README.md), [production workflow](../../docs/three-sdk-data-production.md)
and [Seedance lane](../../docs/three-episode-seedance.md).

Consume a verified Creator delivery as an independent production copy with its
actual runtime bytes, assets and source identity. Plan and record real SDK inputs
and action outcomes. Episode owns the recording clock only while holding its
exclusive SDK capture port; release and reset must restore correct ownership.

Preserve the production profile: six 30-second clips, ten styles and prepared
video requests. Preparation requires `--stop-before-seedance`. Reviewed requests
are separately dispatched and recovered to private S3. Automatic Creator delivery
subscription is not implemented. Do not conflate preparation, provider completion,
media-spec checks and semantic acceptance.

Keep request/checkpoint/source/asset/review identity consistent across admission,
recording, style generation, recovery and delivery. Unknown requests must be
reconciled before retrying. Reuse confirmed successful work; never rewrite evidence
or inherit review approval for changed content. Keep cloud transport mocked during
local tests and preserve existing production scheduling/authorization boundaries.

Keep runtime stages in their `src/` domain, tests under matching `tests/` domains,
fixtures in `tests/fixtures/` and manual regressions in `scripts/`. Preserve frozen
entrypoint paths as historical identities when moving current source files.
