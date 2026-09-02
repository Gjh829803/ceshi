#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
if [[ "${1:-}" == "--" ]]; then shift; fi
scene_id=""; episode_id=""; episode_root=""; style_variant_id=""; backend="cloud"; attempt="1"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; scene_id="${1:-}" ;;
    --episode-id) shift; episode_id="${1:-}" ;;
    --episode-root) shift; episode_root="${1:-}" ;;
    --style-variant-id) shift; style_variant_id="${1:-}" ;;
    --backend) shift; backend="${1:-}" ;;
    --attempt) shift; attempt="${1:-}" ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done
id_pattern='^[a-z0-9][a-z0-9-]{2,119}$'
[[ "$scene_id" =~ $id_pattern && "$episode_id" =~ $id_pattern ]] || exit 2
[[ "$style_variant_id" =~ ^style-0[0-9]$ && "$attempt" =~ ^[1-3]$ ]] || exit 2
episode_root="$(cd "$(dirname "$episode_root")" && pwd)/$(basename "$episode_root")"
scene_root="$project_root/artifacts/scenes/$scene_id"
variant_root="$episode_root/style-variants/$style_variant_id"
visual_root="$variant_root/visual"
whitebox_root="$episode_root/whitebox"
public_root="$project_root/apps/playground/public/scene-plans/$scene_id"
mkdir -p "$visual_root"
for required in "$variant_root/style-variant.json" "$scene_root/triviews/whitebox-triview-manifest.json" "$public_root/reference-0.png"; do
  [[ -f "$required" && -s "$required" && ! -L "$required" ]] || { echo "Missing Style Variant visual input: $required" >&2; exit 3; }
done
for index in 0 1 2 3 4 5; do
  required="$whitebox_root/segment-0$index-first-frame.png"
  [[ -f "$required" && -s "$required" && ! -L "$required" ]] || { echo "Missing $required" >&2; exit 3; }
done
target_asset_args=(); target_output_args=(); target_table=""; target_count=0
while IFS=$'\t' read -r visual_target_id whitebox_path _ target_kind target_name target_description; do
  [[ -n "$visual_target_id" ]] || continue
  target_count=$((target_count + 1))
  asset_id="whitebox-triview-$target_count"
  target_asset_args+=(--asset "$asset_id::$whitebox_path::image::image/png")
  output_path="$visual_root/triviews/$visual_target_id/styled-triview.png"
  target_output_args+=(--output "${output_path#"$project_root"/}::$output_path::image/png")
  target_table+="- asset=$asset_id; visualTargetId=$visual_target_id; kind=${target_kind:-unknown}; name=${target_name:-$visual_target_id}; description=${target_description:-none}"$'\n'
done < <(node scripts/visual/list-visual-triview-inputs.mjs --scene-root "$scene_root" --format tsv --limit 5)
[[ "$target_count" -ge 1 && "$target_count" -le 5 ]] || exit 3
temporary_root="$project_root/.codex-tmp"; mkdir -p "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/style-variant-visual.XXXXXX")"
trap 'case "$task_tmp" in "$temporary_root"/style-variant-visual.*) /bin/rm -rf -- "$task_tmp" ;; esac' EXIT
instruction_file="$task_tmp/instruction.txt"
review_path="$variant_root/review/visual-quality-review.json"
repair_instruction=""
review_args=()
if [[ "$attempt" != "1" ]]; then
  [[ -f "$review_path" && -s "$review_path" ]] || { echo "Repair attempt requires prior Codex review." >&2; exit 3; }
  repair_instruction="This is repair attempt $attempt. Read the attached prior-review and repair only its reported failures."
  review_args=(--asset "prior-review::$review_path::file::application/json")
fi
instruction="Use .codex/skills/worldkit-style-variant-visual-reconstructor/SKILL.md as the complete guide.

Generate one complete visual set for '$style_variant_id', scene '$scene_id', episode '$episode_id'. $repair_instruction

Attached image roles are six ordered Segment whitebox first frames, the original user reference as optional quality context, then the declared whitebox target sheets. The selected style-variant document is the final appearance authority.

