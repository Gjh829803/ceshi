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
id_pattern='^[a-z0-9][a-z0-9-]{2,119}$'
[[ "$scene_id" =~ $id_pattern && "$episode_id" =~ $id_pattern && "$attempt" =~ ^[1-3]$ ]] || exit 2
episode_root="$(cd "$(dirname "$episode_root")" && pwd)/$(basename "$episode_root")"
style_root="$episode_root/style-variants"
review_path="$style_root/diversity-review-attempt-$attempt.json"
report_path="$style_root/diversity-review-report-attempt-$attempt.json"
input_path="$style_root/diversity-review-input-attempt-$attempt.json"
node scripts/episodes/prepare-style-variant-diversity-review-input.mjs \
  --scene-id "$scene_id" --episode-id "$episode_id" \
  --episode-root "$episode_root" --output "$input_path"
asset_args=(); variant_table=""
for index in 0 1 2 3 4 5 6 7 8 9; do
  variant_id="style-0$index"
  variant_root="$style_root/$variant_id"
  asset_args+=(
    --asset "$variant_id-opening::$variant_root/visual/segment-00-styled-opening-frame.png::image::image/png"
  )
  target_ids="$(node --input-type=module - "$variant_root/visual/visual-manifest.json" <<'NODE'
import { readFile } from "node:fs/promises";
const manifest = JSON.parse(await readFile(process.argv[2], "utf8"));
for (const target of manifest.targets ?? []) process.stdout.write(`${target.visualTargetId}\n`);
NODE
)"
  target_count=0
  while IFS= read -r target_id; do
    [[ -n "$target_id" ]] || continue
    target_count=$((target_count + 1))
    asset_args+=(
      --asset "$variant_id-target-$target_count::$variant_root/visual/triviews/$target_id/styled-triview.png::image::image/png"
    )
  done <<< "$target_ids"
  variant_table+="- $variant_id: opening=$variant_id-opening; target sheets=$target_count"$'\n'
done
temporary_root="$project_root/.codex-tmp"; mkdir -p "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/style-variant-diversity-review.XXXXXX")"
trap 'case "$task_tmp" in "$temporary_root"/style-variant-diversity-review.*) /bin/rm -rf -- "$task_tmp" ;; esac' EXIT
instruction_file="$task_tmp/instruction.txt"
instruction="Use .codex/skills/worldkit-style-variant-diversity-reviewer/SKILL.md as the complete guide.

Review all ten completed variants together for scene '$scene_id', episode '$episode_id'. Do not generate or edit images. Each variant supplies its primary styled opening followed by its target tri-view sheets.

$variant_table
Copy inputIdentity byte-for-byte from the attached input JSON. Write exactly one review to:
- ${review_path#"$project_root"/}

Judge the visible outputs, not the style names. Ten related biomes, travelers, towers or material swaps must fail even when each individual image is attractive."
printf '%s\n' "$instruction" > "$instruction_file"
unset LWDP_GENERATION_API_TOKEN LWDP_API_BASE LWDP_USER_ID
export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
input_hash="$(shasum -a 256 "$input_path" | cut -d' ' -f1 | cut -c1-20)"
task_id="style-diversity-review-$input_hash"
request_id="$episode_id-style-diversity-review-$input_hash"
node scripts/agents/run-codex-task.mjs --backend "$backend" --repo-root "$project_root" \
  --task-id "$task_id" --stage episode-visual \
  --job-name "WorldKit Style Diversity Review · attempt $attempt" \
  --request-id "$request_id" \
  --output-s3-prefix "${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}/episodes/$episode_id/diversity-review-$input_hash" \
  --instruction-file "$instruction_file" --execution-profile formal --timeout-seconds 1200 \
  --context ".codex/skills/worldkit-style-variant-diversity-reviewer" \
  --asset "style-variant-plan::$style_root/style-variant-plan.json::file::application/json" \
  --asset "review-input-identity::$input_path::file::application/json" \
  "${asset_args[@]}" \
  --output "${review_path#"$project_root"/}::$review_path::application/json"
set +e
node scripts/episodes/finalize-style-variant-diversity-review.mjs \
  --scene-id "$scene_id" --episode-id "$episode_id" --style-root "$style_root" \
  --input-identity "$input_path" --review "$review_path" --report "$report_path" \
  --reviewer-task-id "$task_id" --reviewer-request-id "$request_id"
status=$?
set -e
exit "$status"
