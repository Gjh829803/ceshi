# Cursor Review Prompt Contracts

Use the smallest template that covers the review. Replace every bracketed value; remove sections that truly do not apply.

## Design continuity review

```text
Act as an independent design reviewer. Do not modify files.

Stage: [stage]
Workspace/branch: [workspace and branch]
Base commit: [base]
Head commit: [head]
Authoritative documents: [paths and relevant sections]
Decision under review: [design decision]
Closed findings: [finding IDs and dispositions]
Out of scope: [explicit exclusions]

Check ownership boundaries, public contracts, failure semantics, lifecycle,
extensibility, determinism, and whether implementation evidence can prove the
design. Verify claims against the current tree and installed dependency source.

Return DESIGN GO or DESIGN NO-GO. Any unresolved P0/P1 means NO-GO; GO may
retain only explicitly non-blocking, tracked P2/P3 items. Report only reproducible P0-P3 findings.
For each finding include file/line, violated contract, evidence, trigger or
reproduction, impact, and required test. Separate required corrections from
optional suggestions. Do not repeat a closed finding unless current evidence
proves its disposition is wrong.
```

## Independent code review

```text
Act as an independent code reviewer. Do not modify files.

Task: [task]
Workspace/branch: [workspace and branch]
Base commit: [base]
Head commit: [head]
Authoritative documents: [paths and relevant sections]
Required behavior: [acceptance criteria]
Verification already run: [commands and results]
Closed findings: [finding IDs and dispositions]
Out of scope: [explicit exclusions]

Inspect the actual base..head diff and relevant surrounding code. Check semantic
contracts, state ownership, partial failure and cleanup, concurrency, reset/retry,
boundary conditions, dependency-version assumptions, and adversarial test gaps.
Ignore formatting-only preferences.

Return CODE GO or CODE NO-GO. Any unresolved P0/P1 means NO-GO; GO may retain
only explicitly non-blocking, tracked P2/P3 items. Report only reproducible P0-P3 findings. Each
finding must include file/line, violated contract, evidence, trigger or
reproduction, impact, and a focused regression test. State "No findings" when
the evidence supports it.
```

## Fresh final review

```text
Perform a fresh completion review without relying on previous reviewer approval.
Do not modify files.

Stage: [stage]
Workspace/branch: [workspace and branch]
Base commit: [stage base]
Head commit: [stage head]
Authoritative documents: [paths and relevant sections]
Acceptance checklist: [requirements with evidence]
Verification gates: [fresh commands and results]
Closed findings: [complete disposition list]
Out of scope: [explicit exclusions]

Reconcile design, implementation, tests, generated artifacts, and dependency
behavior. Look for false-green tests, stale documentation, unowned state,
incomplete cleanup, and claims stronger than the evidence.

Return FINAL GO or FINAL NO-GO, then reproducible P0-P3 findings using the same
evidence fields. Any unresolved P0/P1 or unmet required gate means FINAL NO-GO;
FINAL GO may retain only explicitly non-blocking, tracked P2/P3 items.
```

## Narrow follow-up

```text
Continue the existing review. Do not modify files or rescan unrelated code.

Review ID: [same review ID]
Prior findings: [IDs and prior disposition]
Changes since review: [small exact file/behavior list]
Fresh evidence: [only invalidated gates rerun]

Verify only whether these changes close the listed findings without introducing
an adjacent regression. Return changed dispositions, any new reproducible P0-P3
finding in the standard evidence shape, and the role-appropriate GO/NO-GO verdict.
Any unresolved P0/P1 or unmet required gate means NO-GO.
```

## Host disposition record

For each finding, the host agent records:

```text
[finding ID] — confirmed | rejected | deferred
Evidence: [reproduction, source, contract, or counter-evidence]
Action: [fix and test, rejection reason, or separately tracked follow-up]
Re-review: [chat/review ID and outcome]
```
