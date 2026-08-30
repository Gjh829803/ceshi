---
name: worldkit-episode-visual-reconstructor
description: Generate three spatially locked styled opening frames for one 90-second WorldKit episode and one shared complete-target styled tri-view set. Use only after the whitebox episode has been split into three 30-second videos; do not alter motion, render Prompt Events early, or generate video.
---

# WorldKit Episode Visual Reconstructor

Read all attached roles and the declared target manifest. Create only the Host-declared
prompt bundle, three styled segment opening frames, and one styled tri-view per complete
target.

Before authoring any Segment prompt, read the original completed world's
`visual-generation-prompts.json`, `visual-identity-palette.json`, and accepted
`styled-opening-frame.png`. The original Visual Reconstructor already solved the
case-specific conversion from semantic whitebox evidence into the user's final visual
language. Inherit that solution; do not invent a competing interpretation.

## Authority

- `segment-0N-whitebox-first-frame` is the only spatial authority for its styled
  frame: camera, FOV, crop, pose, subject screen region, terrain, objects, gaps,
  traversable space, depth, overlap, and occlusion remain registered.
- `user-first-frame` is the high-fidelity appearance authority: identity, costume,
  materials, texture, palette, atmosphere, lighting language, and style only.
- `base-visual-generation-prompts` is the mandatory semantic-reconstruction and
  appearance specification. Preserve its opening-frame subject, material, lighting,
  art-direction, helper-removal, and protected-movement rules. Rewrite only spatial
  measurements that must follow the current Segment frame.
- `base-styled-opening-frame` is accepted appearance evidence from the original Visual
  Reconstructor. It fixes the realized surface continuity, detail density, shape
  language, and render finish, but never overrides a Segment camera or layout.
- `whitebox-triview-N` fixes one complete target's geometry and exact left=Front,
  center=Right, right=Back panel order.

Treat each styled segment frame as a registered material repaint, not a new
composition. Segment Prompt Events occur later in each video and must not appear in
these first frames. Keep all three frames in one coherent baseline identity/style,
while respecting their different whitebox cameras and positions.

`Registered` means semantic and macro-spatial registration, not pixel registration to
Block World contours. Preserve the camera, Subject registration, screen-space movement
envelope, object centers, approximate bounding envelopes, major terrain elevations,
blocker footprints, complete landmark masses, openings, depth, and occlusion. The
whitebox does **not** own local edge shape, cube-level silhouette steps, surface
curvature, corner treatment, tessellation, or individual block boundaries. Those are
final-appearance facts owned by `user-first-frame` and `base-styled-opening-frame`.
Remove cube seams, voxel tessellation, staircase contours, regular block facets,
semantic color boundaries, prototype grid lines, and artificial step banding. Fit a
continuous natural contour or curve through each block cluster rather than tracing its
pixel edge. Adjacent blocks
that express one meadow, floor, water surface, snowfield, road, bridge deck, wall,
cliff, or curved landmark must reconstruct as one continuous final surface in the
user reference's shape language. A real stair, terrace, cliff edge, or major level
change declared by the Scene Brief remains; incidental one-block quantization does
not. Never write instructions such as “preserve every block”, “preserve every repeated
ledge”, “preserve every silhouette exactly”, “pixel-registered material repaint”,
“do not smooth any geometry”, or “block-weathered” into a styled-frame prompt.

The prompt conflict rule must be split explicitly:

- the Segment whitebox wins camera, FOV, crop, Subject screen region, object anchors,
  approximate scale, macro occupancy, depth/overlap/occlusion, openings, and movement
  clearance;
- the user frame and accepted base styled opening win final contour language,
  curvature, edge smoothness, local proportions inside those occupancy envelopes,
  materials, texture, palette, atmosphere, lighting, and art style.

## Landmark semantic transfer

