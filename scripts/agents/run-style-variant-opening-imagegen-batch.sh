#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
if [[ "${1:-}" == "--" ]]; then shift; fi
scene_id=""; episode_id=""; episode_root=""; attempt="1"; review_path=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; scene_id="${1:-}" ;;
    --episode-id) shift; episode_id="${1:-}" ;;
    --episode-root) shift; episode_root="${1:-}" ;;
    --attempt) shift; attempt="${1:-}" ;;
    --review) shift; review_path="${1:-}" ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done
id_pattern='^[a-z0-9][a-z0-9-]{2,119}$'
[[ "$scene_id" =~ $id_pattern && "$episode_id" =~ $id_pattern && "$attempt" =~ ^[1-3]$ ]] || exit 2
episode_root="$(cd "$(dirname "$episode_root")" && pwd)/$(basename "$episode_root")"
run_root="$project_root/.codex-tmp/style-variant-opening-batch/$episode_id/attempt-$attempt"
image_root="$run_root/images"
batch_path="$run_root/imagegen-batch.json"
run_path="$run_root/imagegen-run.json"
mkdir -p "$image_root"
prepare_args=(
  --scene-id "$scene_id" --episode-id "$episode_id"
  --episode-root "$episode_root" --output "$batch_path"
)
if [[ -n "$review_path" ]]; then prepare_args+=(--review "$review_path"); fi
node scripts/episodes/prepare-style-variant-opening-batch.mjs \
  "${prepare_args[@]}"
batch_hash="$(shasum -a 256 "$batch_path" | cut -d' ' -f1 | cut -c1-20)"
output_s3_prefix="${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}/episodes/$episode_id/style-opening-batch-$batch_hash-attempt-$attempt"
download_args=()
while IFS= read -r variant_id; do
  [[ -n "$variant_id" ]] || continue
  download_args+=(--download "$variant_id::$image_root/$variant_id.png")
done < <(node --input-type=module - "$batch_path" <<'NODE'
import { readFile } from "node:fs/promises";
const batch = JSON.parse(await readFile(process.argv[2], "utf8"));
for (const item of batch.items ?? []) process.stdout.write(`${item.id}\n`);
NODE
)
unset LWDP_GENERATION_API_TOKEN LWDP_API_BASE LWDP_USER_ID
export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
log_path="$run_root/lwdp-t2i.log"
node scripts/agents/run-lwdp-t2i-job.mjs \
  --manifest "$batch_path" \
  --job-name "WorldKit Style Opening Batch · $episode_id · attempt $attempt" \
  --stage style-opening-imagegen \
  --request-id "$episode_id-style-opening-batch-$batch_hash-attempt-$attempt" \
  --output-s3-prefix "$output_s3_prefix" \
  "${download_args[@]}" | tee "$log_path"
job_id="$(sed -n 's/^WORLDKIT_LWDP_IMAGE_JOB [^ ]* \([^ ]*\).*/\1/p' "$log_path" | tail -1)"
[[ "$job_id" =~ ^gen_[a-z0-9]+$ ]] || { echo "ImageGen batch job id is missing." >&2; exit 3; }
node scripts/episodes/finalize-style-variant-opening-batch.mjs \
  --scene-id "$scene_id" --episode-id "$episode_id" \
  --batch "$batch_path" --image-root "$image_root" --output "$run_path" --job-id "$job_id"
