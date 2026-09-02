---
name: worldkit-visual-reconstructor
description: Generate one WorldKit styled opening frame and all complete-target styled tri-views from verified whitebox evidence and one uploaded appearance reference. Use only for the hosted post-whitebox LWDP Codex visual reconstruction stage; do not use it to author geometry, change runtime behavior, or generate video.
---

# WorldKit Visual Reconstructor

Work inside the extracted task workspace. Read the Scene Brief, visual identity
palette, and whitebox tri-view manifest before generating anything. Attached image
assets are named by the Host; treat their roles as authoritative.

## Responsibility

Create exactly the Host-declared visual outputs:

- `visual-generation-prompts.json`;
- one `styled-opening-frame.png`;
- one `styled-triview.png` for every complete visual target in the whitebox
  tri-view manifest.

Do not edit the Scene Brief, palette, whitebox images, world module, Authoring
data, implementation map, Runtime Snapshot, Camera, physics, movement, or any
other project file. Do not generate video.

## Image authority

For the opening frame:

- `actual-whitebox-opening` is the edit target and sole spatial authority. It
  fixes camera, FOV, crop, horizon, perspective, controlled-Subject pose and
  occupied region, terrain and architecture silhouettes, object centers,
  visible counts, scale, depth order, overlap, occlusion, empty space, and the
  complete visible movement envelope.
- `user-first-frame` is the direct high-fidelity appearance authority. Extract
  Subject identity and costume, materials, texture microdetail, palette,
  atmosphere, weather, and lighting language. Never copy its camera, framing,
  pose, Subject size, layout, object positions, depth arrangement, or occlusion.
- Do not use target tri-view sheets as alternative opening-frame layouts.

Use the built-in image generation tool to edit the actual whitebox opening.
Keep the controlled Subject directly rear-facing and exactly centered at its
whitebox feet position, visual height, and screen-space region. Add visual detail
only inside or immediately upon existing whitebox silhouettes. Remove semantic
colors, whitebox material, grids, helpers, UI, text, logos, and watermarks.

Treat this as a registered material repaint of the whitebox image, not a new
composition or a scene variation. Before writing the opening prompt, identify
the entry movement mode from the Scene Brief and protect its visible movement
envelope:

- for walking or surface vehicles, preserve every visible connected walkable
  ground patch ahead of the Subject;
- for boats, preserve every visible connected water-surface patch around and
  ahead of the craft;
- for swimming, preserve the visible open-water volume and its exits;
- for flying, preserve the visible open-air volume and forward flight clearance.

The protected envelope keeps its exact screen-space boundary, near/middle/far
width profile, curvature, elevation or waterline, continuity, side clearance,
and opening toward the visible destination. Semantic-color pixels belonging to
that envelope must remain the same navigable medium at the same image locations,
apart from the already-present controlled Subject. Repaint their material and
lighting, but never replace them with props, banks, buildings, vegetation,
debris, decoration, foam, or new terrain. Appearance details from the user
reference may occupy only corresponding existing whitebox blocker silhouettes;
omit a reference detail when no such silhouette exists. Do not enlarge blockers
into the movement envelope or narrow an open area into a designed route.

Spatial authority does not make technical helper geometry visible. Cross-check
every apparent support or volume against the Scene Brief and declared visual
targets. Flight stands, subject support columns, spawn pads, camera helpers,
invisible colliders, air walls, movement volumes, shadow catchers, selection
markers, and other undeclared runtime proxies are not scene masses even when
they occupy a distinct whitebox silhouette. Erase them and continue the
surrounding ground, water, or open air through their footprint. This helper
removal overrides mask preservation; never stylize a flight support into a
translucent pillar, pedestal, cloud column, beam, or platform.

For each styled tri-view:

- its named `whitebox-triview-N` sheet fixes the complete target's silhouette,
  proportions, member count, part relationships, and exact Front / Right / Back
  panel order;
- the trusted Host has already applied the target's declared local front and
  one shared orthographic meter-to-pixel scale to all three panels, so never
  reinterpret a panel from the opening Camera or independently zoom one view;
- the generated styled opening and `user-first-frame` fix the shared final
  identity, materials, palette, and art direction;
- render exactly three orthographic panels—Front, Right, Back—on one neutral
  background, with no environment, extra object, labels, text, or additional
  views.

Panel position is a hard contract, not a list of views in arbitrary order:

- left panel = Front, showing the target's face/front plane and front-facing
  feet or base;
- center panel = the target's anatomical Right profile, with its front pointing
  toward the image's right edge;
- right panel = Back, showing the rear of the head/top, torso/body and feet/base.

Keep all three at exactly the same physical scale and vertical baseline. Never swap the Front
and Right panels even when the whitebox silhouettes are visually similar.

One visual target is one complete Subject, building, landmark, or repeated set.
Never turn component parts into separate identities.

## Prompt artifact

Before image generation, write `visual-generation-prompts.json` with this shape:

```json
{
  "kind": "worldkit-visual-generation-prompts",
  "schemaVersion": 2,
  "provider": "lwdp-codex",
  "sceneId": "<scene-id>",
  "openingFrame": {
    "referenceRoles": ["actual-whitebox-opening", "user-first-frame"],
    "prompt": "<complete opening edit prompt>"
  },
  "styledTriviews": [
    {
      "visualTargetId": "<exact manifest id>",
      "referenceRoles": ["target-whitebox-triview", "styled-opening-frame", "user-first-frame"],
      "prompt": "<complete target tri-view prompt>"
    }
  ]
}
```

The target array must use the exact manifest order and ids. Prompts must be
self-contained. State the conflict rule explicitly: whitebox wins every spatial
conflict; the user reference wins every appearance conflict. The opening prompt
must explicitly name the protected movement medium, describe its visible
near/middle/far envelope from the whitebox image, and forbid any new visual mass
from entering it. Generic wording such as “preserve the layout” is insufficient.

## Generation and review

1. Generate the styled opening first.
2. Inspect it side by side with the actual whitebox opening. Reject it if it
   copied the user's composition, materially moved a whitebox mass, changed the
   protected envelope's left/right boundary or width profile, broke its visible
   continuity, added any obstruction inside it, or visualized an undeclared
   technical helper. Revise only the opening prompt and regenerate once.
3. Use the accepted styled opening as the shared appearance anchor for all
   tri-views. Generate every declared tri-view, parallelizing those independent
   calls when the tool permits.
4. Inspect the outputs for the required panel count, target identity, consistent
   appearance, exact left=Front / center=Right / right=Back order, and absence
   of text or viewport residue. Regenerate a failed image at most once.
5. Leave every accepted PNG at its exact Host-declared output path and finish.

Do not create a second Codex task, delegate work, call an external provider, or
write undeclared files. The Host validates file integrity and manifest closure
after delivery; do not claim those checks yourself.
