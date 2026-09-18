# Task requirements

Build a playable world from the user request and reference image using the selected
Three Creator profile. The reference determines terrain, composition, landmarks,
subjects and counterpart objects. Prioritize opening fidelity: preserve visual
style, main silhouettes, scale, pose, perspective and spatial relationships.
Unless the request specifies otherwise, preserve the reference's initial posture
and riding relationships; free movement does not imply an on-foot opening.

Keep the world predominantly white/off-white and simplify fine detail. Use basic
lighting, restrained distinct colors for the subject, important counterparts and
landmarks, and subtle grayscale/tints to distinguish terrain such as water and
ground. Choose colors yourself from the reference and scene relationships; there is
no fixed role-to-color palette. Distinguish the subject, requested enemies and
different important counterpart objects with different colors; repeated objects
of the same kind may share a color. Color categories do not request new gameplay
or enemies. Keep each object's color consistent in play and captures. Omit extra decoration,
accessories, atmosphere, reflections and elaborate shadows.

Implement gameplay only when explicitly requested; otherwise provide free
exploration. Internal check routes and capture targets are not player missions.
Provide at least 5 minutes of coherent explorable space at normal play speed.
This is spatial capacity: empty-distance padding, slow movement and forced waiting
do not count. Report estimates separately from measured coverage. Recording
length follows coverage; do not impose a five-minute recording.

Use the permitted supplied model, rig and motions for humans, including NPCs and
riders. Keep the same person across movement and riding states. Reuse suitable
supplied creatures; other Mesh/Group subjects may be authored and bound. Vehicles
use authored geometry and actual handling configurations. Read the asset index
for permissions and binding paths.

For newly authored `three-sdk` worlds, deliver the shared [world UI](ui.md)
bundle and producer binding alongside the scene. Include concise hints for the
world's actual controls and relevant state, including free-exploration worlds.
Choose content from the task; do not invent health, scores or quests just to fill a
HUD. If the user explicitly requests no visible UI, use an empty UI layer with the
same binding. Follow [programming](programming.md#world-ui) for the authoring entry.

Finish scene and UI adjustments before the final delivery recording. Inspect the
opening and HUD first; use short real-input checks where needed to resolve uncertain
interactions or route sections, then record a compact complete plan covering the
requested behavior. This adds no fixed test count or recording duration. See
[record and submit](programming.md#record-and-submit) for evidence reuse and identity rules.

Check the final world with real input, state and images:
- UI: use `world_preview({view:"current",includeUi:true})` to inspect the authored UI; clean recordings and three-views do not verify HUD appearance.
- Playability: requested outcomes work, or free exploration works when no gameplay is requested.
- Control feel: responsive starts, turns, stops and actions at suitable speeds.
- Play space: coherent scale, connections and activity space throughout the area.
- Traversability: routes fit the subject; inaccessible areas and accidental edges are physically fenced. Collision proxies and invisible boundaries are not visible scene geometry.
- Motion: coherent physical/action outcomes; existing NPCs move naturally.
- Camera: authored opening pose/FOV survives first input; inspect relevant follow, view changes, subject switches and reset for jumps, clipping and obstruction. When dismounting is supported, hold left/right while walking and check for unintended continuous camera rotation.

Deliver a runnable world with a complete current-source/current-episode real-input
recording, final opening, full playable-area top-down and front/right/back sheets
of the subject, key counterparts and landmarks. Repeated objects use one complete
representative. Check visual/reference quality yourself; technical recording
success is not semantic acceptance or independent review approval. Briefly report
checks, evidence, limitations and estimated exploration capacity.

## Read only what the task needs

First call `creator_describe_environment` for the selected profile and permissions.
Use `creator_get_authoring_schema` with these topics (default sections: `guide`):

| When | Topic | File |
| --- | --- | --- |
| Check task/completion requirements | `quality` | [Task requirements](README.md) |
| Before writing code; when checking or delivering | `programming` | [Programming and checks](programming.md) |
| Choose capabilities and their detailed interfaces | `getting-started` | [SDK index](sdk.md) |
| Choose models, actions or binding resources | `assets` | [Asset index](assets/README.md) |

Read one matching example when binding is unclear. Select deeper SDK topics or
`contracts`, `commands`, `episode`, `humanoid` sections for the missing details.
