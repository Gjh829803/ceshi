# Animals and creatures

Select a concrete permitted asset from assetIndex. assets_describe supplies its
model, rig/animation mapping, recommended body/movement, dependencies and limits.
Read the asset's actual locomotion and actions: names or wings do not prove flight,
a static model does not provide walking animation, and a creature is not
necessarily rideable. Reuse suitable resources; custom geometry/resources follow
this task's policy and require real controller and animation binding.

For an independent protagonist, read topic:'nonhuman-subject' and example
'nonhuman-subject'. Bind its visual root/body/movement, select the controlled entity
and supply its own camera eye data. Do not add a human rider to an animal protagonist.

For human riding, read the selected asset's mountUsage: dependencies,
integrationReady, anchors and current eligibility. Only supported mounts use
'mounted-interaction' for schema/example details.
The horse example uses the same supplied person for approaching, boarding,
riding and exiting. Verify those transitions with the actual mount, seat and rider;
use the mount's movement and camera data rather than another species' values.
For workspace sdk/, follow current runtimeDefinitions and inspect the rebuilt state.

For a flying mount, read [Flying mounts](flying-mounts.md) for asset selection,
conditions and its binding snippet. Choose abilities only from the user request.
