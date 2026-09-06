# Whole-scene feature review (CF-21)

Use this explicit, read-only diagnostic after the requested Case has produced
formal captures. It preserves the legacy human-owned geography review: it does
not run another Planner, Builder, image model or semantic detector. It is not a
production gate, replacement Evaluation, or proof that the scene is complete.

## Prepare the review

Read the exact frozen Scene Brief, uploaded references and planning PNGs for the
Case. Inventory the salient whole-world features, not just its selected visual
targets. Include relevant terrain, bridges/stair courses, side/rear geography,
repeated formations, courtyard/opening negative space, and macrocomposition
(silhouette, density, depth, containment and occlusion). Do not insert features
that the current references do not support. Keep inferred continuation distinct
from directly observed reference evidence.

Then inspect the exact formal `opening.png`, `world-side.png` and
`world-top-down.png` selected by the Capture Receipt. Choose the views needed to
judge each feature. A lack of visibility is not evidence of absence: record
`not-assessable` when occlusion or framing prevents an assessment. Do not silently
drop a difficult feature or a required view to obtain an all-matched report.

Write one reviewer-owned JSON file outside the frozen Case/Attempt inputs. Its
closed shape is illustrated below; this example is not a reusable scene design.
Replace all hashes and evidence with this Case's actual values before running.

```json
{
  "kind": "scene-feature-review",
  "schemaVersion": 1,
  "caseHash": "sha256:<canonical Case hash>",
  "sceneBriefHash": "sha256:<exact Brief byte hash>",
  "captureReceiptHash": "sha256:<canonical Capture Receipt hash>",
  "reviewerId": "review-session-identifier",
  "features": [
    {
      "id": "bridge-course",
      "name": "Reference-supported bridge course",
      "kind": "route",
      "regions": ["entry", "middle"],
      "basis": {
        "kind": "reference-image",
        "inputRef": "reference-0.png",
        "regionPixels": [100, 200, 300, 120]
      },
      "expectedViewIds": ["opening", "world-side", "world-top-down"],
      "expectedInstanceCount": 1
    }
  ],
  "observations": [
    {
      "featureId": "bridge-course",
      "viewId": "world-side",
      "presence": "present",
      "completeness": "partial",
      "placement": "drifted",
      "regionPixels": [130, 240, 300, 100],
      "visibleInstanceCount": 1,
      "note": "The crossing is present, but its deck is flat instead of reaching the higher destination."
    }
  ]
}
```

Hash using existing owners, not a manually sorted or reformatted approximation:

- `hashWorldReconstructionCaseV1` from `@whitebox-world/validation` for Case JSON;
- the Case's `sceneBriefHash`, verified against `sha256Bytes` of the original Brief;
- `hashFormalWorldCaptureReceiptV1` from `@whitebox-world/runtime-contracts` for the
  original Capture Receipt JSON.

Each feature `kind` is `landmark`, `terrain`, `route`, `formation`, `negative-space`
or `composition`. It creates no visual-target ID, Gameplay entity or Collider.
Regions are reviewer-declared `entry`, `middle`, `side`, `rear` or `remote`, not
machine-derived physical regions. Empty regions in a report do not prove absence
of required scenery. Counts may be `null` when unspecified; per-view visible
counts are never added together to infer a total across overlapping views.

Instead of an image basis, a feature may cite:

```json
{"kind":"brief-excerpt","section":"visibleReferenceEvidence","excerpt":"exact text copied from that section"}
```

Allowed sections are `userFacts`, `visibleReferenceEvidence`,
`inferredContinuation`, `space`, `navigation` and `openingShot`. The excerpt must
exist in the named section; matching text does not itself prove the reviewer's
semantic interpretation. Image bases must join a Case reference and its exact
bytes. All pixel regions are `[left, top, width, height]` in that specific image,
not normalized coordinates, meters, projected AABBs or cross-image coordinates.

Observation values:

- `presence`: `present`, `absent`, `not-assessable`;
- `completeness`: `complete`, `partial`, `not-assessable`;
- `placement`: `matches`, `drifted`, `not-assessable`.

For `absent` or unassessable presence, completeness and placement must remain
`not-assessable`; the pixel rectangle marks the inspected region, not fabricated
geometry. An absent feature cannot have a positive visible count. Give a concrete
note explaining evidence, uncertainty or the mismatch. Negative space describes
the observed opening/void and relationships, never a fake solid target.

## Run

```bash
pnpm --silent review:scene-features \
  --case /absolute/case/case.json \
  --inputs /absolute/case/inputs \
  --capture-receipt /absolute/attempt/capture/capture-receipt.json \
  --capture /absolute/attempt/capture \
  --review /absolute/reviews/scene-feature-review.json
```

Use the actual receipt location; do not assume the example's directory layout.
The local CLI supports Case input refs relative to `--inputs`; it does not fetch
remote resource refs. It rejects input symlinks and path escapes. It reads only
existing artifacts and writes the diagnostic JSON to stdout. No file is modified.

Exit `0` means the review is structurally bound to the selected inputs, including
a review containing gaps. Exit `2` means invalid arguments or review integrity
(for example stale hashes, out-of-image rectangles or duplicate observations),
not that ordinary production has failed. `--help` requires no files.

The report retains the full declared inventory and observations, exact Case,
Brief, Capture Receipt and PNG identities, and a regional summary:

- `reviewer-matched`: that required view has all three positive reviewer judgments;
- `reviewer-gap`: missing, partial or misplaced according to the reviewer;
- `unreviewed`: no observation or at least one unassessable dimension.

A feature can appear in both gap and unreviewed lists if different views have
different evidence. No observation is fabricated for missing views. The report
explicitly says `authority: reviewer-declared`, `productionEffect: none`, and
`inventoryCompleteness: not-machine-certified`. It verifies input integrity, not
the correctness/exhaustiveness of human observations or a rebuilt WorldPackage.
Final CF acceptance still requires real, traceable whole-scene inspection; a
synthetic review fixture or successful CLI exit is not that evidence.
