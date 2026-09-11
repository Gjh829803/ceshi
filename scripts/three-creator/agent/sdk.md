# SDK index

Choose the object you need to build, then read its abilities and binding details.
These are the two SDK entry branches:

| Branch | Contains | Next |
| --- | --- | --- |
| Basic capabilities | World/lifecycle, physics, inputs, camera, state and runtime extensions | [Basics](sdk/basics.md) |
| Assets and subjects | Humans, animals/creatures, vehicles and scene objects, with their own models, movement, actions and integration | [Assets](assets/README.md) |

The selected profile is reported by `creator_describe_environment`. In three-sdk,
`createHumanoidWorld` loads the human kit; `createWorld` binds independent actors.
In three-raw, supply movement, physics and the observer yourself.

Use the returned navigation entries to read a document through
`creator_get_authoring_schema({document:'assets/humans/README.md'})`.
Documents explain when to use a capability and link to its current interface
through a topic/section query. Read only the selected branch. Workspace `sdk/`
declarations and observed state take precedence over Host example values.
For preview, playtest and delivery read [Programming and checks](programming.md).
