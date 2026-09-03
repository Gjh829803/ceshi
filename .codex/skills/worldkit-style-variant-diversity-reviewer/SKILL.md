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

Require all of the following. Judge spatial registration semantically from the visible
shot design; this is an intelligent visual review, not pixel matching:

- Every styled opening remains recognizably the same shot: the camera looks from the
  same direction and height band, the Subject retains the same lower/central screen-space
  role, major landmarks remain in the same general background regions and depth order,
  and the foreground/middle/background organization remains recognizable while whitebox
  residue is removed.
- Every Subject has a clearly different identity, silhouette treatment, costume,
  material and color language. Ten versions of the same traveler or outfit fail.
- Every environment has a different world premise, dominant forms, material system,
  palette, lighting and atmosphere. Biome, weather or period swaps alone fail.
- Every primary landmark and other declared target has a visibly different semantic
  identity and shape language. Ten towers with different decoration fail.
- Each variant is recognizable at thumbnail size after labels are hidden.
- All assets within one variant remain visually coherent with one another.

In opening-batch review, identity changes are expected to change exact silhouettes and
scene morphology. Different Subject height, width, anatomy, costume, pose nuance or ground
contact row is acceptable when the Subject keeps the same general lower/central role.
Different terrain materials, rolling profiles, shallow shelves, seams, rails, cells, ribs,
small props and style-native surface detail are acceptable when the shot still reads as
the same foreground-to-horizon arrangement. Landmark shape, size and visible fraction may
change enough to express its new semantic identity when it remains a background landmark
in the same general region. A single opening image is not proof of collision or gameplay
topology, so do not reject it based on assumed traversability or exact route width.

Fail spatial registration only for a clear shot-design break: a different camera direction
or perspective class, the Subject moving to a different screen region or disappearing, a
background landmark moving into the foreground or to a different side, foreground and
background roles being inverted, or a dominant new occluding mass that makes the original
composition unrecognizable. Describe that visible semantic mismatch. Do not require exact
FOV, exact horizon row, exact bounding boxes, exact occupancy percentages, identical limb
pose or identical terrain silhouettes, and never invent percentages from visual estimation.

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
