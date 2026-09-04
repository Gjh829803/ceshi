#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "${1:-}" == "--" ]]; then shift; fi

scene_id=""
mode="full"
mode_was_set=false
image_sources=()
prompt_parts=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value after --scene-id." >&2; exit 2; }
      scene_id="$1"
      ;;
    -i|--image)
      shift
      [[ $# -gt 0 ]] || { echo "Missing file after --image." >&2; exit 2; }
      image_sources+=("$1")
      ;;
    --plan-only|--build-only|--resume-host-only)
      [[ "$mode_was_set" == false ]] || { echo "Choose one execution mode." >&2; exit 2; }
      mode_was_set=true
      if [[ "$1" == "--plan-only" ]]; then
        mode="plan"
      elif [[ "$1" == "--build-only" ]]; then
        mode="build"
      else
        mode="host"
      fi
      ;;
    --) ;;
    -*) echo "Unsupported option: $1" >&2; exit 2 ;;
    *) prompt_parts+=("$1") ;;
  esac
  shift
done

if [[ ! "$scene_id" =~ ^[a-z0-9][a-z0-9-]{2,79}$ ]]; then
  echo "--scene-id must be 3-80 lowercase letters, numbers, or hyphens." >&2
  exit 2
fi
if [[ ( "$mode" == "full" || "$mode" == "plan" ) && ${#prompt_parts[@]} -eq 0 ]]; then
  echo 'Usage: pnpm agent:world -- --scene-id <id> [--image <file>] "<world request>"' >&2
  exit 2
fi
if [[ ( "$mode" == "build" || "$mode" == "host" ) && ${#image_sources[@]} -gt 0 ]]; then
  echo "Builder-only and Host-resume modes consume existing staged references." >&2
  exit 2
fi
user_prompt="${prompt_parts[*]:-Implement the existing Scene Brief.}"

if [[ "${WORLDKIT_PROMPT_SMOKE:-0}" == "1" ]]; then
  echo "WORLDKIT_PROMPT_SMOKE_OK planner coding-agent block-build runtime-capture visual-reconstruction"
  exit 0
fi

pnpm_bin="$(command -v pnpm)"
node_bin="$(command -v node)"
artifact_root="$project_root/artifacts/scenes/$scene_id"
public_plan_root="$project_root/apps/playground/public/scene-plans/$scene_id"
temporary_root="$project_root/.codex-tmp"
mkdir -p "$artifact_root" "$public_plan_root" "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/spatial-agent.XXXXXX")"
cleanup() {
  case "$task_tmp" in "$temporary_root"/spatial-agent.*) /bin/rm -rf -- "$task_tmp" ;; esac
}
trap cleanup EXIT
mkdir -p "$task_tmp/input" "$task_tmp/runtime"
unset LWDP_GENERATION_API_TOKEN LWDP_API_BASE LWDP_USER_ID
export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
[[ -s "$WORLDKIT_LWDP_ENV_FILE" && ! -L "$WORLDKIT_LWDP_ENV_FILE" ]] || {
  echo "Project-local LWDP runtime config is missing or unsafe." >&2; exit 3;
}
codex_backend="${WORLDKIT_CODEX_BACKEND:-cloud}"
[[ "$codex_backend" == "cloud" || "$codex_backend" == "local" ]] || {
  echo "WORLDKIT_CODEX_BACKEND must be cloud or local." >&2; exit 2;
}
codex_run_nonce="$(date -u +%Y%m%d-%H%M%S)-$$"
cloud_s3_root="${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}"
codex_output_prefix="${cloud_s3_root%/}/$scene_id/$codex_run_nonce"
reference_asset_args=()
reference_index=0
for source_path in "${image_sources[@]}"; do
  if [[ ! -f "$source_path" || ! -r "$source_path" || -L "$source_path" ]]; then
    echo "Reference must be a readable regular non-symlink file: $source_path" >&2
    exit 2
  fi
  extension="${source_path##*.}"
  case "$extension" in
    png|PNG) extension="png" ;;
    jpg|JPG|jpeg|JPEG) extension="jpg" ;;
    webp|WEBP) extension="webp" ;;
    *) echo "Unsupported reference image format: .$extension" >&2; exit 2 ;;
  esac
  staged_path="$task_tmp/input/reference-$reference_index.$extension"
  public_path="$public_plan_root/reference-$reference_index.$extension"
  /bin/cp -- "$source_path" "$staged_path"
  /bin/chmod 0444 "$staged_path"
  /bin/cp -- "$source_path" "$public_path"
  media_type="image/$extension"
  [[ "$extension" == "jpg" ]] && media_type="image/jpeg"
  reference_asset_args+=(--asset "reference-$reference_index::$staged_path::image::$media_type")
  reference_index=$((reference_index + 1))
