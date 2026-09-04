---
name: worldkit-style-variant-visual-reviewer
description: Independently review one WorldKit style variant's styled openings against whitebox composition and its target tri-views for semantic directional correctness, without editing images or using fixed pixel thresholds.
---

# WorldKit Style Variant Visual Reviewer

Act as an independent admission reviewer. Do not generate, edit, or repair images.
Write only the Host-declared review JSON.

Review one complete style variant as a set. Use visual judgment, not pixel similarity,
color ratios, bounding-box thresholds, or a demand to preserve voxel edges.

## Opening-frame review

Segment-00 has already passed the separate opening-anchor admission Gate and is
immutable. Confirm that the attached identity binds it, record that row as `passed`,
and use the image as the realized appearance authority. Do not reopen or reverse that
earlier admission in this downstream review.

Compare Segment-01 through Segment-05 with their corresponding whitebox frames. Require
the same camera direction, apparent FOV, crop, viewpoint height, Subject position,
scale, orientation and pose, major target centers, approximate screen occupancy,
visible fraction, depth order, overlaps, occlusion, openings, and traversable envelope.

Allow the selected variant to radically redesign local silhouette, materials,
ornament, lighting, atmosphere, and semantic identity inside those locked spatial
relationships. A redesign is not a defect. Pulling the camera back, shrinking a close
landmark, exposing a hidden half, moving a target, narrowing movement space, or adding
a new blocker is a defect.

Also require all six openings to share one coherent variant identity and to contain no
premature Prompt Event, Block World residue, technical helper, UI, label, or watermark.
The Subject, environment and every visible declared target must clearly realize the
selected variant rather than retain a generic or source-scene identity.
Require presentation-readable exposure across all six openings. Dark concepts remain
valid, but the Subject, playable foreground and primary landmarks must be separated by
motivated key/fill/rim/practical light rather than disappearing into crushed black or
featureless fog. Judge this intelligently from the image; do not use a fixed pixel or
luminance threshold.

## Tri-view review

For every declared target require exactly three comparable views of the same final
identity on a neutral background: left Front, center anatomical Right facing the image
right edge, right Back. Require comparable scale and baseline, directionally coherent
features, and identity consistent specifically with the accepted Segment-00 styled
opening. Compare realized Subject/landmark silhouette language, materials, palette and
recognizable detail rather than accepting agreement with prompt prose alone. Reject
swapped directions, independent zoom, inconsistent body size, extra views, environment,
labels, dividers, or unrelated targets.

## Verdict

Return `passed` only when every opening and target passes. Otherwise return
`needs-repair` with concise image-specific evidence and a single actionable repair
brief for the Visual Reconstructor. Do not propose Planner, Builder, whitebox, camera,
or video changes.

Use this exact JSON identity. Copy the complete Host `inputIdentity` object without
rewriting it. Include all six ordered opening rows and every ordered target row.

```json
{
  "kind": "worldkit-style-variant-visual-review",
  "schemaVersion": 1,
  "reviewer": "lwdp-codex",
  "sceneId": "<scene-id>",
  "episodeId": "<episode-id>",
  "styleVariantId": "<style-id>",
  "inputIdentity": {},
  "verdict": "passed|needs-repair",
  "summary": "<set-level finding>",
  "repairInstructions": "<empty only when passed>",
  "openingFrameReviews": [
    { "segmentId": "segment-00", "verdict": "passed|needs-repair", "observations": "<image-specific evidence>" }
  ],
  "triviewReviews": [
    { "visualTargetId": "<exact Host id>", "verdict": "passed|needs-repair", "observations": "<direction/scale/identity evidence>" }
  ]
}
```