A whitebox visual target is a semantic and gameplay proxy, not a final design model.
For a key landmark, preserve its identity, approximate scene zone, visual prominence,
depth layer, projected screen-space occupancy, apparent proximity, visible fraction,
frame-edge entry/exit and crop, relationship to the Subject, relationship to the
movement envelope, and role as a destination or orientation cue. Its final component count, silhouette,
curvature, thickness, break pattern, terminals, local proportions, ornament, and local
placement may differ substantially from the block proxy when the user reference or
accepted base styled opening provides a stronger coherent design. Reconstruct the
landmark so a viewer recognizes the reference-world concept, not the block assembly.
Shape freedom must never be implemented by pulling the camera back, shrinking or
receding the landmark, fitting a complete object into frame, exposing a hidden half,
or changing how much of it is cropped. If the whitebox shows only part of an enormous
near landmark, reconstruct only that visible part in the final style and keep the rest
outside the frame.

Do not force one-to-one replacement of incidental obstacle blocks. Sparse proxy blocks
may be omitted, merged into terrain, or reinterpreted as a smaller number of natural
details when that better matches the user image. The protected movement medium remains
continuous and blocker-free. The controlled Subject keeps the Segment's screen-space
registration unless the Scene Brief explicitly declares another rule.

If the inherited original opening prompt contains older phrases such as “every
silhouette”, “exact polygon boundary”, or “pixel-for-pixel”, carry their semantic
purpose forward only for movement boundaries and major object occupancy. Do not copy
those phrases into a Segment prompt and do not let them preserve voxel geometry.

Preserve the visible movement envelope in each frame. Repaint navigable ground,
water, underwater volume, or open air without narrowing it or adding blockers.
Remove undeclared technical helpers such as flight stands, spawn pads, invisible
collider visualizations, selection markers, grids, UI, and semantic colors.

## Tri-views

Generate one shared sheet per declared complete target, not one set per Segment.
Each sheet contains exactly three comparable orthographic panels on a neutral
background:

- left: Front;
- center: anatomical Right profile facing the image's right edge;
- right: Back.

No labels, dividers, environment, extra target, component split, or extra view.

## Prompt bundle

Write `episode-visual-prompts.json` with:

```json
{
  "kind": "worldkit-episode-visual-prompts",
  "schemaVersion": 1,
  "provider": "lwdp-codex",
  "sceneId": "<scene-id>",
  "episodeId": "<episode-id>",
  "segmentOpeningFrames": [
    { "segmentId": "segment-00", "referenceRoles": ["segment-00-whitebox-first-frame", "user-first-frame", "base-styled-opening-frame"], "prompt": "<complete prompt>" },
    { "segmentId": "segment-01", "referenceRoles": ["segment-01-whitebox-first-frame", "user-first-frame", "base-styled-opening-frame", "segment-00-styled-opening-frame"], "prompt": "<complete prompt>" },
    { "segmentId": "segment-02", "referenceRoles": ["segment-02-whitebox-first-frame", "user-first-frame", "base-styled-opening-frame", "segment-00-styled-opening-frame"], "prompt": "<complete prompt>" }
  ],
  "styledTriviews": [
    { "visualTargetId": "<exact id>", "referenceRoles": ["target-whitebox-triview", "segment-00-styled-opening-frame", "user-first-frame"], "prompt": "<complete prompt>" }
  ]
}
```

Use exact manifest order and ids. State the conflict rule in every prompt.

For an explicitly Host-declared opening-only human-review run, generate only the
declared review prompt bundle and three Segment opening frames. Do not generate
tri-views or undeclared files. All authority and reconstruction rules above remain
identical.

## Workflow

1. Compare the original opening prompt, accepted base styled opening, current Segment
   whitebox, and user reference. Carry the original prompt's case-specific visual
   solution forward while updating the Segment's camera-relative movement envelope.
2. Generate segment 00 styled frame and inspect spatial registration and removal of
   Block World rendering residue.
3. Generate segment 01 and 02 frames using segment 00 only as appearance consistency
   evidence, never as their layout.
4. Generate all shared tri-views, parallelizing independent calls when possible.
5. Inspect movement envelopes, baseline event-free state, identity consistency,
   target count and exact panel order. Regenerate a failed image at most once.
6. Leave outputs at exact paths and finish. Do not generate video or delegate.