done
if [[ "$mode" == "build" ]]; then
  shopt -s nullglob
  for public_reference in "$public_plan_root"/reference-*.{png,jpg,webp}; do
    extension="${public_reference##*.}"
    media_type="image/$extension"
    [[ "$extension" == "jpg" ]] && media_type="image/jpeg"
    reference_id="$(basename "$public_reference" ".$extension")"
    reference_asset_args+=(--asset "$reference_id::$public_reference::image::$media_type")
  done
  shopt -u nullglob
fi

run_codex() {
  /usr/bin/env -u WORLDKIT_CAPTURE_SIGNING_PRIVATE_KEY_PATH \
    "$node_bin" scripts/agents/run-codex-task.mjs --backend "$codex_backend" --repo-root "$project_root" "$@" --execution-profile formal
}

planner_prompt="$user_prompt

You are the unified WorldKit Planner for world '$scene_id'. In this one Codex task, create exactly three declared outputs: artifacts/scenes/$scene_id/scene-brief.md, apps/playground/public/scene-plans/$scene_id/entry-whitebox-target.png, and apps/playground/public/scene-plans/$scene_id/world-plan.png. Write the Brief first. Then use Codex's built-in image generation tool to generate and inspect the 16:9 entry target first. Only after that exact file is correct, generate the top-down plan with the uploaded references, the completed Brief, and the exact saved entry target all supplied as inputs. The top-down is a projection and completion of the entry space, never an independent redesign. If the entry target changes, regenerate the top-down from it. Do not delegate to another Image Planner or external API. Do not create JSON, coordinates, dimensions, geometry, route graphs, or AuthoringSpec.

