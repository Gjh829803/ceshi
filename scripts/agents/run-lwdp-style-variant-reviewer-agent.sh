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
review_root="$variant_root/review"; mkdir -p "$review_root"
input_path="$review_root/input-identity-attempt-$attempt.json"
review_path="$review_root/visual-quality-review-attempt-$attempt.json"
report_path="$review_root/visual-quality-review-report-attempt-$attempt.json"
node scripts/episodes/prepare-style-variant-review-input.mjs \
  --scene-id "$scene_id" --episode-id "$episode_id" --style-variant-id "$style_variant_id" \
  --scene-root "$scene_root" --episode-root "$episode_root" --output "$input_path"
target_asset_args=(); target_table=""; target_count=0
while IFS=$'\t' read -r visual_target_id whitebox_path _ target_kind target_name target_description; do
  [[ -n "$visual_target_id" ]] || continue
  target_count=$((target_count + 1))
  target_asset_args+=(
    --asset "whitebox-triview-$target_count::$whitebox_path::image::image/png"
    --asset "styled-triview-$target_count::$variant_root/visual/triviews/$visual_target_id/styled-triview.png::image::image/png"
  )
  target_table+="- pair=$target_count; visualTargetId=$visual_target_id; kind=${target_kind:-unknown}; name=${target_name:-$visual_target_id}; description=${target_description:-none}"$'\n'
done < <(node scripts/visual/list-visual-triview-inputs.mjs --scene-root "$scene_root" --format tsv --limit 5)
[[ "$target_count" -ge 1 && "$target_count" -le 5 ]] || exit 3
temporary_root="$project_root/.codex-tmp"; mkdir -p "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/style-variant-review.XXXXXX")"
trap 'case "$task_tmp" in "$temporary_root"/style-variant-review.*) /bin/rm -rf -- "$task_tmp" ;; esac' EXIT
instruction_file="$task_tmp/instruction.txt"
instruction="Use .codex/skills/worldkit-style-variant-visual-reviewer/SKILL.md as the complete guide.

Independently review '$style_variant_id', scene '$scene_id', episode '$episode_id'. Do not generate or edit images. The attached opening images are six ordered whitebox/styled pairs. The remaining images are ordered whitebox/styled tri-view pairs.

Copy inputIdentity byte-for-byte from the attached review-input-identity JSON. Write exactly one JSON review to:
- ${review_path#"$project_root"/}

The review kind is worldkit-style-variant-visual-review, schemaVersion 1, reviewer lwdp-codex. Include sceneId, episodeId, styleVariantId, inputIdentity, verdict, summary, repairInstructions, six ordered openingFrameReviews, and these ordered triviewReviews:
$target_table
Use semantic visual judgment. Do not compute or invent numeric image thresholds."
printf '%s\n' "$instruction" > "$instruction_file"
unset LWDP_GENERATION_API_TOKEN LWDP_API_BASE LWDP_USER_ID
export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
input_hash="$(shasum -a 256 "$input_path" | cut -d' ' -f1 | cut -c1-20)"
reviewer_task_id="style-review-$style_variant_id-$input_hash"
reviewer_request_id="$episode_id-$style_variant_id-review-$input_hash"
node scripts/agents/run-codex-task.mjs --backend "$backend" --repo-root "$project_root" \
  --task-id "$reviewer_task_id" --stage episode-visual \
  --job-name "WorldKit Style Visual Review · $style_variant_id · attempt $attempt" \
  --request-id "$reviewer_request_id" \
  --output-s3-prefix "${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}/episodes/$episode_id/$style_variant_id/review-$input_hash" \
  --instruction-file "$instruction_file" --execution-profile formal --timeout-seconds 1200 \
  --context ".codex/skills/worldkit-style-variant-visual-reviewer" \
  --context "artifacts/scenes/$scene_id/scene-brief.md" \
  --context "artifacts/scenes/$scene_id/triviews/whitebox-triview-manifest.json" \
  --asset "style-variant::$variant_root/style-variant.json::file::application/json" \
  --asset "review-input-identity::$input_path::file::application/json" \
  --asset "segment-00-whitebox::$episode_root/whitebox/segment-00-first-frame.png::image::image/png" \
  --asset "segment-00-styled::$variant_root/visual/segment-00-styled-opening-frame.png::image::image/png" \
  --asset "segment-01-whitebox::$episode_root/whitebox/segment-01-first-frame.png::image::image/png" \
  --asset "segment-01-styled::$variant_root/visual/segment-01-styled-opening-frame.png::image::image/png" \
  --asset "segment-02-whitebox::$episode_root/whitebox/segment-02-first-frame.png::image::image/png" \
  --asset "segment-02-styled::$variant_root/visual/segment-02-styled-opening-frame.png::image::image/png" \
  --asset "segment-03-whitebox::$episode_root/whitebox/segment-03-first-frame.png::image::image/png" \
  --asset "segment-03-styled::$variant_root/visual/segment-03-styled-opening-frame.png::image::image/png" \
  --asset "segment-04-whitebox::$episode_root/whitebox/segment-04-first-frame.png::image::image/png" \
  --asset "segment-04-styled::$variant_root/visual/segment-04-styled-opening-frame.png::image::image/png" \
  --asset "segment-05-whitebox::$episode_root/whitebox/segment-05-first-frame.png::image::image/png" \
  --asset "segment-05-styled::$variant_root/visual/segment-05-styled-opening-frame.png::image::image/png" \
  "${target_asset_args[@]}" \
  --output "${review_path#"$project_root"/}::$review_path::application/json"
set +e
node scripts/episodes/finalize-style-variant-review.mjs \
  --scene-id "$scene_id" --episode-id "$episode_id" --style-variant-id "$style_variant_id" \
  --variant-root "$variant_root" --input-identity "$input_path" \
  --review "$review_path" --report "$report_path" \
  --reviewer-task-id "$reviewer_task_id" --reviewer-request-id "$reviewer_request_id"
status=$?
set -e
exit "$status"
