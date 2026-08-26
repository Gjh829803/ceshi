# Route R1 Task 4 Implementation Review

Status: CODE GO; fresh final review completed with no open P0-P3

## Review metadata

- Mode: full-dimension review protocol Mode B (change review).
- Object: `codex/m5-route-r1-heightfield`, base commit `616a75c`, current Task 4
  working-tree candidate.
- Scope: canonical Heightfield Graph projection, SDK-owned path query, source-derived rejection
  proof, exact Recast `0.43.1` source-area/query/lifecycle Adapter behavior, Traversal contracts,
  and Validation projection.
- Excluded: Task 5–10 Runtime Probe, CLI/Browser orchestration, swimming, R1b static Traversal
  Surfaces, camera/input changes, and bundle-size work.
- Installed provider: `recast-navigation` / `@recast-navigation/core` /
  `@recast-navigation/generators` `0.43.1`, pinned through the checked lockfile and exact patches.
- Evidence levels: `static-read` and `automated-contract`. No rendered-visual or
  manual-interaction evidence is claimed for this Graph-only task.

Commands completed with exit `0`:

- `pnpm install --frozen-lockfile`
- focused Task 4 Vitest gate: 19 files / 176 tests
- `pnpm typecheck`
- `pnpm verify:route-r0-contract`
- `pnpm test`: 120 files / 1043 tests
- `pnpm build`
- `git diff --check`

The build retains the existing Vite large-chunk warning. Full tests retain existing Babylon
NullEngine bone-uniform and deprecated Rapier initialization warnings. None originates in, or is
changed by, the Task 4 Traversal diff.

## Old-conclusion revalidation

- Revalidated: Recast remains a provider-only implementation; no provider Ref, status, owner,
  path, or error string crosses the package root.
- Revalidated against installed `0.43.1`: raw Query capacity is Adapter-owned and distinct from
  SDK A* `maximumSearchSteps`; raw polygon Refs are admitted only within the unsigned 32-bit ABI.
- Revalidated: Graph is the only pass/fail authority. The source graph explains an already-proven
  unreachable result and cannot create a complete Path.
- Revalidated: the Task 2 lifecycle ownership and no-option semantic golden remain unchanged;
  source areas are active only for positive blocker geometry.
- Revalidated: prior deep runtime findings are outside this Graph-only diff and were not redone.

## Findings and dispositions

### [P1] [D2/D4] Canonical width rounding could produce contradictory specialized evidence

- Evidence (`automated-contract`): Cursor review `task4-candidate-616a75c-wt1` reproduced raw
  `0.7395m` width being ceiled to canonical `0.740m`, equal to the required `0.74m`, while the
  connectivity Failure contract requires observed width to remain strictly smaller.
- Expected: rounding occurs before the final strict-threshold decision; contradictory proof rows
  fail closed to generic unreachable.
- Impact: a threshold-adjacent real failure could become an infrastructure exception instead of a
  deterministic Failure artifact.
- Disposition: confirmed and fixed. Builder and evaluator regressions first failed, then passed.
  Every threshold aggregation now rejects contradictory canonical evidence.
- Recheck: same Cursor chat returned `CODE GO` and explicitly marked the finding closed.

### [P1] [D4] A vertically irrelevant component could become a false width obstruction

- Evidence (`automated-contract`): a compound closed soup with one low component far from the
  Route and one high component above the Route produced a unique width cut because the old code
  projected every triangle after testing only whole-collider Y extrema.
- Expected: width attribution uses only solid geometry intersecting the terrain/step vertical slab.
- Impact: an author could receive a false width diagnosis for passable ground under high geometry.
- Disposition: confirmed by host RED and fixed by vertical slab clipping plus correct degenerate
  projected-triangle distance semantics.
- Recheck: same Cursor chat explicitly confirmed the compound-collider regression is closed.

### [P2] [D4] Surface-only slab projection could hide a tall solid and leave a false unique slope

- Evidence (`automated-contract`): Cursor follow-up showed a wide grounded Box whose top and bottom
  lie outside the slab projecting only its side-wall ring. Interior source centroids could be more
  than the capsule radius from that ring, so a separate slope became the only recorded reason.