Use .codex/skills/worldkit-spatial-planner/SKILL.md as the hosted preview-planning guide and read both of its references. Keep user facts, visible reference evidence, inferred continuation, and render-only ideas in the four separate provenance sections required by current main. Name one or more standard or custom movement modes as separate bullets; the first is the startup/default mode and later rows are real alternate modes of the same controlled Subject. Describe the complete controlled shape and movement behavior only in plain language: Planner does not select Subject Definitions, Subject Assets, Runtime Bundles, rigs, clips, colliders, or motion resources. Treat the opening frame only as a small entry slice. Plan exactly one continuous geographic world: no multiple scenes, panels, portals, teleports, or hidden destination spaces. The complete top-down explorable footprint must cover at least four times the geographic area visible in the uploaded reference, normally about twice its visible width and twice its visible depth. Add a middle area, meaningful side and rear areas outside the uploaded camera view, and at least one remote area/destination that conservatively continues visible geography; empty padding does not count. Plan three-dimensional form, not only screen layout: infer each major terrain, staircase, bridge, platform, and building through footprint, longitudinal elevation, cross-section, thickness, vertical endpoints, and over/under relationships. State visible lower/higher levels and where each ascent begins and ends in Brief prose. A staircase must physically rise or fall to its reference destination; a flat route with decorative cross-bands, a camera-facing mountain slab, or a facade-only building is invalid. Define 1-5 visual targets as whole targets beginning with the complete controlled subject; never pad or split targets. Important non-controlled people, animals, creatures, vehicles, machines, sculptures, and distinctive props must also become complete visual targets when their identity materially defines the reference; use one repeated target for intentionally identical important instances, and never omit such an object merely because it is organic, movable, or smaller than architecture. Generate both PNGs as discrete-cube block-whitebox renders using the exact functional and ordered target colors from references/block-whitebox-images.md. The top-down image must preserve every visible spatial relationship from the entry target and show the complete four-times-area continuous block world, all off-camera continuation, ground-motion support, collision, interaction, water/cloud semantics actually present, and every complete selected visual target. Mark only actual ground-motion support as traversable. Flight, swimming, water-surface, and custom free-space domains receive no path or navigable-area overlay; water remains blue only as medium. Require connected ground only when every declared mode is ground-based. Top-down must retain stacked block relief and the same elevation hierarchy without labels or contour overlays. It contains only one small red spawn-position token made from a few cube tops—never a humanoid, animal, rider, vehicle, equipment, pose, facing arrow, or camera cone—and no annotation. This restriction applies to the red controlled-Subject spawn token, not to separately selected non-subject important-object targets in their own ordered colors. The 16:9 entry target is non-authoritative composition intent using the same colored-block vocabulary and is the only Planner image with the complete red controlled Subject. That Subject, its main body/pilot, and visual mass center are exactly on the 50% image-width vertical centerline. Near-center, any slight left/right bias, diagonal rear, three-quarter rear, shoulder, or side composition is invalid. Use the same bright neutral clear daytime inspection lighting for every case; no styled materials, realistic textures, labels, in-image legend, UI, or watermark.

Before finishing, run this bundled self-check from the extracted workspace:
node .codex/skills/worldkit-spatial-planner/scripts/self-check.mjs --scene-id '$scene_id' --brief artifacts/scenes/$scene_id/scene-brief.md --world-plan apps/playground/public/scene-plans/$scene_id/world-plan.png --entry apps/playground/public/scene-plans/$scene_id/entry-whitebox-target.png --report artifacts/scenes/$scene_id/planner-self-check.json
If it exits nonzero, read its JSON diagnostics, repair the three Planner outputs inside this same task, and run it again. Use at most three self-repair cycles. Finish only when planner-self-check.json has status 'passed'. The trusted Host only replays the same check once after delivery; it does not start a separate Repair Agent."

builder_prompt="You are the WorldKit Block Builder for '$scene_id'. Read artifacts/scenes/$scene_id/scene-brief.md, artifacts/scenes/$scene_id/visual-identity-palette.json, and the two planner images. Create exactly one authored world module at artifacts/scenes/$scene_id/world.mjs. Do not author or repair any JSON world, implementation map, execution plan, resource budget, route graph, or runtime artifact.

Use .codex/skills/worldkit-block-builder/SKILL.md and all three required references, including the Host-generated agent-authoring-catalog.json, as the complete Builder guide. Both Planner PNGs are semantic block-whitebox inputs using the exact immutable preset colors. Use the uploaded reference for visible meaning/geography and three-dimensional evidence, the entry image for opening composition/occlusion/visible silhouettes and elevation cues, and the top-down overview for hidden layout/traversal/space connections and footprint. They are one causal plan; if they conflict, stop with a clear diagnostic instead of inventing another layout. The Three.js module remains the only geometry authority. One full block is exactly one meter and a normal adult human is about 1.8 meters tall. Build the full explorable world by directly creating only the four admitted undeformed BoxGeometry shapes: full [1,1,1], half [1,0.5,1], exact quarter-volume [0.5,0.5,1], and small [0.5,0.5,0.5]. Keep faces on the 0.5-meter micro-grid, centers on 0.25-meter increments, Mesh scale [1,1,1], and bind only immutable WorldKit preset refs. You may write ordinary loops and a one-block placement helper; no second semantic construction surface is available. Three-dimensional fidelity is a required outcome: resolve major terrain and structures as a consistent footprint, longitudinal profile, cross-section, thickness, and elevation hierarchy. Matching the opening view with thin walls, flat scenery strips, facade-only buildings, or oversized level platforms is invalid. Every visible staircase must connect its real lower and upper levels with reference-consistent course, rise, width, major landings, side drops/enclosures, and support mass; shaded bands on a flat road do not count.

