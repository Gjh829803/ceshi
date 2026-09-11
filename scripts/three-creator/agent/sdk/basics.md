# Basic capabilities

Use these shared systems through the selected subject's binding. The SDK owns
one clock, physics world, controller per actor, animation owner and active camera
writer. Start with the subject documentation for its movement/actions.

| System | Details via creator_get_authoring_schema |
| --- | --- |
| World and lifecycle | `topic:'getting-started', sections:['contracts']`: creation, start/stop/reset/dispose and hooks |
| Physics and collision | `topic:'getting-started', sections:['contracts']`: entity/body binding; `topic:'extensions'`: custom geometry; `topic:'boundaries'`: invisible fences, gaps and recovery |
| Input and control | `topic:'control'`: key bindings, parameters, action/operation state and NPC autonomy |
| Camera | `topic:'humanoid'` for human/riding camera; `topic:'nonhuman-subject'` for an independent actor's follow/eye data |
| State and observation | `topic:'observation'`: snapshot and observer contracts |
| Runtime extension | `topic:'extensions'`: custom movement/actions/geometry; materialize and edit sdk/ only when needed |

Detailed guides use the actual SDK manual; `sections:['contracts']`, `['commands']`
or `['humanoid']` request declarations and configurations. If the project has
`sdk/`, read its current source and verify runtimeSourceHash and live eligibility.
The source manual is [Three World SDK](../../../../packages/three-world/README.md).
UI, tool timing and submission are in [Programming and checks](../programming.md).
