# Cursor Cloud read-only review prompt

Perform an independent, read-only change review of `seedleap/agent-whitebox-world-sdk`.
Review exact base `<BASE_SHA>` against exact head `<HEAD_SHA>` from remote branch
`<HEAD_BRANCH>`. The review purpose is `<REVIEW_PURPOSE>`.

Requirements:

1. Read `AGENTS.md`, `docs/three-sdk-architecture.md`, `docs/three-sdk-data-production.md`, `docs/reviews/full-dimension-review-protocol.md`, and
   `docs/reviews/runtime-deep-review-checklist.md` before reviewing the diff. Read every
   applicable authoritative spec and implementation plan named in the changed files.
2. Fetch the remote refs and prove both requested SHAs with `git cat-file -t`. Review
   `git diff --find-renames <BASE_SHA>...<HEAD_SHA>` and inspect current source around every
   cited line. Historical reviews are clues only; mark reused evidence `已复验` or `已失效`.
3. Do not edit any file, generate artifacts, update goldens, modify frozen plans or locks,
   commit, push, open or modify a PR, merge, or run a formatter. This is an independent
   evidence task, not a repair task.
4. Apply the protocol's required D1-D6 dimensions for the detected review mode. When the
   diff touches physics, movement, input, animation, camera, render scheduling, resource
   ownership, or Browser/CLI runtime behavior, apply the complete runtime checklist and
   verify engine semantics against the lockfile-installed Three/Rapier source.
5. Search independently for P0/P1/P2 defects. For each finding use the repository's fixed
   block with: priority/title, evidence, expectation, impact, recommendation, and recheck.
   Cite exact file paths and line numbers. Do not report style preferences or hypothetical
   problems without a reachable failure path.
6. Do not repeat full gates already recorded for the exact tree with unchanged inputs.
   You may run read-only focused commands needed to establish or refute a finding; list
   every command and exit code.
7. End with a D1-D6 coverage table and `GO` or `NO-GO`. Any unresolved P0/P1, required gate
   failure, unverifiable authority claim, or material scope gap requires `NO-GO`. Explicitly
   state `无新增` when no new P0/P1/P2 exists.

Return the review in the Cloud Agent conversation. Do not create a repository report file.
