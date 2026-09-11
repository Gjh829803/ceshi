# Human scene actions

Choose the required slide, roll, vault/mantle or climb capability from this page's
cards. Each card includes trigger, prerequisites, scene conditions, parameters,
completion and implementation source. Current eligibility comes from world_inspect.

Slide: sprint plus a new crouch key press requests the action. The actor needs
grounded, empty-handed eligibility, the current minimum speed and room to run up.
A low tunnel is optional; its ceiling must have real collision. The exit needs
standing clearance. Under a low ceiling, keep moving until the actor can rise;
verify operation completion and the resulting standing state. Read current values
from the card rather than estimating speed or playing a clip directly.

Jump-driven vault/mantle requires a reachable colliding surface and supported
landing. Wall/ladder climbing requires a declared climbSurface bound to the real
collider with a normal and valid extent. An accepted request alone is not success.

Exact interfaces: creator_get_authoring_schema({topic:'character-actions',
sections:['commands','humanoid']}). A binding example is available through
creator_get_examples({topic:'character-actions'}); supply the reference-authored scene conditions.
For workspace sdk/, read the returned current-source link and inspect eligibility.
