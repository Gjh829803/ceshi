# GPT-6 Creator cloud experiment

This experiment uses `codex/gpt6-world-agent-refactor`, inherited source snapshot
`50a1e14a`, and `gpt-6-astra / xhigh`. It exercises a new, explicitly experimental
Native Creator path. Existing production Block and Native admission paths are
not silently changed.

## Play the submitted worlds

The read-only experiment gallery is available on the existing evaluation host:

[GPT-6 playable evaluation gallery](http://k8s-lwdp-worldkit-1b0222fb6d-f0f26ee23663e783.elb.us-east-2.amazonaws.com/creator-evals/).

It shows each original reference beside the delivered opening, an interactive
standalone build, recorded exploration and object tri-views. Scores and notes
are stored in that browser and can be exported as JSON; they are not submitted
to a shared evaluation database. Pending cases do not expose a playable link.
Delivered cases with independently confirmed content/physics problems remain
available with an explicit **可试玩 · 有问题** label. Availability is not a
quality-pass claim.

The deployed V3 runtime is immutable. Its model configuration remains
`gpt-6-astra / xhigh`; later local SDK fixes are not retroactively applied to
the five original cloud outputs. See the [deployment record and rollback](../../../deploy/creator-evaluation/README.md)
for the isolated gateway, HTTP compatibility transformations, and preservation
of the original archive/file hashes.

## Fixed sample

The five original images and their original/effective prompts are frozen in
`.codex-tmp/gpt6-five-case-eval/selected-cases.json`, with per-file SHA-256 values.
They were selected before generation and are not replaced after a failure.

| Case | Main stress |
| --- | --- |
| `gpt6-eval-coast-lighthouse` | Shoreline, cliff mass, elevation and lighthouse |
| `gpt6-eval-forest-lookout` | Thin structural supports, stairs, trees and distant terrain |
| `gpt6-eval-paper-moon-palace` | Bridges, layered architecture, silhouette and deep composition |
| `gpt6-eval-rice-terraces` | Curved connected terrain and repeated elevation changes |
| `gpt6-eval-nine-tailed-fox` | Non-human subject, large asymmetric silhouette and circular landscape |

The old test-set instructions remain recorded verbatim. Effective instructions
explicitly replace the inherited block-only and centered-rear requirements with
the user's new Native Creator policy, while preserving the creative request.
Historical scenes are comparison material, not input code for the new model.

## Executed chain and evidence

1. A per-request LWDP launcher starts the pinned Linux Codex binary with the
   requested model/effort and a required WorldKit MCP server. Runtime and browser
   capsules are prepared before model execution; model code cannot install or
   replace the SDK. The launcher and MCP use explicit environment allowlists.
2. The model sees the original image, the effective prompt, exact authoring
   schema, and searchable reusable subjects/actions. It writes ordinary Native
   geometry and configuration, then receives real Babylon/Havok image feedback.
3. Model source is compiled into a standalone playable build. SDK owns movement,
   physics, animation, camera and tick. Preview image responses are recorded in
   the full CLI event stream, rather than inferred from assistant self-report.
4. A real controller follows declared waypoints for at least 180 simulation
   seconds. No teleportation or reset occurs within the episode. The tool saves
   actual rendered frames, video, trajectory and diagnostics. Submission also
   requires three targets, 15 distinct five-meter cells and 30 meters from spawn.
5. Submission binds the current source, compiled files, actual playtest media,
   opening and Runtime tri-views. Only successful operations from the same MCP
   session are accepted. The launcher binds its captured event stream and the
   successful submit receipt to the exact delivered archive bytes.
6. Host review checks returned artifacts and visually compares the original and
   opening, then inspects the playable output and exploration evidence. Report
   pipeline status and visual quality separately, including failed attempts.

## Scope and limits

- This is real cloud creation with a real SDK Runtime, not formal Native
  WorldPackage production publication. Its publication guard remains in place.
- Live world/NPC edit commands and realtime video-model inference are subsequent
  work. This experiment exports the whitebox video, prompt context and tri-views
  needed to inspect that boundary, but does not claim provider integration.
- A waypoint episode is a useful traversal regression, not exhaustive navigation
  proof. Three minutes of simulation and minimum spatial coverage do not by
  themselves demonstrate three minutes of engaging exploration or zero bugs.
- Recording cadence is an evaluation choice, not measured realtime FPS.
- The current experiment uses an SDK orbit camera: initial yaw follows spawn
  facing, with explicit pitch/distance/FOV/target height. Independent cinematic
  opening-camera pose and arbitrary off-center framing are not yet implemented;
  the selected third-person set does not demonstrate those capabilities.
- Five selected cases cannot estimate general success rate or prove improvement
  over GPT-5.6; that requires a controlled comparison with fixed inputs/runtime.

See [the initial cloud probe](cloud-probe/README.md) for the old-CLI failure and
the successful pinned-CLI model probe. Reproduction commands and runtime-lock
fields are documented in `scripts/cloud/creator-eval-README.md`.
