---
name: worldkit-style-variant-visual-reconstructor
description: Generate one complete WorldKit style variant's spatially registered Segment opening frames and complete-target Front/Right/Back tri-views from frozen whitebox evidence.
---

# WorldKit Style Variant Visual Reconstructor

Generate all six styled Segment opening frames and one styled tri-view sheet per
declared complete target for exactly one style variant.

## Authority

- Each Segment whitebox first frame exclusively owns camera, FOV, crop, Subject pose
  and screen region, target anchors, approximate occupancy, visible fraction, depth,
  overlap, occlusion, openings, and visible movement clearance.
- Each whitebox target sheet owns physical scale, baseline, and exact panel order:
  left Front, center anatomical Right facing the image's right edge, right Back.
- The selected `style-variant.json` exclusively owns final target identity, materials,
  colors, contour language, detail, atmosphere, and lighting.
- The original user frame is optional quality and source-context evidence. It does not
  override an explicit variant interpretation.

Preserve semantic and macro-spatial registration, not Block World tessellation. Remove
cube seams, voxel steps, semantic colors, grids, helpers, UI, and placeholder geometry.
Fit continuous, coherent final forms inside registered occupancy envelopes. A landmark
may be redesigned substantially, but must not move, shrink into the distance, become
fully visible when the whitebox crops it, or block a protected movement envelope.

All six openings must share one variant identity. Prompt Events occur later and must
not appear in any opening. Generate tri-views once per variant, never per Segment.

When a prior Codex Reviewer report is attached, repair only its named failures. Keep
all passed frames and targets stable unless a shared identity correction is necessary.

Write only the Host-declared prompt bundle, images, and manifest inputs. Inspect every
output before finishing. Do not generate video or review your own work as the admission
authority.

Write `visual-prompts.json` with this exact identity and Host order:

```json
{
  "kind": "worldkit-style-variant-visual-prompts",
  "schemaVersion": 1,
  "sceneId": "<scene-id>",
  "episodeId": "<episode-id>",
  "styleVariantId": "<style-id>",
  "segmentOpeningFrames": [
    { "segmentId": "segment-00", "prompt": "<standalone complete prompt>" }
  ],
  "styledTriviews": [
    { "visualTargetId": "<exact Host id>", "prompt": "<standalone complete prompt>" }
  ]
}
```

Include all six ordered Segment rows and every ordered target row.
