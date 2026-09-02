#!/usr/bin/env bash
set -euo pipefail

if [[ "${WORLDKIT_FROZEN_SHELL_ACTIVE:-0}" != "1" ]]; then
  source_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  source_project_root="$(cd "$(dirname "$source_script")/../.." && pwd)"
  exec node "$source_project_root/scripts/agents/run-frozen-shell-script.mjs" "$source_script" "$@"
fi

project_root="${WORLDKIT_FROZEN_SHELL_PROJECT_ROOT:-}"
[[ -n "$project_root" && -d "$project_root" ]] || {
  echo "Frozen visual reconstruction script is missing its project root." >&2
  exit 3
}
cd "$project_root"
if [[ "${1:-}" == "--" ]]; then shift; fi

scene_id=""
user_frame=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; [[ $# -gt 0 ]] || exit 2; scene_id="$1" ;;
    --user-frame) shift; [[ $# -gt 0 ]] || exit 2; user_frame="$1" ;;
    --) ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ ! "$scene_id" =~ ^[a-z0-9][a-z0-9-]{2,79}$ ]]; then
  echo "Usage: pnpm agent:world:visual-reconstruct -- --scene-id <id> [--user-frame <image>]" >&2
  exit 2
fi
if [[ "${WORLDKIT_PROMPT_SMOKE:-0}" == "1" ]]; then
  echo "WORLDKIT_VISUAL_RECONSTRUCTION_SMOKE_OK lwdp-codex single-job gpt-5.6-sol xhigh opening-and-all-triviews"
  exit 0
fi

artifact_root="$project_root/artifacts/scenes/$scene_id"
public_plan_root="$project_root/apps/playground/public/scene-plans/$scene_id"
for required in \
  "$artifact_root/scene-brief.md" \
  "$artifact_root/visual-identity-palette.json" \
  "$artifact_root/scene-implementation-map.json" \
  "$artifact_root/opening-frame.png" \
  "$artifact_root/runtime-snapshot.json" \
  "$artifact_root/triviews/whitebox-triview-manifest.json"; do
  [[ -f "$required" && -s "$required" && ! -L "$required" ]] || {
    echo "Required whitebox artifact is missing or unsafe: $required" >&2
    exit 3
  }
done

if [[ -z "$user_frame" ]]; then
  for candidate in "$public_plan_root"/reference-0.png "$public_plan_root"/reference-0.jpg "$public_plan_root"/reference-0.webp; do
    if [[ -f "$candidate" && ! -L "$candidate" ]]; then
      user_frame="$candidate"
      break
    fi
  done
fi
[[ -n "$user_frame" && -f "$user_frame" && -s "$user_frame" && ! -L "$user_frame" ]] || {
  echo "A regular user-uploaded first frame is required." >&2
  exit 3
}

unset LWDP_GENERATION_API_TOKEN LWDP_API_BASE LWDP_USER_ID
export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
[[ -s "$WORLDKIT_LWDP_ENV_FILE" && ! -L "$WORLDKIT_LWDP_ENV_FILE" ]] || {
  echo "Project-local LWDP runtime config is missing or unsafe." >&2; exit 3;
}

pnpm_bin="$(command -v pnpm)"
node_bin="$(command -v node)"
temporary_root="$project_root/.codex-tmp"
mkdir -p "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/visual-reconstructor.XXXXXX")"
cleanup() {
  case "$task_tmp" in
    "$temporary_root"/visual-reconstructor.*) /bin/rm -rf -- "$task_tmp" ;;
  esac
}
trap cleanup EXIT

target_asset_args=()
target_output_args=()
target_table=""
target_output_table=""
target_count=0
while IFS=$'\t' read -r visual_target_id whitebox_path _ target_kind target_name target_description; do
  [[ -n "$visual_target_id" ]] || continue
  [[ "$visual_target_id" =~ ^[a-z0-9][a-z0-9-]{2,79}$ ]] || {
    echo "Invalid visual target id: $visual_target_id" >&2
    exit 3
  }
  [[ -f "$whitebox_path" && -s "$whitebox_path" && ! -L "$whitebox_path" ]] || {
    echo "Whitebox tri-view is missing or unsafe: $whitebox_path" >&2
    exit 3
  }
  target_count=$((target_count + 1))
  asset_id="whitebox-triview-$target_count"
  styled_relative="triviews/$visual_target_id/styled-triview.png"
  target_asset_args+=(--asset "$asset_id::$whitebox_path::image::image/png")
  target_output_args+=(--output "artifacts/scenes/$scene_id/$styled_relative::$artifact_root/$styled_relative::image/png")
  target_table+="- asset=$asset_id; visualTargetId=$visual_target_id; kind=${target_kind:-unknown}; name=${target_name:-$visual_target_id}; description=${target_description:-none}; output=artifacts/scenes/$scene_id/$styled_relative"$'\n'
  target_output_table+="- artifacts/scenes/$scene_id/$styled_relative"$'\n'
done < <("$node_bin" scripts/visual/list-visual-triview-inputs.mjs --scene-root "$artifact_root" --format tsv --limit 5)

[[ "$target_count" -ge 1 && "$target_count" -le 5 ]] || {
  echo "Visual reconstruction requires 1-5 complete targets; found $target_count." >&2
  exit 3
}

instruction_file="$task_tmp/visual-reconstruction.prompt.txt"
instruction="Use .codex/skills/worldkit-visual-reconstructor/SKILL.md as the complete guide for scene '$scene_id'.