Declared targets:
$target_table
Write only the Host-declared prompt bundle, six styled opening frames, and all target tri-views. Do not generate video or a review verdict."
printf '%s\n' "$instruction" > "$instruction_file"
unset LWDP_GENERATION_API_TOKEN LWDP_API_BASE LWDP_USER_ID
export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
input_material="$(shasum -a 256 "$variant_root/style-variant.json" "$scene_root/triviews/whitebox-triview-manifest.json")"
for index in 0 1 2 3 4 5; do input_material+="$(shasum -a 256 "$whitebox_root/segment-0$index-first-frame.png")"; done
if [[ -f "$review_path" ]]; then input_material+="$(shasum -a 256 "$review_path")"; fi
input_hash="$(printf '%s' "$input_material" | shasum -a 256 | cut -c1-20)"
attempt_suffix=""; [[ "$attempt" == "1" ]] || attempt_suffix="-attempt-$attempt"
node scripts/agents/run-codex-task.mjs --backend "$backend" --repo-root "$project_root" \
  --task-id "style-visual-$style_variant_id-$input_hash$attempt_suffix" --stage episode-visual \
  --job-name "WorldKit Style Visual · $style_variant_id · attempt $attempt" \
  --request-id "$episode_id-$style_variant_id-visual-$input_hash$attempt_suffix" \
  --output-s3-prefix "${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}/episodes/$episode_id/$style_variant_id/visual-$input_hash$attempt_suffix" \
  --instruction-file "$instruction_file" --execution-profile formal --timeout-seconds 1800 \
  --context ".codex/skills/worldkit-style-variant-visual-reconstructor" \
  --context "artifacts/scenes/$scene_id/scene-brief.md" \
  --context "artifacts/scenes/$scene_id/triviews/whitebox-triview-manifest.json" \
  --asset "style-variant::$variant_root/style-variant.json::file::application/json" \
  --asset "segment-00-whitebox::$whitebox_root/segment-00-first-frame.png::image::image/png" \
  --asset "segment-01-whitebox::$whitebox_root/segment-01-first-frame.png::image::image/png" \
  --asset "segment-02-whitebox::$whitebox_root/segment-02-first-frame.png::image::image/png" \
  --asset "segment-03-whitebox::$whitebox_root/segment-03-first-frame.png::image::image/png" \
  --asset "segment-04-whitebox::$whitebox_root/segment-04-first-frame.png::image::image/png" \
  --asset "segment-05-whitebox::$whitebox_root/segment-05-first-frame.png::image::image/png" \
  --asset "source-reference::$public_root/reference-0.png::image::image/png" \
  "${target_asset_args[@]}" "${review_args[@]}" \
  --output "${visual_root#"$project_root"/}/visual-prompts.json::$visual_root/visual-prompts.json::application/json" \
  --output "${visual_root#"$project_root"/}/segment-00-styled-opening-frame.png::$visual_root/segment-00-styled-opening-frame.png::image/png" \
  --output "${visual_root#"$project_root"/}/segment-01-styled-opening-frame.png::$visual_root/segment-01-styled-opening-frame.png::image/png" \
  --output "${visual_root#"$project_root"/}/segment-02-styled-opening-frame.png::$visual_root/segment-02-styled-opening-frame.png::image/png" \
  --output "${visual_root#"$project_root"/}/segment-03-styled-opening-frame.png::$visual_root/segment-03-styled-opening-frame.png::image/png" \
  --output "${visual_root#"$project_root"/}/segment-04-styled-opening-frame.png::$visual_root/segment-04-styled-opening-frame.png::image/png" \
  --output "${visual_root#"$project_root"/}/segment-05-styled-opening-frame.png::$visual_root/segment-05-styled-opening-frame.png::image/png" \
  "${target_output_args[@]}"
node scripts/episodes/finalize-style-variant-visuals.mjs \
  --scene-id "$scene_id" --episode-id "$episode_id" \
  --style-variant-id "$style_variant_id" --episode-root "$episode_root" --scene-root "$scene_root"