- Expected: complete solid collider evidence represents filled `solid intersect slab`, not a
  hollow surface ring.
- Impact: the Graph remained correctly unreachable, but the diagnostic could tell an author to
  fix only a slope while the Box still blocked the Route.
- Disposition: confirmed by host RED and fixed. Vertical ray/closed-solid interval evidence marks
  points inside the slab intersection as zero clearance while retaining exact surface distance for
  exterior points. The wide-Box-plus-slope fixture is now generic mixed; the ordinary unique-slope
  fixture remains specialized.
- Recheck: focused and full gates pass. The fresh final review explicitly confirmed this finding
  is closed.

### [P3] [D6] Endpoint projection failures lacked evaluator-level regression evidence

- Evidence (`static-read`): the fresh final review found Provider-level nearest-miss coverage but
  no full evaluator regression proving canonical endpoint Failure projection.
- Expected: a Provider miss and a complete Provider Ref excluded from the canonical Graph both
  fail at the evaluator boundary with the role-correct stable endpoint reason.
- Impact: production behavior was already implemented, but its public Failure contract depended
  on lower-level and static evidence rather than an end-to-end regression.
- Disposition: accepted and closed with evaluator-level tests for a start miss and a filtered
  destination Ref. No production behavior changed.
- Recheck: focused and full gates pass with the two added regressions.

### Withdrawn host hypothesis: unsafe half-grid averaging at extreme world coordinates

- Evidence (`automated-contract`): the attempted reproducer is rejected earlier by the frozen
  micrometer Build Budget because its coordinates exceed the deterministic admitted range.
- Disposition: withdrawn; no production change or regression was retained for an inadmissible
  input.

No unresolved P0-P3 finding remains in the host or independent review. Task 4 is approved for
commit and push. This approval remains limited to Graph/Query evidence and does not approve M5,
Task 5–10, Runtime Probe, or either production Blocking Gate.

## Cursor review record

- Review ID: `task4-candidate-616a75c-wt1`.
- Chat ID: `20dfb053-e5cb-41c3-9d65-ddbdc66f38dc`.
- Model/mode: Cursor Grok 4.6 Extra High, read-only `ask`, invoked through the repository helper
  that was available at the time and has since been removed.
- Initial result: exit `0`, `CODE NO-GO`, one confirmed P1 width-quantization finding.
- Same-session follow-up: exit `0`, `CODE GO`; the P1 and host compound-collider fix were closed.
  One non-blocking P2 filled-solid attribution gap was reported and then accepted/fixed by the host.
- Session evidence: Git worktree metadata `cursor-review-sessions.json`; prompts
  `/tmp/m5-task4-cursor-code-review.md` and
  `/tmp/m5-task4-cursor-code-review-followup.md`.
- Cursor changed no files. Host independently reproduced and dispositioned every finding.

Fresh final review:

- Review ID: `task4-final-616a75c-wt2`.
- Fresh chat ID: `bee4e2f7-581e-4f2b-87bd-3e0eabd92c9f`.
- Result: exit `0`, `FINAL GO`, no P0-P2. Its sole non-blocking P3 test-evidence gap is closed
  above.
- The parent reviewer independently read the installed Recast `0.43.1` source. A separate
  provider-source subaudit exhausted its model quota and produced no usable evidence; it did not
  alter the parent verdict.
- Prompt evidence: `/tmp/m5-task4-cursor-final-review.md`.
- Cursor changed no files.

## Dimension coverage

| Dimension | Coverage |
| --- | --- |
| D1 positioning/scope | not required by Mode B; checked for absence of Runtime/Browser/R1b scope leak |
| D2 Schema/AI-friendly | checked: canonical units, role IDs, closed unions, provider-neutral package root |
| D3 promise/fact | checked: Task 4 Graph evidence is not described as M5/Runtime completion |
| D4 single authority | checked: Receipt, Graph, A*, source explanation, raw Query, and cleanup owners remain singular |
| D5 engineering quality | checked: direct dependencies, deterministic ordering, numerical bounds, total unwind, adversarial regressions |
| D6 gates/evidence | checked: focused/full commands and warnings recorded; no visual/runtime capability claim |
