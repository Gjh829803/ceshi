# Cloud entry points for the Three branch

Use [Three Creator cloud generation](three-eval-README.md) for the current
v0.2 generation/self-check/delivery contract, and [Three Episode](../three-episode/README.md)
for independent route planning, six-clip recording and pre-Seedance preparation.
The [branch guide](../../docs/three-sdk-data-production.md) defines source identity,
configuration, scheduling and implemented boundaries.

`three-eval*` and `three-episode*` are the relevant entry points. Shared helpers
may still have consumers in several lanes; check imports before removing them.

Earlier `worldkit-cloud-*` / `cloud:scene:*` workflows and Native Creator tooling
have been removed from this branch. The shared browser capsule extractor and
review-site publisher remain in use. Existing external runs and archives retain
their original identity; the code cleanup does not restart them.
The previous operational README is available in the
[pre-cleanup Git snapshot](https://github.com/seedleap/agent-whitebox-world-sdk/blob/4256b6fdf06c7ba732e13a7c9aeee553544438e9/scripts/cloud/README.md).

Three Episode entry points require `--stop-before-seedance`. New production
capsules must bind this integrated source and actual runtime bytes. Published
archives and journals keep their original identity; reconcile an unknown request
before retrying. Build/test commands alone do not authorize cloud submission.
