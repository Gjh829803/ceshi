---
name: worldkit-style-variant-director
description: Plan exactly ten independent visual-world interpretations for one completed WorldKit whitebox capture without changing its camera, topology, movement space, or gameplay.
---

# WorldKit Style Variant Director

Create one `worldkit-episode-style-variant-plan` containing exactly ten genuinely
different appearance interpretations of the same completed whitebox world.

The whitebox opening, Segment first frames, tri-views, Scene Brief, and visual target
manifest own spatial facts. Do not change camera, crop, Subject registration, target
centers, approximate occupancy, visible fraction, depth, occlusion, openings, route,
or movement clearance.

Each variant owns appearance and semantic reconstruction. A registered landmark may
become a radically different coherent concept when it remains inside the same macro
occupancy envelope and preserves apparent proximity and crop. Do not merely change
palette, weather, rendering medium, or adjectives. Vary the world premise, landmark
identity, shape language, materials, atmosphere, and lighting together.

Do not copy examples from the request as a required list. Infer ten scene-specific,
human-legible concepts. Avoid abstract filler such as particles, energy rings, generic
portals, or unexplained geometry.

For every variant write a standalone `visualPrompt` and standalone
`geminiEventPrompt`. The Gemini prompt must describe what kinds of large, coherent,
style-native visual transformations are appropriate, while preserving the whitebox
video's motion, camera, space, and timing. It must not depend on another variant.

For every declared complete visual target include one `targetInterpretation` with its
exact `visualTargetId` and a concrete final identity. Preserve target order.

Write only the Host-declared plan JSON. Do not generate images or video.

Before finishing, run the bundled checker against the attached
`style-variant-plan-input.json` and the declared output path:

```bash
node .codex/skills/worldkit-style-variant-director/scripts/self-check.mjs \
  --input style-variant-plan-input.json \
  --plan artifacts/episodes/<episode-id>/style-variants/style-variant-plan.json
```

If it reports diagnostics, repair the same plan and rerun it. Use at most three
self-repair cycles and finish only after it returns `"ok": true`. In particular,
do not omit a secondary target from early variants when the input declares more
than one target. The trusted Host replays the same contract independently.

Use this exact shape and preserve Host input order:

```json
{
  "kind": "worldkit-episode-style-variant-plan",
  "schemaVersion": 1,
  "sceneId": "<scene-id>",
  "episodeId": "<episode-id>",
  "sourceWhiteboxIdentity": "<copy the complete Host object>",
  "variants": [{
    "id": "style-00",
    "name": "<human-readable name>",
    "concept": "<complete world premise>",
    "visualPrompt": "<standalone appearance prompt>",
    "geminiEventPrompt": "<standalone event-direction prompt>",
    "negativeConstraints": "<variant-specific exclusions plus spatial locks>",
    "targetInterpretations": [{
      "visualTargetId": "<exact Host id>",
      "finalIdentity": "<concrete identity>",
      "appearance": "<complete cross-view appearance>"
    }]
  }]
}
```
