#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
if [[ "${1:-}" == "--" ]]; then shift; fi
scene_id=""; episode_id=""; episode_root=""; backend="cloud"; attempt="1"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; scene_id="${1:-}" ;;
    --episode-id) shift; episode_id="${1:-}" ;;
    --episode-root) shift; episode_root="${1:-}" ;;
    --backend) shift; backend="${1:-}" ;;
    --attempt) shift; attempt="${1:-}" ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done
id_pattern='^[a-z0-9][a-z0-9-]{2,79}$'
[[ "$scene_id" =~ $id_pattern && "$episode_id" =~ $id_pattern ]] || exit 2
[[ "$attempt" =~ ^[1-3]$ ]] || { echo "--attempt must be 1-3." >&2; exit 2; }
episode_root="$(cd "$(dirname "$episode_root")" && pwd)/$(basename "$episode_root")"
scene_root="$project_root/artifacts/scenes/$scene_id"
visual_root="$episode_root/visual"
whitebox_root="$episode_root/whitebox"
public_root="$project_root/apps/playground/public/scene-plans/$scene_id"
mkdir -p "$visual_root"
for required in "$whitebox_root/segment-00-first-frame.png" "$whitebox_root/segment-01-first-frame.png" "$whitebox_root/segment-02-first-frame.png" "$whitebox_root/segment-03-first-frame.png" "$whitebox_root/segment-04-first-frame.png" "$whitebox_root/segment-05-first-frame.png" "$scene_root/triviews/whitebox-triview-manifest.json" "$scene_root/scene-brief.md" "$scene_root/visual-generation-prompts.json" "$scene_root/visual-identity-palette.json" "$scene_root/styled-opening-frame.png" "$public_root/reference-0.png"; do
  [[ -f "$required" && -s "$required" && ! -L "$required" ]] || { echo "Missing episode visual input: $required" >&2; exit 3; }
done
unset LWDP_GENERATION_API_TOKEN LWDP_API_BASE LWDP_USER_ID
export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
[[ -s "$WORLDKIT_LWDP_ENV_FILE" && ! -L "$WORLDKIT_LWDP_ENV_FILE" ]] || {
  echo "Project-local LWDP runtime config is missing or unsafe." >&2; exit 3;
}
relative_episode_root="${episode_root#"$project_root"/}"
target_asset_args=(); target_output_args=(); target_table=""; target_count=0
while IFS=$'\t' read -r visual_target_id whitebox_path _ target_kind target_name target_description; do
  [[ -n "$visual_target_id" ]] || continue
  target_count=$((target_count + 1))
  asset_id="whitebox-triview-$target_count"
  target_asset_args+=(--asset "$asset_id::$whitebox_path::image::image/png")
  target_output_args+=(--output "$relative_episode_root/visual/triviews/$visual_target_id/styled-triview.png::$visual_root/triviews/$visual_target_id/styled-triview.png::image/png")
  target_table+="- asset=$asset_id; visualTargetId=$visual_target_id; kind=${target_kind:-unknown}; name=${target_name:-$visual_target_id}; description=${target_description:-none}; output=$relative_episode_root/visual/triviews/$visual_target_id/styled-triview.png"$'\n'
done < <(node scripts/visual/list-visual-triview-inputs.mjs --scene-root "$scene_root" --format tsv --limit 5)
[[ "$target_count" -ge 1 && "$target_count" -le 5 ]] || exit 3
temporary_root="$project_root/.codex-tmp"; mkdir -p "$temporary_root"; task_tmp="$(mktemp -d "$temporary_root/episode-visual.XXXXXX")"
trap 'case "$task_tmp" in "$temporary_root"/episode-visual.*) /bin/rm -rf -- "$task_tmp" ;; esac' EXIT
instruction_file="$task_tmp/instruction.txt"
instruction="Use .codex/skills/worldkit-episode-visual-reconstructor/SKILL.md as the complete guide.

Create six event-free styled opening frames for captures 00 through 05, plus one shared styled tri-view per declared complete target for scene '$scene_id', episode '$episode_id'. Use the built-in image generation tool. Do not create another task or generate video.

Attached roles in order:
1. segment-00-whitebox-first-frame
2. segment-01-whitebox-first-frame
3. segment-02-whitebox-first-frame
4. segment-03-whitebox-first-frame
5. segment-04-whitebox-first-frame
6. segment-05-whitebox-first-frame
7. user-first-frame appearance authority
8. base-styled-opening-frame from the accepted original Visual Reconstructor
9+. complete whitebox tri-view targets

Mandatory inherited context:
- artifacts/scenes/$scene_id/visual-generation-prompts.json is the case-specific base Prompt. Preserve its final identity, materials, continuous-surface reconstruction, lighting, art style, protected movement medium, and helper-removal policy. Adapt only camera-relative measurements and visible near/middle/far envelope descriptions to each Segment whitebox frame.
- artifacts/scenes/$scene_id/visual-identity-palette.json is the final palette authority.
- The accepted base styled opening is appearance evidence, not a Segment layout.
- Remove block seams, voxel facets, staircase contours, semantic boundaries, prototype grids, and incidental step banding. Fit continuous natural contours through each block cluster. The Segment whitebox owns camera, Subject registration, object anchors, approximate bounding envelopes, major topology, openings, movement clearance, depth, and occlusion—but not cube-level silhouette edges, local curvature, corner treatment, or individual block boundaries. The user image and accepted base styled opening own final contour language, curvature, smoothness, materials, and detail. Never instruct ImageGen to preserve every block, every polygon boundary, every repeated ledge, or every silhouette exactly. If the inherited base Prompt contains old pixel-registered wording, preserve its semantic intent only for movement boundaries and macro occupancy; do not copy that wording into Segment prompts.
- Every declared landmark is a semantic/gameplay proxy rather than a final design model. Keep its identity, scene zone, visual prominence, depth layer, projected screen-space occupancy, apparent proximity, visible fraction, frame-edge entry/exit and crop, relation to the Subject and route, and orientation/destination role. Let the user image and accepted base styled opening redesign its component count, silhouette, curvature, thickness, breaks, terminals, local proportions, ornament, and local placement within that locked projection. Never pull the camera back, shrink or recede a landmark, fit a complete object into frame, expose a hidden half, or change how much is cropped. If the whitebox shows only a close partial landmark, generate only that partial reference-style landmark and keep the unseen remainder outside the frame. Do not force one-to-one replacement of incidental obstacle blocks.

