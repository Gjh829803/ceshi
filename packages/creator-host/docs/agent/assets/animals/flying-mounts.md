# Flying mounts

Use this page when the requested subject is a supplied flying mount with a human
rider. Select one permitted asset from assetIndex and call assets_describe. Its
requiredAssetIds include the chosen creature and the supplied human; put both in
project.json. For an independent creature protagonist, read the parent animal page.

## Bind the selected asset

Read vehicle.spec, integrationMetadata.visual and resources from that asset.
Resolve logical resource paths against its packaged resources. Keep model,
animation prefix, seat, core collision and ground calibration from the same asset.
Use creator_get_examples({topic:'mounted-interaction',variant:'flying-creature'})
for the [minimal binding](flying-mounts.ts). Supply your chosen instance, reference-
authored placement and resource resolver. Include the result in createHumanoidWorld's
vehicles. The world owns the visual/controller after transfer; use the same human
for walking and riding and the shared authored-opening camera contract.

## Execute only requested abilities

Read creator_get_authoring_schema({topic:'mounted-interaction',sections:['humanoid','commands']})
for current interfaces, and inspect the selected actor's inputGuide and state for
keys, axes, eligibility and outcomes. Summon completes only after real arrival and
stable landing. Boarding needs an available mount, supported ground and clear
approach/seat space; takeoff needs overhead clearance. Land and dismount only after
support and exit checks succeed. Grounded, transition and flight states differ;
accepted input alone does not prove completion.

| Default input | Condition and resulting transition |
| --- | --- |
| H: summon | Unmounted human standing on dry ground, available unoccupied creature and a safe arrival/landing area; wait for arrival and grounded state |
| F: board | Human near a grounded creature; actor, approach, ladder and seat must be available and clear; wait for the boarding transition |
| F: land / dismount | In flight requests landing on sufficiently wide flat dry support; once grounded, another F requests dismount through a clear exit |
| Space: takeoff / glide | On stable ground requires clear overhead space; airborne uses glide behavior |

These are default bindings. Read getKeyBindings for overrides and the current
actor inputGuide for flight axes. Inspect vehicleDynamics[].flyingCreature.groundPhase,
summon state, mountedInstanceId and transition; do not infer these from animation.

Current assets support stationary ground rest, not ground walking. Core collision
does not include every wing/tail tip. Flame is visual feedback, not damage. Read the
selected asset's limitations and current runtime conditions before changing behavior.
For deeper changes use the referenced SDK motion-families/flying-creature source,
then rebuild and verify the resulting state and pixels through the programming guide.