This is one hosted post-whitebox visual reconstruction task. Generate the final styled opening frame and every declared complete-target styled tri-view inside this same Codex job. Use the built-in image generation tool. Do not create another task or call any external image provider.

Read these extracted context files:
- artifacts/scenes/$scene_id/scene-brief.md
- artifacts/scenes/$scene_id/visual-identity-palette.json
- artifacts/scenes/$scene_id/triviews/whitebox-triview-manifest.json

Attached image roles, in order:
1. actual-whitebox-opening: the only opening-frame edit target and spatial authority.
2. user-first-frame: direct high-fidelity appearance authority only.
3. whitebox-triview-N: the complete target geometry sheet identified below.

Declared complete targets:
$target_table
Write exactly these declared outputs and no other project files:
- artifacts/scenes/$scene_id/visual-generation-prompts.json
- artifacts/scenes/$scene_id/styled-opening-frame.png
$target_output_table
The actual whitebox opening always wins camera, composition, pose, geometry, placement, scale, depth, and occlusion conflicts. The user first frame always wins identity, costume, material, texture, palette, lighting language, and art-style conflicts. Generate and inspect the opening first; then use that accepted opening as the shared appearance anchor for all target tri-views. Finish only after every declared output exists at its exact path.

Opening-frame hard constraint: this is a registered material repaint, not a recomposition. Read the entry movement mode from scene-brief.md and treat every visible connected ground, water-surface, underwater, or open-air region used by that mode as a protected movement envelope. Preserve that envelope at the same screen-space pixels, including its near/middle/far width, left and right boundaries, continuity, clearance, and visible exit. User-reference props and environmental detail may replace only corresponding existing whitebox blocker silhouettes; never add or enlarge a visual mass into the protected envelope. The opening prompt in visual-generation-prompts.json must describe this scene-specific envelope explicitly rather than merely saying to preserve the layout.

Technical-helper exception: a whitebox silhouette that is not declared by scene-brief.md or the visual target manifest may be a runtime-only support rather than visible world geometry. Flight stands, support columns, spawn pads, camera helpers, invisible colliders, air walls, movement volumes, shadow catchers, selection markers, and similar proxies must be erased and replaced by the surrounding movement medium. This exception overrides mask preservation. Never render an undeclared support beneath a flying Subject as a translucent pillar, pedestal, cloud column, beam, or platform.

Tri-view hard order: every styled tri-view has exactly three panels. The trusted Host has already used the target's declared local front and one shared orthographic meter-to-pixel scale. The left panel is Front and must show the target's front plane; the center panel is its anatomical Right profile with the target facing toward the image's right edge; the right panel is Back and must show the rear plane. Preserve the whitebox panel baseline and physical scale exactly; never independently zoom, recenter, reinterpret, or swap a panel. Inspect this positional contract before accepting each tri-view.
"
printf '%s\n' "$instruction" > "$instruction_file"

codex_run_nonce="$(date -u +%Y%m%d-%H%M%S)-$$"
cloud_s3_root="${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}"
output_s3_prefix="${cloud_s3_root%/}/$scene_id/$codex_run_nonce/visual-reconstruction"
task_id="visual-$codex_run_nonce"
user_extension="${user_frame##*.}"
case "$user_extension" in
  jpg|JPG|jpeg|JPEG) user_media_type="image/jpeg" ;;
  png|PNG) user_media_type="image/png" ;;
  webp|WEBP) user_media_type="image/webp" ;;
  *) echo "Unsupported user frame extension: .$user_extension" >&2; exit 3 ;;
esac

echo "WORLDKIT_STAGE visual-reconstruction"
"$node_bin" scripts/agents/run-codex-task.mjs \
  --backend cloud \
  --repo-root "$project_root" \
  --task-id "$task_id" \
  --stage visual-reconstruction \
  --job-name "WorldKit Visual Reconstructor · $scene_id" \
  --request-id "$scene_id-visual-$codex_run_nonce" \
  --output-s3-prefix "$output_s3_prefix" \
  --instruction-file "$instruction_file" \
  --execution-profile formal \
  --timeout-seconds 1800 \
  --context ".codex/skills/worldkit-visual-reconstructor" \
  --context "artifacts/scenes/$scene_id/scene-brief.md" \
  --context "artifacts/scenes/$scene_id/visual-identity-palette.json" \
  --context "artifacts/scenes/$scene_id/triviews/whitebox-triview-manifest.json" \
  --asset "actual-whitebox-opening::$artifact_root/opening-frame.png::image::image/png" \
  --asset "user-first-frame::$user_frame::image::$user_media_type" \
  "${target_asset_args[@]}" \
  --output "artifacts/scenes/$scene_id/visual-generation-prompts.json::$artifact_root/visual-generation-prompts.json::application/json" \
  --output "artifacts/scenes/$scene_id/styled-opening-frame.png::$artifact_root/styled-opening-frame.png::image/png" \
  "${target_output_args[@]}"

if [[ "${WORLDKIT_LWDP_CLIENT_SMOKE:-0}" == "1" ]]; then
  echo "WORLDKIT_VISUAL_RECONSTRUCTION_DISPATCH_SMOKE targets=$target_count outputs=$((target_count + 2))"
  exit 0
fi

"$pnpm_bin" exec tsx scripts/visual/finalize-styled-opening-frame.ts \
  --scene-id "$scene_id" --scene-root "$artifact_root" --user-frame "$user_frame"
"$pnpm_bin" exec tsx scripts/visual/finalize-styled-triviews.ts \
  --scene-id "$scene_id" --scene-root "$artifact_root"
echo "WORLDKIT_STAGE visual-reconstruction-ready"
