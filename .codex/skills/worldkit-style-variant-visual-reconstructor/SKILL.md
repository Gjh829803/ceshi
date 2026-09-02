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
- The selected `style-variant.json` exclusively owns final Subject identity, target
  identity, environment, materials, colors, contour language, detail, atmosphere,
  and lighting.
- No original styled opening frame or original styled tri-view is provided. Do not
  reconstruct, imitate, or guess the source style from target names or Scene text.

Preserve macro-spatial registration, not source semantics or Block World tessellation.
Remove cube seams, voxel steps, semantic colors, grids, helpers, UI, and placeholder
geometry. Fit continuous, coherent final forms inside registered occupancy envelopes.
The Subject, environment and every target must visibly embody this variant rather than
falling back to a generic traveler, the source costume, or the source landmark class.
A landmark may be redesigned completely, but must not move, shrink into the distance,
become fully visible when the whitebox crops it, or block a protected movement envelope.

## Required generation order

Keep this work inside one Agent task, but perform it in a strict dependency order:

1. Generate `segment-00-styled-opening-frame.png` from the Segment-00 whitebox and
   `style-variant.json`. Inspect and repair it before producing dependent images.
2. Treat that accepted styled opening as the realized appearance anchor for this
   variant. For every target tri-view image-generation call, include both the accepted
   styled opening and that target's whitebox tri-view. The styled opening owns realized
   identity, costume, materials, palette and landmark appearance; the whitebox tri-view
   owns Front/Right/Back direction, physical scale, baseline and geometry. Use the
   variant text only to infer details hidden in the opening.
3. Generate Segments 01-05 with their own whitebox frame plus the accepted Segment-00
   styled opening as appearance references. Their camera and spatial registration still
   come exclusively from their corresponding whitebox frame.

Do not generate a tri-view from the style text and whitebox tri-view alone. Do not use
an original styled image in place of the newly accepted Segment-00 anchor.

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
  "referencePolicy": "whitebox-only",
  "appearanceAnchorSegmentId": "segment-00",
  "segmentOpeningFrames": [
    { "segmentId": "segment-00", "prompt": "<standalone complete prompt>" }
  ],
  "styledTriviews": [
    { "visualTargetId": "<exact Host id>", "prompt": "<standalone complete prompt>" }
  ]
}
```

Include all six ordered Segment rows and every ordered target row.
