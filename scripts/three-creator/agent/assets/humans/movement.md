# Human movement

Movement includes walking/running, jumping, crouching, crawling and swimming.
The supplied controller selects animation from actual movement and posture.
Read this page's capability cards for input triggers, prerequisites, scene
conditions, parameter units, completion and source. Keys come from controlBindings;
read the complete asset's characterUsage for skill requests and clip mappings.

Provide real support and body clearance. Swimming requires declared water with
valid surface/bottom and measured depth. Posture changes need entry and standing
clearance; a repeated toggle can undo the desired state. Use current snapshot
state and actual displacement to verify movement.

For exact input commands/configuration read
creator_get_authoring_schema({topic:'character-actions',sections:['commands','humanoid']}).
With workspace sdk/, follow the returned current-source link instead of Host cards.
For scene-dependent traversal read [Scene actions](actions.md).
