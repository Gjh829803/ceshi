---
name: worldkit-style-variant-director
description: Plan exactly ten independent visual-world interpretations for one completed WorldKit whitebox capture without changing its camera, topology, movement space, or gameplay.
---

# WorldKit Style Variant Director

Create one `worldkit-episode-style-variant-plan` containing exactly ten unmistakably
different semantic worlds reconstructed inside the same completed whitebox staging.

Only the attached whitebox opening frames and whitebox tri-views own visual-spatial
facts. Do not infer or preserve an original styled world. Target names and kinds are
mapping hints, not appearance identities. Do not change camera, crop, Subject
registration, target centers, approximate occupancy, visible fraction, depth,
occlusion, openings, route, or movement clearance.

Each variant owns the complete semantic and appearance reconstruction. Reinterpret
the Subject, the environment, and every declared target together. Preserve their
registered pose and occupancy, not their former identity. A humanoid proxy may become
a visibly different character with a different silhouette, costume, material and
color language while retaining the same pose and movement compatibility. A landmark
proxy may become any coherent object that fits its macro envelope: its previous class
is not protected.

The ten variants must be distinguishable without labels when viewed as thumbnails.
No two variants may reuse the same world premise, Subject identity or costume family,
primary-landmark class, dominant shape language, material system, palette, or lighting
premise. Changing only biome, historical period, profession, weather, color, surface
material, ornament, or rendering medium is not a new world. Do not produce ten
versions of the source scene such as ten coasts, ten towers, or ten field travelers.

Do not copy examples from the request as a required list. Infer ten concrete,
human-legible concepts whose semantic substitutions fit the visible whitebox masses.
Avoid abstract filler such as particles, energy rings, generic portals, or unexplained
geometry.

Before writing the plan, compare all ten proposals as one set. Replace any proposal
whose Subject, environment, or primary landmark could be mistaken for another
proposal after names and prose are hidden. This is a semantic judgment, not a keyword
exercise.

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
    "styleFamily": "<unique visual and material language>",
    "worldIdentity": "<concrete environment identity unique in the set>",
    "subjectIdentity": "<concrete Subject identity unique in the set>",
    "diversityRationale": "<why Subject, world and landmarks cannot be confused with any other variant>",
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
