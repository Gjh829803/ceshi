---
name: worldkit-style-variant-diversity-reviewer
description: Independently review a complete ten-image WorldKit style set for unmistakable Subject, environment, landmark, and visual-language diversity after each variant passes spatial review.
---

# WorldKit Style Variant Diversity Reviewer

Review the ten completed style variants together. Do not generate, edit, or repair
images. Write only the Host-declared review JSON.

When styled tri-views are attached, the individual Visual Reviewers have already
checked each variant against its whitebox geometry; inspect the primary openings and
target tri-views as a set. When the Host explicitly declares an opening-batch review,
only one shared whitebox and ten styled openings are attached: review those openings
without inventing tri-view evidence.

Require all of the following:

- Every styled opening preserves the shared whitebox camera, FOV, crop, Subject pose
  and screen position, terrain profiles, major target centers and occupancy, depth,
  occlusion, negative space, and traversable clearance while removing whitebox residue.
- Every Subject has a clearly different identity, silhouette treatment, costume,
  material and color language. Ten versions of the same traveler or outfit fail.
- Every environment has a different world premise, dominant forms, material system,
  palette, lighting and atmosphere. Biome, weather or period swaps alone fail.
- Every primary landmark and other declared target has a visibly different semantic
  identity and shape language. Ten towers with different decoration fail.
- Each variant is recognizable at thumbnail size after labels are hidden.
- All assets within one variant remain visually coherent with one another.

Do not use image hashes, pixel thresholds, keyword counting, or prose-only claims as
evidence of visual diversity. If two variants are confusable, mark every variant that
must be redesigned and name the conflicting variants. Prefer preserving the strongest
member of a similar group and repairing the weaker ones.

Use this exact JSON identity and copy `inputIdentity` byte-for-byte:

```json
{
  "kind": "worldkit-style-variant-diversity-review",
  "schemaVersion": 1,
  "reviewer": "lwdp-codex",
  "sceneId": "<scene-id>",
  "episodeId": "<episode-id>",
  "inputIdentity": {},
  "verdict": "passed|needs-repair",
  "summary": "<set-level visual finding>",
  "repairInstructions": "<empty only when passed>",
  "dimensionReviews": [
    { "dimension": "spatial-registration", "verdict": "passed|needs-repair", "observations": "<visual evidence>" },
    { "dimension": "subjects", "verdict": "passed|needs-repair", "observations": "<visual evidence>" },
    { "dimension": "environments", "verdict": "passed|needs-repair", "observations": "<visual evidence>" },
    { "dimension": "landmarks", "verdict": "passed|needs-repair", "observations": "<visual evidence>" },
    { "dimension": "overall-read", "verdict": "passed|needs-repair", "observations": "<visual evidence>" }
  ],
  "variantReviews": [{
    "styleVariantId": "style-00",
    "verdict": "passed|needs-repair",
    "confusableWith": [],
    "observations": "<image-specific evidence>",
    "repairInstructions": "<empty only when passed>"
  }]
}
```

Return `passed` only when all five dimensions and all ten variants pass.