Build exactly one continuous geographic world whose top-down explorable footprint covers at least four times the reference-visible area, normally about twice its visible width and twice its visible depth. Do not split it into scenes, panels, portals, teleports, or hidden spaces, and do not use empty padding to satisfy area. Read every movement bullet; the first is the startup/default mode and later rows are alternate modes of the same Subject. Set requireSingleReachableComponent=true only when every declared mode is ground-based. If any mode is flight, underwater, water-surface, or custom free-space movement, set it to false: disconnected ground islands are allowed because the ground graph is not the Subject's complete reachability authority. For an all-ground world, declare real 'middle' and 'remote' requiredTargets plus an invisible requiredGroundTraversalBand from spawn through the intended entry movement area to the middle target. The band validates existing ground inside its honest usable width and never creates or draws a route. Add validation bands for any Brief-required bridge, stair course, corridor, narrow saddle, or other direct connector. Never run a private reachability pass that relabels unreachable intended ground as obstacle or empty space; repair the terrain instead. Adjacent walkable tops may differ by at most two meters; differences up to one meter are Host-smoothed, while larger connected transitions require intermediate half/full supports. Create a dedicated narrow ground path only when the Brief or reference explicitly contains a restricted route, corridor, bridge, or passage. Build every named entry, middle, side/rear, and remote region at reference-consistent scale. Reproduce terrain at macro silhouette, ridge/valley/shoreline/ledge, complete-landmark/important-object, and exposed-detail scales. Full blocks own mass, half blocks own transitions, and quarter/small blocks own visible rock, foliage, eave, rail and contour detail; do not waste small blocks as hidden fill. Do not place air-wall blocks or perimeter obstacles for fall prevention: the SDK automatically derives invisible ground-only boundaries from exposed walkable edges and excludes true water/air motion. Put the Subject on a checked meter stand position with clearance. Choose the closest complete registered Subject Pack for the requested body topology, or use a custom rigid Mesh base only when no pack is suitable. Select one compatible Motion Pack for the complete Subject Assembly. Correct movement and strict centered rear Camera framing are more important than whitebox likeness. Never add shapes for faces, hair, clothing, armor, ordinary handheld or holstered weapons, backpacks, headwear, colors, or materials; later visual generation owns them. A major movement-identifying board, mount, vehicle hull, boat, glider, wing, or flying sword may be a rigid attachment. The base may be any admitted person, animal, vehicle, giant, or custom Mesh; human is not special. Agent-authored shapes never require bones. Declare exactly one Subject Assembly, one strict 16:9 Camera Pack with an explicit Socket/bounds/local-point target, and the Brief's primary Subject target. Use each remaining visual-target-N as one complete visualGroupId across every block of that whole landmark, important non-controlled person/animal/creature/vehicle/object, or repeated set; represent it as one complete proxy at truthful scale and location, never as another controlled Subject, and do not map parts, generic ground, helpers, or decoration. Default functional blocks keep their preset colors. Match target 2/3/4/5 to landmarkOrange/landmarkYellow/landmarkBlue/landmarkPurple respectively; the checker rejects color drift.

Declare exactly one visualTargetFacings row for every non-subject visualGroupId. Use frontYawQuarterTurnsY 0=-Z, 1=-X, 2=+Z, 3=+X and choose the semantic front—animal head, vehicle nose, face, doorway facade, or principal entrance—independently of the opening Camera. The primary Subject already uses controlledSubject.yawQuarterTurnsY and must not be repeated in visualTargetFacings.

