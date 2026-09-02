#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
if [[ "${1:-}" == "--" ]]; then shift; fi
scene_id=""; episode_id=""; episode_root=""; run_root=""; backend="local"; attempt="1"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; scene_id="${1:-}" ;;
    --episode-id) shift; episode_id="${1:-}" ;;
    --episode-root) shift; episode_root="${1:-}" ;;
    --run-root) shift; run_root="${1:-}" ;;
    --backend) shift; backend="${1:-}" ;;
    --attempt) shift; attempt="${1:-}" ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done
id_pattern='^[a-z0-9][a-z0-9-]{2,119}$'
[[ "$scene_id" =~ $id_pattern && "$episode_id" =~ $id_pattern && "$attempt" =~ ^[1-3]$ ]] || exit 2
episode_root="$(cd "$(dirname "$episode_root")" && pwd)/$(basename "$episode_root")"
run_root="$(cd "$run_root" && pwd)"
review_root="$run_root/review"; mkdir -p "$review_root"
input_path="$review_root/input-identity.json"
review_path="$review_root/opening-review.json"
report_path="$review_root/opening-review-report.json"
node scripts/episodes/prepare-style-variant-opening-review-input.mjs \
  --scene-id "$scene_id" --episode-id "$episode_id" \
  --episode-root "$episode_root" --run-root "$run_root" --output "$input_path"
asset_args=(--asset "segment-00-whitebox::$episode_root/whitebox/segment-00-first-frame.png::image::image/png")
for index in 0 1 2 3 4 5 6 7 8 9; do
  variant_id="style-0$index"
  asset_args+=(--asset "$variant_id-opening::$run_root/images/$variant_id.png::image::image/png")
done
temporary_root="$project_root/.codex-tmp"; mkdir -p "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/style-opening-review.XXXXXX")"
trap 'case "$task_tmp" in "$temporary_root"/style-opening-review.*) /bin/rm -rf -- "$task_tmp" ;; esac' EXIT
instruction_file="$task_tmp/instruction.txt"
instruction="Use .codex/skills/worldkit-style-variant-diversity-reviewer/SKILL.md as the complete guide in opening-batch review mode.

Review scene '$scene_id', episode '$episode_id'. The first attached image is the sole whitebox spatial authority. It has no final appearance identity. The next ten images are ordered style-00 through style-09. No original styled image or original tri-view is provided.

Judge each styled image against the whitebox for camera, FOV, crop, Subject registration, terrain profile, landmark center/occupancy, depth, occlusion, negative space and traversable clearance. Then judge all ten together for unmistakable Subject, environment and landmark diversity. Do not generate or edit images.

Copy inputIdentity byte-for-byte from the attached input JSON and write only:
- ${review_path#"$project_root"/}"
printf '%s\n' "$instruction" > "$instruction_file"
input_hash="$(shasum -a 256 "$input_path" | cut -d' ' -f1 | cut -c1-20)"
task_id="style-opening-review-$input_hash"
request_id="$episode_id-style-opening-review-$input_hash-attempt-$attempt"
node scripts/agents/run-codex-task.mjs --backend "$backend" --repo-root "$project_root" \
  --task-id "$task_id" --stage episode-visual \
  --job-name "WorldKit Style Opening Review · attempt $attempt" \
  --request-id "$request_id" \
  --output-s3-prefix "${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}/episodes/$episode_id/opening-review-$input_hash-attempt-$attempt" \
  --instruction-file "$instruction_file" --execution-profile formal --timeout-seconds 1200 \
  --context ".codex/skills/worldkit-style-variant-diversity-reviewer" \
  --asset "style-variant-plan::$episode_root/style-variants/style-variant-plan.json::file::application/json" \
  --asset "review-input-identity::$input_path::file::application/json" \
  "${asset_args[@]}" \
  --output "${review_path#"$project_root"/}::$review_path::application/json"
set +e
node scripts/episodes/finalize-style-variant-opening-review.mjs \
  --scene-id "$scene_id" --episode-id "$episode_id" \
  --input "$input_path" --review "$review_path" --report "$report_path" \
  --reviewer-task-id "$task_id" --reviewer-request-id "$request_id"
status=$?
set -e
exit "$status"