Declared targets:
$target_table
Write only the Host-declared outputs. Prompt Events occur later than every first frame and must not appear early. Each whitebox first frame wins all spatial conflicts; the user image wins appearance conflicts."
printf '%s\n' "$instruction" > "$instruction_file"
visual_input_material="$(shasum -a 256 \
  "$whitebox_root/segment-00-first-frame.png" \
  "$whitebox_root/segment-01-first-frame.png" \
  "$whitebox_root/segment-02-first-frame.png" \
  "$whitebox_root/segment-03-first-frame.png" \
  "$whitebox_root/segment-04-first-frame.png" \
  "$whitebox_root/segment-05-first-frame.png" \
  "$public_root/reference-0.png" \
  "$scene_root/visual-generation-prompts.json" \
  "$scene_root/visual-identity-palette.json" \
  "$scene_root/styled-opening-frame.png" \
  "$scene_root/triviews/whitebox-triview-manifest.json")"
while IFS=$'\t' read -r _ whitebox_path _ _ _ _; do
  [[ -f "$whitebox_path" ]] || continue
  visual_input_material+="$(shasum -a 256 "$whitebox_path")"
done < <(node scripts/visual/list-visual-triview-inputs.mjs --scene-root "$scene_root" --format tsv --limit 5)
visual_input_hash="$(printf '%s' "$visual_input_material" | shasum -a 256 | cut -c1-20)"
task_id="episode-visual-$visual_input_hash"
attempt_suffix=""
if [[ "$attempt" != "1" ]]; then attempt_suffix="-attempt-$attempt"; fi
task_id+="$attempt_suffix"
cloud_root="${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}"
echo "WORLDKIT_EPISODE_STAGE visual-reconstructing"
node scripts/agents/run-codex-task.mjs --backend "$backend" --repo-root "$project_root" --task-id "$task_id" --stage episode-visual \
  --job-name "WorldKit Episode Visuals · $scene_id · attempt $attempt" --request-id "$episode_id-visual-$visual_input_hash$attempt_suffix" --output-s3-prefix "${cloud_root%/}/episodes/$episode_id/visual-$visual_input_hash$attempt_suffix" \
  --instruction-file "$instruction_file" --execution-profile formal --timeout-seconds 1800 \
  --context ".codex/skills/worldkit-episode-visual-reconstructor" --context "artifacts/scenes/$scene_id/scene-brief.md" --context "artifacts/scenes/$scene_id/visual-generation-prompts.json" --context "artifacts/scenes/$scene_id/visual-identity-palette.json" --context "artifacts/scenes/$scene_id/triviews/whitebox-triview-manifest.json" \
  --asset "segment-00-whitebox-first-frame::$whitebox_root/segment-00-first-frame.png::image::image/png" \
  --asset "segment-01-whitebox-first-frame::$whitebox_root/segment-01-first-frame.png::image::image/png" \
  --asset "segment-02-whitebox-first-frame::$whitebox_root/segment-02-first-frame.png::image::image/png" \
  --asset "segment-03-whitebox-first-frame::$whitebox_root/segment-03-first-frame.png::image::image/png" \
  --asset "segment-04-whitebox-first-frame::$whitebox_root/segment-04-first-frame.png::image::image/png" \
  --asset "segment-05-whitebox-first-frame::$whitebox_root/segment-05-first-frame.png::image::image/png" \
  --asset "user-first-frame::$public_root/reference-0.png::image::image/png" \
  --asset "base-styled-opening-frame::$scene_root/styled-opening-frame.png::image::image/png" \
  "${target_asset_args[@]}" \
  --output "$relative_episode_root/visual/episode-visual-prompts.json::$visual_root/episode-visual-prompts.json::application/json" \
  --output "$relative_episode_root/visual/segment-00-styled-opening-frame.png::$visual_root/segment-00-styled-opening-frame.png::image/png" \
  --output "$relative_episode_root/visual/segment-01-styled-opening-frame.png::$visual_root/segment-01-styled-opening-frame.png::image/png" \
  --output "$relative_episode_root/visual/segment-02-styled-opening-frame.png::$visual_root/segment-02-styled-opening-frame.png::image/png" \
  --output "$relative_episode_root/visual/segment-03-styled-opening-frame.png::$visual_root/segment-03-styled-opening-frame.png::image/png" \
  --output "$relative_episode_root/visual/segment-04-styled-opening-frame.png::$visual_root/segment-04-styled-opening-frame.png::image/png" \
  --output "$relative_episode_root/visual/segment-05-styled-opening-frame.png::$visual_root/segment-05-styled-opening-frame.png::image/png" \
  "${target_output_args[@]}"
node scripts/episodes/finalize-episode-visuals.mjs --scene-id "$scene_id" --episode-id "$episode_id" --episode-root "$episode_root" --scene-root "$scene_root"
echo "WORLDKIT_EPISODE_STAGE visual-ready"