The selected reusable base must come from agent-authoring-catalog.json.subjectPacks, and the selected Motion Pack must appear in that row's compatibleMotionPackIds and satisfy every Brief movement mode. Copy that base row's traversalEnvelope into subjectTraversalProfile; it is Host-derived from the real Runtime collider and may not be estimated or shrunk. Test capsules and traversal fixtures are absent from the catalog. Never silently downgrade or visually approximate unavailable motion. Select normal, ice, and mud only through agent-authoring-catalog.json.surfacePacks and their exact walkablePresetRef; each pack owns its fixed visible color and movement feel, and numeric friction overrides are forbidden. Select a catalog Camera Pack and bind it to an exact base Socket, base bounds, assembly bounds, or subject-local point. Standard, over-shoulder, and giant third-person Packs retain Spring Arm hard collision; first-person uses the resolved Socket/point. The formal centered-rear entry workflow normally uses third-person.standard, while the other packs are direct authored choices when the requested shot and downstream review contract call for them.

Before finishing, run the Skill checker:
node .codex/skills/worldkit-block-builder/scripts/self-check.mjs --scene-id '$scene_id' --brief artifacts/scenes/$scene_id/scene-brief.md --world artifacts/scenes/$scene_id/world.mjs --authoring-output artifacts/scenes/$scene_id/authoring.json --map-draft-output artifacts/scenes/$scene_id/implementation-map.draft.json --report artifacts/scenes/$scene_id/builder-self-check.json
If it exits nonzero, read its diagnostics, repair only world.mjs, and rerun. Never edit the derived JSON outputs. After every passing structural check, run:
node .codex/skills/worldkit-block-builder/scripts/render-visual-review.mjs --world artifacts/scenes/$scene_id/world.mjs --world-plan apps/playground/public/scene-plans/$scene_id/world-plan.png --entry apps/playground/public/scene-plans/$scene_id/entry-whitebox-target.png --top-down-output artifacts/scenes/$scene_id/builder-top-down-comparison.png --entry-output artifacts/scenes/$scene_id/builder-entry-comparison.png
Actually open and inspect both PNGs with your image-viewing tool. Planner intent is on the left and the current world.mjs software render is on the right. Check continuous four-times-area geography, spawn, ground-only traversable coloring, landmarks and elevation in the top-down comparison; check strict centered rear framing, depth order, scale, stair/bridge rise, thickness and occlusion in the entry comparison. These are Builder feedback images, not Runtime evidence or an automatic similarity Gate. If either is materially wrong, repair only world.mjs, rerun the structural checker, regenerate both comparisons, and inspect again. Use at most three combined structural/visual repair cycles. Finish only when builder-self-check.json passes and the latest two comparisons have been visually reviewed. The trusted Host replays both scripts and compares exact decoded RGBA pixels; PNG compression bytes are not authority. It does not judge similarity or start a separate Repair Agent."

if [[ "${WORLDKIT_PROMPT_INIT_SMOKE:-0}" == "1" ]]; then
  echo "WORLDKIT_PROMPT_INIT_SMOKE_OK planner_chars=${#planner_prompt} builder_chars=${#builder_prompt}"
  exit 0
fi

