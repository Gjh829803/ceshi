# CF Scene parameter parity audit — 2026-09-07

Mode B: main-agent change/production-chain comparison, not independent review.
Repair tree: `codex/cf-production-effect-closure`, MEM4 changes on `df1d8350`.
Pinned old source: `codex/block-world-main-integration@9e35ab53c634acaef8c53a33082fff77653f7bbb`.
The user requires old behavior, parameters and ordering, no added ordinary production
gate or extra source-repair tasks, and a fresh local Case only after alignment.

## Evidence and conclusions

All rows below are **static-read**, unless a narrower automated result is stated.
An equal default does not prove equal final resolved state or pixels. The older
2026-09-04 main comparison is historical evidence, not current status.

| Boundary | Pinned old source | Current owner / conclusion |
|---|---|---|
| Planner image order | `scripts/agents/run-spatial-world-agent.sh:128-134`: Brief → inspected entry → plan conditioned on exact accepted entry | Planner Skill's causal image sequence retains this; entry edits invalidate plan. No new task. |
| Complete world | Old Planner/Builder require at least four times reference-visible area | Live Planner Navigation intent and Native Builder Construction priorities now require the same meaningful footprint, not empty padding. Actual generated geography is unverified. |
| Subject selection | Old `references/subject-camera.md`: ordered executable modes, behavior before likeness, registered Subject before necessary composition | Current Builder Controlled Subject design and admitted authoring catalog retain these instructions. This does not prove every old movement capability exists in current Runtime. |
| Opening defaults | Old `references/subject-camera.md`: distance 5m, target height 1.25m, pitch 0.12rad, FOV 56 degrees | `scripts/reconstruction/generation-request.ts` creates those exact Bootstrap values. Catalog probe values are not mistaken for production defaults. |
| Opening override order | Old `camera-director.ts:954-1015`: Profile, first selected non-first-person authored baseline, Context Modifiers, explicit Preview | Current `camera-director.ts:893-935` has the same order and first-selected binding. Package-bound authored values remain separate from immutable generation Bootstrap and Preview tuning. |
| Advisory camera | Old `scripts/lib/block-world-visual-review.ts:239-279`: spawn plus target height, rear facing, pitch/distance/FOV projection, near rejection at 0.05m | Native renderer `drawEntry` uses the same projection and authored opening. Neither renderer resolves actual Runtime socket/collision state. |
| Advisory rasters | Old renderer: top 768 square, entry 960×540, 40px top padding, 7px spawn token | Current renderer uses the same values; comparison outputs 1544×768 and 1928×540. Cluster bounds are unscaled in both advisory renderers; 0.985 is actual display scaling, not a claim of software/Runtime pixel identity. |
| Formal raster | Old `scripts/cli/worldkit.ts:1548`: 1280×720, scale factor 1 | Current `native-world-case-preparation.ts:450-452`: 1280×720, DPR 1. |
| Formal task timeout | Old `scripts/agents/run-lwdp-codex-task.mjs:254`: 1800 seconds default | Current production budget owner freezes 1800 seconds. Cloud execution/retry is not exercised by a local Case. |
| Block geometry | Old four shapes, occupancy 0.5m per axis; center lattice 0.25m per axis | Current same four dimensions plus 0.25m-high `step`; occupancy `[0.5,0.25,0.5]`, center lattice `[0.25,0.125,0.25]`. Actual contract difference, not numeric parity. |
| Pre-allocation clustering | Old compiler clusters first in 32m center-owned chunks, X→Z→Y | MEM4 now clusters before Native Mesh allocation; 685 focused tests and real unchanged 158100-Block Host diagnostic passed. Not full Case evidence. |
| Opening capture timing | Old CLI waits for ready and another animation frame before capture | Current Formal provider resets, waits for render readiness, commits one neutral fixed Tick, waits again and verifies unchanged Tick. Exact captured state/timing parity is not established. |
| Camera occlusion | Old Block Runtime constructs `ThirdPersonSubjectOcclusionFadeV1` at lines 1087-1091 and passes `subject-occlusion-fade` at 1172-1174; Director skips Spring Arm for that strategy | Current Native uses the sole Hard Decollider/Spring Arm path and has no old fade integration. **Confirmed behavior gap**, not a missing test alone. |

## CF-04/12-OCC: frozen-design conflict and next implementation boundary

Old production does not merely enable a cosmetic effect on the same camera. Its
Block route disables third-person collision retraction and fades occluding block
instances. Current `2026-08-30-third-person-camera-collision-and-spring-arm-design.md`
requires hard collision safety and explicitly says soft fade cannot replace it.
Therefore these two behaviors cannot honestly be described as fully aligned.
Do not silently relax that design, call the difference acceptable, or remove the
Spring Arm call alone and claim the old behavior was migrated.

Pinned old fade values from `third-person-subject-occlusion-fade.ts`:

- selection interval `1/15` seconds; 3×3 subject sample rays;
- horizontal/vertical margins `0.45m` / `0.55m`;
- coverage threshold `0.3`, strong/light opacity `0.3` / `0.5`;
- fade-in/out `0.15s` / `0.25s`, opacity epsilon `1e-4`;
- eligible old semantic families: obstacle, interactive-solid, visual-only and landmark;
- top-down and entity-triview suspend fade and restore prior enabled state;
- per-instance dither uses a dedicated attribute on actual display batches.

These are historical implementation inputs, not newly activated Native contracts.
Native grouping/Palette must be explicitly mapped; no name/tag scan may infer
Physics or Gameplay. Current materials, partial-cluster Capture, batch disposal,
Snapshot/Reset/Replay/Rollback and fixed/render timing must be considered together.

| Task | Dependency / exclusive owner | Input → output | Required evidence | Mode |
|---|---|---|---|---|
| CF-04/12-OCC-A | Current Camera design and pinned old production trace; main architecture owner | Explicit conflict resolution → amended single-owner Camera/visual contract, consumer inventory and deletion conditions | No hidden old/new toggle, no new production gate, distinguish image presentation from movement/collision authority | main-agent-only |
| CF-04/12-OCC-B | OCC-A; existing Camera Director and Native visual materializer | Admitted world/Subject/camera state → old-equivalent resolved opening and occlusion presentation | Obstruction reproducer; all opacity/timing values, per-instance selection, partial construction/disposal, Context/Preview ordering, Reset/rollback/two sessions | sequential |
| CF-04/12-OCC-C | OCC-B; existing Formal/interactive/artifact capture | Same admitted world and resolved camera → captures with declared matching view policy | Non-symmetric wall/Subject, opening vs top/triview isolation, actual browser pixels, 0/0.5/1 interpolation, no Gameplay Snapshot mutation | sequential |

The remaining shape/walkable and Capture timing differences also need explicit
resolution. This audit does not close CF-04/12, all CF development, exact-SHA full
CI, independent review or fresh local production acceptance. No new Case was
submitted and no historical failed artifact was edited.
