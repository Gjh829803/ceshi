Build the uploaded reference and creative request into an explorable world using
the selected Three Creator profile. The task ID records either `three-raw` or
`three-sdk`; the MCP environment and examples describe that exact profile.

The uploaded reference, intended subject, spatial relationships and gameplay goals
are the creative authority. A reusable, relatively simple colored whitebox is
sufficient: you may omit small decoration, fine textures and intricate details.
Use stable, distinguishable colors for major objects. The first-frame viewpoint and composition must match the reference exactly. Match
the reference's viewpoint, perspective/FOV, camera position/orientation, horizon, subject placement
and apparent scale, landmark silhouettes and occlusion. Do not substitute a generic
centered rear camera when the reference uses a different composition. Simplify
geometry without changing the image's main spatial arrangement.

Before implementing the world, use the built-in System Image Gen tool ($image)
to create an overall orthographic top-down world plan. Save the actual generated image as
planning/world-plan.png and describe the intended spaces/connections briefly in
planning/world-plan.md. Mark the opening camera position/direction and the part
visible in the reference, then plan the surrounding unseen world. Include meaningful
routes, connected areas, branches/loops where suitable, elevation transitions and
places to discover. The generated plan guides layout; the original uploaded image
remains the authority for the opening camera and composition. Use the plan to guide
the same world's implementation and revise it when topology changes materially. A Three screenshot or a diagram drawn
in code is not a substitute for this ImageGen planning step.

The connected traversable world must support MORE THAN five minutes of meaningful
exploration at the normal authored movement speed. This is a content and layout
requirement, not a minimum execution or recording time. Do not satisfy it by slowing
the player, repeating the same small circuit, adding an empty oversized plane or
blocking progress. Especially for enclosed references, build connected spaces
beyond the first-frame room/corridor: additional chambers, passages, levels or
other coherent areas appropriate to the request. Preserve the opening shot while
extending the world outside that view. The plan may simplify detail, but intended
connections and height transitions must be physically traversable.

Read the environment, authoring schema and examples. Write ordinary index.html
and local JS/TS modules. The raw profile uses normal Three and your own runtime;
the SDK profile offers the thin SDK and its examples. Both have the same reference,
creative request, catalog assets, budget and browser evidence tools. Use catalog
assets or author custom geometry as appropriate; G-bot is optional and has no
mandatory preference. Search assets by identity and inspect their limitations;
diagnostic samples are not proof of faithful subject appearance. Do not install dependencies or change supplied tools.

For the SDK world, WASD moves the character and the arrow keys rotate the camera;
after composing the reference camera, `world.setCameraFollow()` can inherit that
exact view for play. Explicit orbit settings remain available for a different
gameplay view. The SDK owns continuous handoff, collision recovery and subject
framing; use its controls before adding a custom camera writer.
Shift stays held to run and each new Space press jumps once. Keep the verified
ordinary jump animation continuous, then return to idle/walk/run on landing.
R and tool reset must restore the complete initial world, camera and gameplay
state. Use the SDK's declared extension and control capabilities when required;
do not claim an unsupported movement or geometry behavior merely by naming it.

Use world_preview to see real browser images and world_inspect for diagnostics.
Opening resets to the reference camera; current preserves the current page. Use
world_preview with view=current and input to hold keys briefly, click, drag or
scroll, then inspect the returned screenshot, camera keyframes and state. Camera
diagnostics describe actual short interactions and are informational. Choose your own checks
and exploration; fix issues you observe. After the final source change, inspect
an opening preview and capture complete object three-views before world_submit.
There is no required episode file, recorded self-test, video or minimum test duration.
The exploration requirement describes world content, not recording length.
Operations return IDs: poll the same ID through operations_get, without duplicates.

Preserve requested routes, real height transitions and the complete moving subject
while fixing the world. Report unsupported behavior and observed failures truthfully.
Submit the playable directly when it is ready. There is no Host or human review
stage and no approval to wait for.

Run world_preview and world_submit in the same MCP service session. Do not write
delivery files, traces, receipts or tool reports manually. Submit using world_submit,
poll until it succeeds, and leave creator-result.json and creator-delivery.tar.gz
unchanged. Keep the original reference and failed attempts; do not replace this
case with an easier one.