if [[ "$mode" == "full" || "$mode" == "plan" ]]; then
  echo "WORLDKIT_STAGE planner"
  planner_log="$task_tmp/planner.log"
  planner_prompt_file="$task_tmp/planner.prompt.txt"
  printf '%s\n' "$planner_prompt" > "$planner_prompt_file"
  planner_task_id="planner-$codex_run_nonce"
  run_codex \
    --task-id "$planner_task_id" \
    --stage planner \
    --job-name "WorldKit Planner · $scene_id" \
    --request-id "$scene_id-planner-$codex_run_nonce" \
    --output-s3-prefix "$codex_output_prefix/planner" \
    --instruction-file "$planner_prompt_file" \
    --context ".codex/skills/worldkit-spatial-planner" \
    "${reference_asset_args[@]}" \
    --output "artifacts/scenes/$scene_id/scene-brief.md::$artifact_root/scene-brief.md::text/markdown" \
    --output "artifacts/scenes/$scene_id/planner-self-check.json::$artifact_root/planner-self-check.json::application/json" \
    --output "apps/playground/public/scene-plans/$scene_id/entry-whitebox-target.png::$public_plan_root/entry-whitebox-target.png::image/png" \
    --output "apps/playground/public/scene-plans/$scene_id/world-plan.png::$public_plan_root/world-plan.png::image/png" \
    2>&1 | /usr/bin/tee "$planner_log"
  "$pnpm_bin" worldkit brief validate "$artifact_root/scene-brief.md" --json
  planner_host_receipt="$task_tmp/planner-self-check.host.json"
  node "$project_root/.codex/skills/worldkit-spatial-planner/scripts/self-check.mjs" \
    --scene-id "$scene_id" \
    --brief "$artifact_root/scene-brief.md" \
    --world-plan "$public_plan_root/world-plan.png" \
    --entry "$public_plan_root/entry-whitebox-target.png" \
    --report "$planner_host_receipt"
  /usr/bin/cmp -s "$planner_host_receipt" "$artifact_root/planner-self-check.json" || {
    echo "Planner self-check receipt does not match trusted Host replay." >&2
    exit 2
  }

  visual_identity_palette="$artifact_root/visual-identity-palette.json"
  "$pnpm_bin" exec tsx scripts/visual/write-visual-identity-palette.ts \
    --scene-id "$scene_id" \
    --brief "$artifact_root/scene-brief.md" \
    --output "$visual_identity_palette"
  [[ -s "$public_plan_root/world-plan.png" && -s "$public_plan_root/entry-whitebox-target.png" ]] || {
    echo "Unified Planner image delivery is incomplete." >&2; exit 5;
  }
  if [[ "$mode" == "plan" ]]; then
    echo "WORLDKIT_STAGE plan-ready"
    exit 0
  fi
fi

if [[ "$mode" == "build" ]]; then
  echo "WORLDKIT_PLANNER_HANDOFF_REPLAY mode=build-only"
  "$pnpm_bin" worldkit brief validate "$artifact_root/scene-brief.md" --json
  planner_resume_receipt="$task_tmp/planner-self-check.build-resume.json"
  node "$project_root/.codex/skills/worldkit-spatial-planner/scripts/self-check.mjs" \
    --scene-id "$scene_id" \
    --brief "$artifact_root/scene-brief.md" \
    --world-plan "$public_plan_root/world-plan.png" \
    --entry "$public_plan_root/entry-whitebox-target.png" \
    --report "$planner_resume_receipt"
  /usr/bin/cmp -s "$planner_resume_receipt" "$artifact_root/planner-self-check.json" || {
    echo "Planner self-check receipt does not match trusted Builder-resume replay." >&2
    exit 2
  }
  palette_resume="$task_tmp/visual-identity-palette.build-resume.json"
  "$pnpm_bin" exec tsx scripts/visual/write-visual-identity-palette.ts \
    --scene-id "$scene_id" \
    --brief "$artifact_root/scene-brief.md" \
    --output "$palette_resume"
  /usr/bin/cmp -s "$palette_resume" "$artifact_root/visual-identity-palette.json" || {
    echo "Visual identity palette does not match trusted Builder-resume replay." >&2
    exit 2
  }
fi

