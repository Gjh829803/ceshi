# Block World production outcome parity design

Status: Frozen by explicit product decision on 2026-09-04.

## 1. Decision

The current Babylon Native implementation keeps its architecture, ownership, deterministic evidence,
and atomic publication. All non-architectural production behavior follows the successful historical
`codex/block-world-main-integration@9e35ab53` workflow, including its stage order, requested-scope
completion rules, retry/resume behavior, and final success/failure meaning.

There is exactly one user-facing production status:

```text
productionOutcome = every required historical-equivalent stage in the requested scope completed
  ? passed
  : failed
```

Current-only Evaluation and NBR verification remain valuable but have a separate authority:

```text
strictDiagnosticOutcome = passed | failed | incomplete | not-run
```

`strictDiagnosticOutcome` never overwrites `productionOutcome`. It can block an explicitly requested
NBR-70/NBR-90 or strict acceptance workflow, but it cannot block ordinary production publication.

## 2. Boundaries retained from current architecture

- exactly one Canonical or Babylon Native Scene Source;
- Native Module owns visuals and explicit Frozen Contributions only;
- Host/SDK exclusively own Engine, Scene, Havok, Subject, Camera, Input, fixed Tick, Action, Reset,
  lifecycle, Package, Capture, and publication;
- no Mesh/tag/name/color inference creates Physics or Gameplay truth;
- no Three.js Block Source, legacy Manifest/Compiler, hidden foundation, compatibility alias, or
  parallel V1/V2 outcome path;
- final files are still staged, hash-verified, fsynced, and atomically renamed. This strengthens transport
  safety without adding a semantic success gate.

## 3. Requested scopes and exact terminal meaning

### 3.1 Scene scope

The following are blocking historical-equivalent stages:

1. Planner Brief, entry target, World Plan, self-check, and one Host replay;
2. Builder source, structural self-check, mandatory entry/top-down visual comparison inspected inside
   that Builder task, and one Host replay of derived data and decoded pixels;
3. current Native Check, Ground Analysis, and Package as the Babylon Native replacements for the old
   compiler/buildable-world closure;
4. Babylon opening/tri-view Capture, Runtime evidence, and third-person entry validation;
5. when a reference image is present and the requested scope includes base styling, styled opening and
   all declared styled tri-views with the historical input-role/hash/file checks.

If a downstream optional visual step fails, an already admitted playable whitebox remains passed and
launchable. The requested top-level scope fails until its own required artifacts close; it does not mutate
the upstream whitebox outcome.

### 3.2 Episode visual-sample scope

The historical equivalents are blocking: reconnaissance, navigation evidence, plan, six whitebox
segments, capture health, exactly ten opening anchors, per-variant visual generation and independent
review, and collection diversity review. Historical retry budgets remain `3` capture attempts, `4`
opening-anchor attempts, and `2` per-variant visual attempts. Passing variants and images are immutable.
The terminal outcome is passed only at `10/10` visual-passed variants.

### 3.3 Episode full scope

Visual-sample closure plus per-variant event plan, video prompts, six video generations, and historical
technical conformance are blocking. A failed variant does not stop sibling work, but the aggregate terminal
outcome is passed only at `10/10` succeeded variants. Provider/model/deployment names stay behind adapters;
the observable retry, resume, and terminal rules are preserved.

An independent semantic Video Reviewer is a current strict diagnostic because the old workflow did not
have one. Its finding cannot change ordinary production success.

## 4. Current check disposition

| Current check | Ordinary production authority | Strict authority |
|---|---|---|
| Native syntax/API/Profile, explicit Block/Collider/Surface admission | blocking; required to build the architectural replacement | also recorded |
| Ground/Package/Capture availability and identity needed to launch | blocking; historical build/capture equivalent | also recorded |
| historical-equivalent entry validation and required artifact freshness | blocking | also recorded |
| seven-dimension reconstruction Evaluation | diagnostic and repair input unless its failure means a required stage cannot exist | blocking only in explicit strict acceptance |
| NBR-70 exact Case/Formal/Contribution blocker join and optional playability replay | diagnostic in ordinary production | blocking only in explicit NBR-70/NBR-90 verification |
| independent final Video semantic review | diagnostic | blocking only when the caller explicitly requests strict media acceptance |

The code for every strict check remains. No threshold is weakened and no compatibility fallback is added;
only the authority that converts its result into the ordinary production terminal outcome changes.

## 5. CASE-054 normative example

For `paper-moon-palace-054-report-only-0904/run-20260904134439-41905`:

```text
productionOutcome: passed
publicationOutcome: published
evaluationOutcome: passed
strictDiagnosticOutcome: failed
strictDiagnosticCodes:
  - NBR70_BLOCKER_IDENTITY_MISMATCH
Studio status: ready
Studio outcome: passed
```

The final Package/Capture/Evaluation is atomically published and launchable. The blocker mismatch remains
visible and continues to fail an explicit strict NBR verifier, but cannot close the production task.

## 6. Current-only contract change

- remove `preview-ready / publicationStatus: not-accepted` as the final authority for a complete playable
  ordinary production run;
- publish a closed `strict-diagnostic` receipt beside the final artifacts and bind its Hash into the launch;
- expose `productionOutcome` and `strictDiagnosticOutcome` separately in CLI/Studio;
- do not retain an old and new outcome parser, boolean switch, environment toggle, or compatibility alias;
- cancellation, missing required artifacts, stale identities, unsafe paths, failed Native build/Capture, or
  failed atomic publication remain production failures.

## 7. Acceptance

- a fixture equivalent to CASE-054 publishes and returns production passed while strict diagnostics carry
  `NBR70_BLOCKER_IDENTITY_MISMATCH`;
- a missing/invalid Package, Capture, entry validation, required styled artifact, Episode segment, variant,
  or final video still fails the matching requested scope;
- strict verifier pass/fail/incomplete/not-run all serialize deterministically and survive final publication;
- explicit NBR-70/NBR-90 commands still fail on the same strict defects as before;
- Stage resume never repeats a completed paid provider Job and never changes passed artifact Hashes;
- no final directory becomes visible before every required object and its identities are durable.
