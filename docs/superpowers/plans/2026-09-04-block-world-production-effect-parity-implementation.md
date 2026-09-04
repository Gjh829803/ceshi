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
| `BWMI-PROD-10` base visual | CF-23, CF-14/16 | opening-first visual task + historical file/hash admission | sequential | styled opening anchor then tri-views; downstream failure preserves whitebox pass |
| `BWMI-PROD-20/30` Episode visual sample | PROD-10 | six Capture + ten variants/reviews/diversity | sequential orchestration; bounded parallel fan-out | exact old terminal/retry/resume matrix and `10/10` closure |
| `BWMI-PROD-40/50/60` full media/cloud | PROD-20/30 | Event/Video adapters, durable DAG, atomic S3 release | main-agent-only integration | six videos per variant, `10/10`, lost-response reconciliation, exact-SHA canary |
| `BWMI-PROD-45` strict media diagnostic | PROD-40 | independent reviewer receipt | parallel-safe | finding never changes ordinary production outcome |

## Verification policy

During implementation run only the focused RED→GREEN test, the directly affected Skill drift gate, and
the smallest package/typecheck consumer. Changes to public result contracts additionally require every
direct parser/Studio consumer. After the candidate freezes, run one exact-SHA CASE-054 production pass and
one explicit strict NBR verifier; the expected split is production passed/published and strict diagnostic
failed until `BWMI-CF-13` is later repaired. Do not rerun the removed duplicate fresh Browser replay.

The final whole-chain checkpoint is one exact-SHA cloud Scene plus one exact-SHA full Episode. It is not
earned by local unit tests, docs, a worker receipt, or the historical branch's evidence.
