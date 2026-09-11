# Creator Cloud

`@worldkit/creator-cloud` owns Creator cloud admission, account routing, source and
runtime capsules, launch, progress, cancellation reconciliation, delivery recovery
and evaluation publication. It is a collection of operational commands, not a
second SDK or a scene-authoring Agent.

Read [cloud generation](three-eval-README.md) and [progress](three-eval-progress-README.md).
The runner explicitly loads the selected toolkit's
[production Agent requirements](../../packages/creator-host/docs/agent/README.md).
Existing production commands retain their arguments and semantics; direct source
entry paths now live in this directory.

Episode scheduling and video production belong to
[Episode pipeline](../../packages/episode-pipeline/README.md). The
[production workflow](../../docs/three-sdk-data-production.md) describes the handoff.
Existing external jobs, archives, review URLs and request IDs retain their identity.
Local staging and contract tests do not submit jobs or publish a site.