[[ -s "$artifact_root/scene-brief.md" ]] || { echo "Scene Brief is missing." >&2; exit 3; }
[[ -s "$artifact_root/visual-identity-palette.json" ]] || { echo "Visual identity palette is missing." >&2; exit 3; }
[[ -s "$public_plan_root/world-plan.png" && -s "$public_plan_root/entry-whitebox-target.png" ]] || {
  echo "Planner images are missing." >&2; exit 3;
}
if [[ "$mode" != "host" ]]; then
  echo "WORLDKIT_STAGE coding-agent"
  builder_log="$task_tmp/coding-agent.log"
  builder_prompt_file="$task_tmp/block-builder.prompt.txt"
  printf '%s\n' "$builder_prompt" > "$builder_prompt_file"
  builder_task_id="builder-$codex_run_nonce"
  run_codex \
    --task-id "$builder_task_id" \
    --stage coding-agent \
    --job-name "WorldKit Builder · $scene_id" \
    --request-id "$scene_id-builder-$codex_run_nonce" \
    --output-s3-prefix "$codex_output_prefix/block-builder" \
    --instruction-file "$builder_prompt_file" \
    --context ".codex/skills/worldkit-block-builder" \
    --context "artifacts/scenes/$scene_id/scene-brief.md" \
    --context "artifacts/scenes/$scene_id/visual-identity-palette.json" \
    --context "apps/playground/public/scene-plans/$scene_id/entry-whitebox-target.png" \
    --context "apps/playground/public/scene-plans/$scene_id/world-plan.png" \
    "${reference_asset_args[@]}" \
    --asset "entry-whitebox-target::$public_plan_root/entry-whitebox-target.png::image::image/png" \
    --asset "world-plan::$public_plan_root/world-plan.png::image::image/png" \
    --output "artifacts/scenes/$scene_id/world.mjs::$artifact_root/world.mjs::text/javascript" \
    --output "artifacts/scenes/$scene_id/authoring.json::$artifact_root/authoring.json::application/json" \
    --output "artifacts/scenes/$scene_id/implementation-map.draft.json::$artifact_root/implementation-map.draft.json::application/json" \
    --output "artifacts/scenes/$scene_id/builder-self-check.json::$artifact_root/builder-self-check.json::application/json" \
    --output "artifacts/scenes/$scene_id/builder-top-down-comparison.png::$artifact_root/builder-top-down-comparison.png::image/png" \
    --output "artifacts/scenes/$scene_id/builder-entry-comparison.png::$artifact_root/builder-entry-comparison.png::image/png" \
    2>&1 | /usr/bin/tee "$builder_log"
else
  echo "WORLDKIT_HOST_RESUME reuse=planner,builder"
fi

echo "WORLDKIT_STAGE block-build"
builder_host_receipt="$task_tmp/builder-self-check.host.json"
builder_host_authoring="$task_tmp/authoring.host.json"
builder_host_map="$task_tmp/implementation-map.draft.host.json"
"$pnpm_bin" exec tsx scripts/agents/agent-block-builder-self-check.ts \
  --scene-id "$scene_id" \
  --brief "$artifact_root/scene-brief.md" \
  --world "$artifact_root/world.mjs" \
  --authoring-output "$builder_host_authoring" \
  --map-draft-output "$builder_host_map" \
  --report "$builder_host_receipt"
builder_host_top_down="$task_tmp/builder-top-down-comparison.host.png"
builder_host_entry="$task_tmp/builder-entry-comparison.host.png"
"$pnpm_bin" exec tsx scripts/agents/agent-block-builder-visual-review.ts \
  --world "$artifact_root/world.mjs" \
  --world-plan "$public_plan_root/world-plan.png" \
  --entry "$public_plan_root/entry-whitebox-target.png" \
  --top-down-output "$builder_host_top_down" \
  --entry-output "$builder_host_entry"
if [[ "$mode" == "host" ]]; then
  "$pnpm_bin" exec tsx scripts/agents/verify-block-builder-host-resume.ts \
    --scene-id "$scene_id" \
    --brief "$artifact_root/scene-brief.md" \
    --world "$artifact_root/world.mjs" \
    --original-authoring "$artifact_root/authoring.json" \
    --original-map "$artifact_root/implementation-map.draft.json" \
    --original-report "$artifact_root/builder-self-check.json" \
    --replay-authoring "$builder_host_authoring" \
    --replay-map "$builder_host_map" \
    --replay-report "$builder_host_receipt" \
    --output "$artifact_root/builder-host-resume.json"
  /bin/cp -- "$builder_host_receipt" "$artifact_root/builder-self-check.json.host-resume.tmp"
  /bin/cp -- "$builder_host_authoring" "$artifact_root/authoring.json.host-resume.tmp"
  /bin/cp -- "$builder_host_map" "$artifact_root/implementation-map.draft.json.host-resume.tmp"
  /bin/mv -- "$artifact_root/builder-self-check.json.host-resume.tmp" "$artifact_root/builder-self-check.json"
  /bin/mv -- "$artifact_root/authoring.json.host-resume.tmp" "$artifact_root/authoring.json"
  /bin/mv -- "$artifact_root/implementation-map.draft.json.host-resume.tmp" "$artifact_root/implementation-map.draft.json"
  echo "WORLDKIT_HOST_RESUME_REPLAY_OK"
