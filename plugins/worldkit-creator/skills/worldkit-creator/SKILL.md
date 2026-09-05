---
name: worldkit-creator
description: Create an experimental playable Native whitebox world from an original image and prompt, reuse admitted subjects and animations, inspect real Babylon/Havok previews, repair actual traversal, and export a playable build with Runtime tri-views.
---

# WorldKit Creator

You own the current scene workspace. Produce a faithful, explorable low-poly world using the installed WorldKit tools. The original uploaded image and the user's requested changes define the result. Planning images are optional; do not invent a new mandatory planning stage.

1. Call `creator_describe_environment`, then `creator_get_authoring_schema`. Query reusable subjects with `assets_search` and `assets_describe`. Use only a resource's actual supported actions; a swimming animation does not provide swimming movement.
2. Write `scene.ts` and `scene.json` using the returned contracts. Use normal Babylon MeshBuilder/VertexData and local TypeScript helpers. Environment geometry is authored once in `scene.ts`; register actual visible collision meshes using `registerEntity` from `@worldkit/creator`. The Host registers spawn from `scene.json`. Do not register another spawn.
3. Match the original image's main geometry, viewpoint, landmark position, silhouette, relative scale and occlusion. Match the user's subject body type; never replace an animal with a human to pass. A `custom-rigid` subject may use the published primitive-part contract. Keep collision-support parts on the local y=0 plane and decorative tails/ears outside the collision contribution where appropriate.
4. Build a connected, usable exploration area with real elevation and depth. Use slopes or small real steps, not hidden walkable ramps disconnected from visible surfaces. Declare intermediate exploration waypoints wherever a path turns; the test controller moves directly between them. Include at least three destinations, 30m travel extent and 15 distinct 5m cells. These are minimum smoke coverage, not a guarantee of fun.
5. Call `world_preview`, poll its operation with `operations_get`, and inspect the actual image. Compare it directly with the uploaded reference. Inspect top-down and relevant entity tri-views. Repair the same source and repeat. A successful compile is not a successful Runtime or visual result.
6. Use a short `world_playtest` while debugging. Read its trajectory/target/position diagnostics and keyframes. Repair blocked ground, incorrect camera or wrong scale. Complete a passing 180-second or longer playtest on the final source. Do not teleport/reset to fake traversal, remove unreachable intended destinations or merely run in place.
7. Capture final Runtime tri-views and call `world_submit`. This seals `creator-result.json` and `creator-delivery.tar.gz`. The tool checks that the final source matches its exploration evidence. Deliver only after this succeeds. Do not fabricate a receipt, replace a screenshot with image generation, or write the delivery manifest by hand.

Long tools return operation IDs. Poll existing work rather than starting duplicates. If a source changes, old evidence is invalid. Inspect PNGs returned through MCP or the image viewer; filenames alone are not inspection. Tool-generated MP4s are actual low-cadence evaluation videos, not evidence of production frame rate.

World code must not create its own Engine, Scene, main Camera, input/render loop, physics controller, network I/O, timers or process access. SDK owns motion, collision, animation, camera and tick. Do not edit SDK, tool code, asset bytes, input images or Host evidence.

This lane is an explicitly experimental real SDK creation/capture/playability slice. Formal Native WorldPackage publication, live NPC hot editing and the realtime video provider are not implemented here. Report an actual capability gap or failed gate clearly; do not claim these capabilities or silently fall back to an older model.
