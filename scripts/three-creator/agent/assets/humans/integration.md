# Human integration

In three-sdk, select the supplied asset in project.json, then use createHumanoidWorld to load its
model/rig/actions into the SDK's shared clock, physics and camera owners.
For Creator whitebox loading, choose `characterLoadOptions:{loadTextures:false}`
on initial creation, or `{loadTextures:false}` when loading a character yourself.
The minimal binding supplies this default; explicit task options can override it.
NPC factories retain the source instance's loading choice.

Choose each important person's color yourself; roles have no fixed palette.
Set `characterColor` (sRGB `#RRGGBB`) in `createHumanoidWorld` for the initial person.
For another person, call `character.setColor(chosenColor)` on the instance returned
by `world.humanoid.createCharacter()` before binding it. `character.color` reads
the choice; `setColor(null)` restores the supplied materials. Factories copy the
color at factory creation, so choose a distinct color for each important counterpart.
Color changes retain the model, rig and animations and do not change camera or input
selection. Reset, riding and captures retain the instance color. The character owns
the coloring materials and releases them on disposal.
Read `topic:'humanoid', sections:['contracts']` for current color declarations.

creator_get_examples({topic:'getting-started'}) supplies the minimal binding;
creator_get_authoring_schema({topic:'humanoid',sections:['contracts','humanoid']})
returns current factory, environment and configuration declarations.

Use the current controlBindings for keys. Compose the opening and enable authored
follow as described in [Programming and checks](../../programming.md). Human facing
defaults to back toward the opening camera; factory characterFacingYawRadians can
override it. View settings and eye/seat data belong to the actual subject.

For a full NPC, use `world.humanoid.createCharacter()` and bind the returned rig
with `world.addCharacter({id,humanoid})`. Each actor owns its controller and mixer;
all share world physics, targets and clock. Select input with setControlledEntity;
select the camera target independently with setCameraFollow. Use actorId for
a specific human action/input. Read topic:'control' for autonomy and verify natural
movement and collision.
For boarding, seats and rider attachment follow the selected
[animal](../animals/README.md) or [vehicle](../vehicles/README.md). Keep the same human
instance; those documents own the detailed riding integration.

In three-raw, load the permitted model and clips with Three and implement the
controller, physics, attachment and observer yourself; SDK commands are unavailable.
