---
name: worldkit-style-variant-visual-reconstructor
description: Complete one WorldKit style variant from an accepted Segment-00 appearance anchor by generating Segments 01-05 and complete-target Front/Right/Back tri-views against frozen whitebox evidence.
---

# WorldKit Style Variant Visual Reconstructor

Complete exactly one style variant after its Segment-00 styled opening has already
passed admission. Generate the other five styled Segment opening frames and one
styled tri-view sheet per declared complete target. Never regenerate Segment-00.

## Authority

- Each Segment-01 through Segment-05 whitebox first frame exclusively owns camera, FOV, crop, Subject pose
  and screen region, target anchors, approximate occupancy, visible fraction, depth,
  overlap, occlusion, openings, and visible movement clearance.
- Each whitebox target sheet owns physical scale, baseline, and exact panel order:
  left Front, center anatomical Right facing the image's right edge, right Back.
- The selected `style-variant.json` exclusively owns final Subject identity, target
  identity, environment, materials, colors, contour language, detail, atmosphere,
  and lighting.
- The accepted `segment-00-styled-opening-frame.png` is immutable and exclusively owns
  the realized appearance shared by every new Segment and tri-view. It is an input,
  never an output.
- No original styled opening frame or original styled tri-view is provided. Do not
  reconstruct, imitate, or guess the source style from target names or Scene text.

Preserve macro-spatial registration, not source semantics or Block World tessellation.
Remove cube seams, voxel steps, semantic colors, grids, helpers, UI, and placeholder
geometry. Fit continuous, coherent final forms inside registered occupancy envelopes.
The Subject, environment and every target must visibly embody this variant rather than
falling back to a generic traveler, the source costume, or the source landmark class.
A landmark may be redesigned completely, but must not move, shrink into the distance,
become fully visible when the whitebox crops it, or block a protected movement envelope.

## Required completion order

Keep this work inside one Agent task, but perform it in a strict dependency order:

1. Inspect the accepted Segment-00 styled opening and the selected style definition,
   then write the complete declared prompt bundle before starting image generation.
   Do not recreate, edit, resize, or reinterpret the accepted image.
2. For every target tri-view image-generation call, include both the accepted
   styled opening and that target's whitebox tri-view. The styled opening owns realized
   identity, costume, materials, palette and landmark appearance; the whitebox tri-view
   owns Front/Right/Back direction, physical scale, baseline and geometry. Use the
   variant text only to infer details hidden in the opening.
3. Generate Segments 01-05 with their own whitebox frame plus the accepted Segment-00
   styled opening as appearance references. Their camera and spatial registration still
   come exclusively from their corresponding whitebox frame.

Do not generate a tri-view from the style text and whitebox tri-view alone. Do not use
an original styled image in place of the newly accepted Segment-00 anchor.

The accepted opening and five new openings must share one variant identity. Prompt Events occur later and must
not appear in any opening. Generate tri-views once per variant, never per Segment.

When a prior Codex Reviewer report is attached, repair only its named failures. Keep
all passed generated frames and targets stable. A repair may never modify Segment-00;
if a report criticizes Segment-00, treat that as a Host contract conflict and leave the
anchor unchanged.

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
    { "segmentId": "segment-00", "mode": "accepted-anchor", "prompt": "<describe the accepted appearance authority without requesting generation>" },
    { "segmentId": "segment-01", "mode": "generated", "prompt": "<standalone complete prompt>" }
  ],
  "styledTriviews": [
    { "visualTargetId": "<exact Host id>", "prompt": "<standalone complete prompt>" }
  ]
}
```

Include all six ordered Segment rows and every ordered target row. Segment-00 must use
`mode: "accepted-anchor"`; Segments 01-05 must use `mode: "generated"`.
