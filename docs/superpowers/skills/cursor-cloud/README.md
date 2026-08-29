# Cursor Cloud test and review workflow

Use Cursor Cloud Agents for long-running repository gates and independent reviews that
would otherwise occupy the local workstation. Cloud execution is evidence for the exact
remote commit only; it does not authorize an Agent to merge, rewrite history, update
goldens, weaken fail-closed checks, or silently repair a finding.

## Required model

Start the interactive Cursor CLI with:

```bash
agent --model cursor-grok-4.6-xhigh-fast
```

Prepend `&` to the task message to hand it to a Cursor-hosted Cloud Agent. The repository
must already be pushed because the Cloud Agent clones from the connected Git remote.

Cursor Builds use `.cursor/environment.json` from the environment's default branch. A
feature-branch task starts from that active Build and checks out the requested branch on
top. Therefore a new or changed feature-branch environment config is not itself evidence
that the running Agent received its dependencies. The full-gates template explicitly
bootstraps and probes all required dependencies; after this config reaches the default
branch, the same commands remain idempotent Build inputs.

## Task templates

- [`full-gates-prompt.md`](full-gates-prompt.md) runs the repository's non-mutating full
  verification set and reports every command, exit code, and scoped result.
- [`read-only-review-prompt.md`](read-only-review-prompt.md) performs an independent
  protocol-bound change review and reports findings without editing the repository.

Replace every angle-bracket placeholder before submitting a task. Keep testing and review
as separate Cloud Agents so a test failure cannot bias the independent source review.

## Evidence boundary

The orchestrating Host must verify that the reported target SHA is the requested remote
SHA and must reproduce any actionable finding before changing code. A Cloud Agent result
does not replace rendered visual evidence, manual interaction evidence, or a capability-
specific Browser verifier when those are required by the implementation plan.

Environment setup failures must be reported separately from repository test failures. A
missing Site install, Python module, browser, or system dependency is not a product defect,
but it still makes that Cloud gate run `NO-GO` until the environment is repaired and only
the affected gates are rerun.
