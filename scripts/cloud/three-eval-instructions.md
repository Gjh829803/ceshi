Build the uploaded reference and creative request into an explorable world using
the selected Three Creator profile. The task ID records either `three-raw` or
`three-sdk`; the MCP environment and examples describe that exact profile.

The frozen reference, intended subject, spatial relationships and gameplay goals
are the creative authority. Old dataset policies demanding only blocks, a centered
rear camera or Native/Babylon authoring are superseded for this experiment. Match
the actual first-frame composition, perspective, subject scale and occlusion.
Use recognizable low-poly geometry and stable object colors; preserve the complete
moving subject and complete landmarks. Keep real elevation, stairs and routes.

Read the environment, authoring schema and examples. Write ordinary index.html
and local JS/TS modules. The raw profile uses normal Three and your own runtime;
the SDK profile offers the thin SDK and its examples. Both have the same reference,
creative request, catalog assets, budget and browser evidence tools. Search assets
by exact identity and inspect their limitations; diagnostic samples are not proof
of faithful subject appearance. Do not install dependencies or change supplied tools.
Read `creator_describe_environment` first. Its `assetPolicy` gives this task's
allowed asset IDs, default humanoid, custom-asset rule and frozen policy hash.
For humanoid leads, select `assetPolicy.defaultHumanoidAssetId` in project.json,
load it through world.assets.load and pass the asset to addCharacter. Use
assets_search/assets_describe for permitted models, motions and limitations;
project.json selects resources but cannot expand the Host's allowed catalog.
Clothing, colors and headwear may customize the preset's visual children while
retaining its rig and SDK animation owner. Other characters remain available when
the reference or task needs them; prefer proven motions for a custom humanoid.
For supported traversal, swimming or object interactions, search the allowed
catalog by the required action and read the `character-actions` schema and example
topic. Asset responses include `characterUsage` with integration and conditions;
use the ordinary default for basic locomotion, and the permitted full kit when
the scene needs contextual movement. The Training
character's full contextual actions use TrainingCharacter. Ordinary locomotion does not
by itself implement those physical abilities. The raw profile can load the catalog
preset model and clips through Three; it cannot import the SDK runtime.
When a water interaction differs from intent, inspect `feedback.water` and the
playtest `feedback.waterTimeline` for measured depth, immersion and existing
decision flags. Use the suggested scene checks to investigate; these diagnostics
are advisory and do not add acceptance requirements or authorize changing SDK rules.
Inspect actual walking and running from the side: forward-facing travel, natural
knee/elbow flexion, foot contact and strides matching movement speed. Verify jump
and landing transitions too; moving limbs alone do not establish correct animation.

For the SDK world, WASD moves the character and the arrow keys rotate the camera;
Shift stays held to run and each new Space press jumps once. Keep the verified
ordinary jump animation continuous, then return to idle/walk/run on landing.
R and tool reset must restore the complete initial world, camera and gameplay
state. Use the SDK's declared extension and control capabilities when required;
do not claim an unsupported movement or geometry behavior merely by naming it.

Compare real world_preview images with the reference: subject size and placement,
camera perspective, landmark silhouettes and spatial depth. Correct major visual
or structural mismatches before the final recording; compilation and a technical
passed flag alone do not establish task completion.
Use short real keyboard episodes and world_inspect to check movement, held running,
jumping, first-input camera continuity, wall occlusion/recovery and reset. Verify
distinct connected areas beyond the opening, supporting five minutes of meaningful
exploration. Repeated laps, targets already reached at spawn and oversized target
tolerances do not prove exploration. Repair observed failures and retest the same
world. After the final world-source change, request an opening preview and inspect
the returned image. An episode-only edit does not invalidate that world image.
Then record a full 180–300-second
episode with at least 180 seconds of active play and complete object three-views
before world_submit. Paused, loading and reset time cannot count as active play.
Long operations return
operation IDs: poll the same operation through operations_get; do not launch duplicates.

External acceptance goals cannot be weakened by deleting waypoints, replacing
stairs with nonphysical decorations, or detaching the required moving subject's
parts. Preserve those goals while fixing the world. Before submitting, compare
the evidence with the reference and user goals yourself; report unsupported,
unverified or failed goals explicitly.

Run world_playtest and world_submit in the same MCP service session. Do not write
delivery files, traces, receipts or tool reports manually. Submit using world_submit,
poll until it succeeds, and leave creator-result.json and creator-delivery.tar.gz
unchanged. Keep the original reference and failed attempts; do not replace this
case with an easier one.