else
  /usr/bin/cmp -s "$builder_host_receipt" "$artifact_root/builder-self-check.json" || {
    echo "Builder self-check receipt does not match trusted Host replay." >&2
    exit 2
  }
  /usr/bin/cmp -s "$builder_host_authoring" "$artifact_root/authoring.json" || {
    echo "Derived Authoring transport does not match trusted Host replay." >&2
    exit 2
  }
  /usr/bin/cmp -s "$builder_host_map" "$artifact_root/implementation-map.draft.json" || {
    echo "Derived implementation map does not match trusted Host replay." >&2
    exit 2
  }
fi
"$pnpm_bin" exec tsx scripts/visual/verify-png-raster-equality.ts \
  --expected "$builder_host_top_down" \
  --actual "$artifact_root/builder-top-down-comparison.png" || {
  echo "Builder top-down visual review does not match trusted Host replay." >&2
  exit 2
}
"$pnpm_bin" exec tsx scripts/visual/verify-png-raster-equality.ts \
  --expected "$builder_host_entry" \
  --actual "$artifact_root/builder-entry-comparison.png" || {
  echo "Builder entry visual review does not match trusted Host replay." >&2
  exit 2
}

run_builder_gates() {
  "$pnpm_bin" exec tsx scripts/scenes/finalize-spatial-build.ts \
    --scene-id "$scene_id" \
    --brief "$artifact_root/scene-brief.md" \
    --world "$artifact_root/authoring.json" \
    --map-draft "$artifact_root/implementation-map.draft.json" \
    --output "$artifact_root/scene-implementation-map.json" &&
  "$pnpm_bin" exec tsx scripts/cli/build-world-artifact.ts \
    "$artifact_root/authoring.json" \
    --output "$artifact_root/world.build.json" --json &&
  echo "WORLDKIT_STAGE runtime-capture" &&
  "$pnpm_bin" worldkit capture "$artifact_root/authoring.json" \
    --output "$artifact_root/opening-frame.png" \
    --snapshot "$artifact_root/runtime-snapshot.json" \
    --receipt "$artifact_root/whitebox-capture-receipt.json" \
    --triview-output "$artifact_root/triviews" \
    --implementation-map "$artifact_root/scene-implementation-map.json" --json &&
  python3 "$project_root/scripts/visual/validate-entry-third-person.py" \
    --image "$artifact_root/opening-frame.png" \
    --snapshot "$artifact_root/runtime-snapshot.json" \
    --output "$artifact_root/entry-third-person-validation.json"
}
run_builder_gates

primary_user_frame=""
for candidate in "$public_plan_root"/reference-0.png "$public_plan_root"/reference-0.jpg "$public_plan_root"/reference-0.webp; do
  if [[ -f "$candidate" ]]; then primary_user_frame="$candidate"; break; fi
done
if [[ -n "$primary_user_frame" ]]; then
  /usr/bin/env -u WORLDKIT_CAPTURE_SIGNING_PRIVATE_KEY_PATH \
    "$project_root/scripts/agents/run-lwdp-visual-reconstruction-agent.sh" \
    --scene-id "$scene_id" --user-frame "$primary_user_frame"
fi

echo "WORLDKIT_STAGE ready"
