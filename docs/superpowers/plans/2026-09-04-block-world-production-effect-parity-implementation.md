# Block World production and effect parity implementation

## Scope and execution graph

This plan implements the frozen production-outcome decision and the effect-relevant behavior retained from
`codex/block-world-main-integration`, under current Babylon Native ownership. Worker success is not
integration proof; each task merges only after its focused contract is green.

| Task | Dependencies | Exclusive owner / output | Mode | Required evidence |
|---|---|---|---|---|
| `BWMI-CF-23A` outcome contract | — | validation/production result types; one `productionOutcome`, separate strict diagnostic union | main-agent-only | parser/canonical/hash fixtures, no legacy alias census |
| `BWMI-CF-23B` runner projection | 23A | reconstruction runner; old-equivalent stage projection and durable strict diagnostic | main-agent-only | CASE-054-shaped strict-failure RED→published GREEN, production-stage negative fixtures |
| `BWMI-CF-23C` atomic publisher | 23A/B | final publisher; integrity without strict semantic veto | main-agent-only | unsafe/stale/partial/fsync/rename fixtures plus strict-failed diagnostic publication |
| `BWMI-CF-23D` Studio projection | 23A-C | Studio status/launch UI | sequential | strict warning with ready/passed; real failure remains failed; Node tests |
| `BWMI-CF-10` Planner causality/admission | — | Planner Skill/checker/Host replay | parallel-safe | entry-first lineage, target masks/recall/aspect, frozen-copy drift |
| `BWMI-CF-19` Builder visual feedback | CF-10 | Native Builder Skill and disposable deterministic renderer | parallel-safe until Host integration | asymmetric entry/top comparisons, same-task repair, post-Native-Check Host pixel replay |
| `BWMI-CF-20/21/22` feasibility/scene/palette | CF-10, CF-19 | Case/Profile/Capture/Evaluation contracts | sequential | CASE-054 budget/feature/color RED fixtures and focused typecheck |
| `BWMI-CF-11/12/14/15` world/Subject/Camera/measurement | CF-10, 20-22 | Host Case/Bootstrap/Capture/Evaluation owners | main-agent-only | local endpoint, target-driven Camera, actual visible pixels, support disposition |
| `BWMI-CF-24` per-target view evidence | CF-10/14/22 | Case/Capture contracts; unique target rows plus per-view evidence disposition | main-agent-only | absent/weak opening mask, top-only presence, real side/top observation, no fabricated bbox |
| `BWMI-CF-25` WebP source input | CF-09 | immutable input decoder/media admission | sequential | real WebP, malformed/signature mismatch, same-byte hash closure |
| `BWMI-CF-26` report-only repair parity | CF-19/23 | one explicit old-equivalent repair policy, without a second outcome authority | sequential | old failure matrix, repairable/non-repairable separation, exhausted budget still uses one terminal policy |
| `BWMI-PROD-10` base visual | CF-23, CF-14/16 | opening-first visual task; same-task self-review + historical Host file/hash/role admission; optional independent review is strict-only | sequential | styled opening anchor then tri-views; independent diagnostic cannot veto; downstream failure preserves whitebox pass |
| `BWMI-PROD-20/30` Episode visual sample | PROD-10 | six Capture + ten variants/reviews/diversity | sequential orchestration; bounded parallel fan-out | exact old terminal/retry/resume matrix and `10/10` closure |
| `BWMI-PROD-40/50/60` full media/cloud | PROD-20/30 | Event/Video adapters, durable DAG, atomic S3 release | main-agent-only integration | six videos per variant, `10/10`, lost-response reconciliation, exact-SHA canary |
| `BWMI-PROD-45` strict media diagnostic | PROD-40 | independent reviewer receipt | parallel-safe | finding never changes ordinary production outcome |

## 2026-09-05 candidate checkpoint

Candidate `codex/block-world-effect-alignment@234c1711` implements `BWMI-CF-23`, the historical Planner
entry-first/World-Plan admission thresholds, `BWMI-CF-19`, and the `BWMI-CF-22` exact palette join for
targets that already have Case visual-group rows. It also freezes the initially read reference bytes through
Case preparation, which closes the source-byte half of `BWMI-CF-09`; Request/Receipt-bound Planner
checker/Skill identity remains open. A disconnected route-colored component is diagnostic only at generic
Native Check; required route connectivity remains a Case Ground/Traversal gate.

This checkpoint does not close `BWMI-CF-11/12/14/15/20/21`, does not solve targets omitted from Case when
their opening mask is absent or unreliable (`BWMI-CF-24`), does not add WebP input (`BWMI-CF-25`), and does
not prove exact old external-repair behavior (`BWMI-CF-26`). It is not merged into `main`, and no real
CASE-054, full Browser, repository-wide, or exact-SHA Cloud run is claimed.

## Verification policy

During implementation run only the focused RED→GREEN test, the directly affected Skill drift gate, and
the smallest package/typecheck consumer. Changes to public result contracts additionally require every
direct parser/Studio consumer. After the candidate freezes, run one exact-SHA CASE-054 production pass and
one explicit strict NBR verifier; the expected split is production passed/published and strict diagnostic
failed until `BWMI-CF-13` is later repaired. Do not rerun the removed duplicate fresh Browser replay.

The final whole-chain checkpoint is one exact-SHA cloud Scene plus one exact-SHA full Episode. It is not
earned by local unit tests, docs, a worker receipt, or the historical branch's evidence.
