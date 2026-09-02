#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
if [[ "${1:-}" == "--" ]]; then shift; fi
scene_id=""; episode_id=""; episode_root=""; backend="cloud"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; scene_id="${1:-}" ;;
    --episode-id) shift; episode_id="${1:-}" ;;
    --episode-root) shift; episode_root="${1:-}" ;;
    --backend) shift; backend="${1:-}" ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done
id_pattern='^[a-z0-9][a-z0-9-]{2,119}$'
[[ "$scene_id" =~ $id_pattern && "$episode_id" =~ $id_pattern ]] || exit 2
episode_root="$(cd "$(dirname "$episode_root")" && pwd)/$(basename "$episode_root")"
scene_root="$project_root/artifacts/scenes/$scene_id"
style_root="$episode_root/style-variants"
mkdir -p "$style_root"
input_path="$style_root/style-variant-plan-input.json"
plan_path="$style_root/style-variant-plan.json"
report_path="$style_root/style-variant-plan-report.json"
node scripts/episodes/prepare-style-variant-plan-input.mjs \
  --scene-id "$scene_id" --episode-id "$episode_id" \
  --scene-root "$scene_root" --episode-root "$episode_root" --output "$input_path"
target_asset_args=(); target_table=""; target_count=0
while IFS=$'\t' read -r visual_target_id whitebox_path _ target_kind _ _; do
  [[ -n "$visual_target_id" ]] || continue
  target_count=$((target_count + 1))
  asset_id="whitebox-triview-$target_count"
  target_asset_args+=(--asset "$asset_id::$whitebox_path::image::image/png")
  target_table+="- asset=$asset_id; visualTargetId=$visual_target_id; kind=${target_kind:-unknown}"$'\n'
done < <(node scripts/visual/list-visual-triview-inputs.mjs --scene-root "$scene_root" --format tsv --limit 5)
[[ "$target_count" -ge 1 && "$target_count" -le 5 ]] || exit 3
for index in 0 1 2 3 4 5; do
  required="$episode_root/whitebox/segment-0$index-first-frame.png"
  [[ -f "$required" && -s "$required" && ! -L "$required" ]] || {
    echo "Missing Style Variant Director whitebox input: $required" >&2
    exit 3
  }
done
temporary_root="$project_root/.codex-tmp"; mkdir -p "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/style-variant-director.XXXXXX")"
trap 'case "$task_tmp" in "$temporary_root"/style-variant-director.*) /bin/rm -rf -- "$task_tmp" ;; esac' EXIT
instruction_file="$task_tmp/instruction.txt"
instruction="Use .codex/skills/worldkit-style-variant-director/SKILL.md as the complete guide.

Plan exactly ten independent visual worlds for scene '$scene_id', episode '$episode_id'. The attached images are exclusively whitebox evidence; no original styled frame or styled tri-view is available or permitted as an appearance reference.
Copy sourceWhiteboxIdentity byte-for-byte from the attached plan-input JSON. Preserve the exact target order and ids. Each variant id is style-00 through style-09 in order. Write only:
- ${plan_path#"$project_root"/}

Declared whitebox targets:
$target_table
The ten concepts must be visibly and semantically different world premises, not palette, biome, period, profession, material, or weather swaps. Across the set, redesign the Subject, environment and every target as ten distinct identities. Do not preserve identities implied by the source Scene. Every visualPrompt and geminiEventPrompt must be standalone.

Before delivery, run the Skill-bundled self-check against the attached style-variant-plan-input.json and the declared output path. Repair and rerun inside this same task until it returns ok=true."
printf '%s\n' "$instruction" > "$instruction_file"
unset LWDP_GENERATION_API_TOKEN LWDP_API_BASE LWDP_USER_ID
export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
input_material="$(shasum -a 256 "$input_path")"
for index in 0 1 2 3 4 5; do input_material+="$(shasum -a 256 "$episode_root/whitebox/segment-0$index-first-frame.png")"; done
while IFS=$'\t' read -r _ whitebox_path _; do input_material+="$(shasum -a 256 "$whitebox_path")"; done \
  < <(node scripts/visual/list-visual-triview-inputs.mjs --scene-root "$scene_root" --format tsv --limit 5)
input_hash="$(printf '%s' "$input_material" | shasum -a 256 | cut -c1-20)"
node scripts/agents/run-codex-task.mjs --backend "$backend" --repo-root "$project_root" \
  --task-id "style-variant-director-$input_hash" --stage episode-visual \
  --job-name "WorldKit Style Variant Director · $scene_id" \
  --request-id "$episode_id-style-director-$input_hash" \
  --output-s3-prefix "${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}/episodes/$episode_id/style-director-$input_hash" \
  --instruction-file "$instruction_file" --execution-profile formal --timeout-seconds 1800 \
  --context ".codex/skills/worldkit-style-variant-director" \
  --asset "style-variant-plan-input::$input_path::file::application/json" \
  --asset "segment-00-whitebox::$episode_root/whitebox/segment-00-first-frame.png::image::image/png" \
  --asset "segment-01-whitebox::$episode_root/whitebox/segment-01-first-frame.png::image::image/png" \
  --asset "segment-02-whitebox::$episode_root/whitebox/segment-02-first-frame.png::image::image/png" \
  --asset "segment-03-whitebox::$episode_root/whitebox/segment-03-first-frame.png::image::image/png" \
  --asset "segment-04-whitebox::$episode_root/whitebox/segment-04-first-frame.png::image::image/png" \
  --asset "segment-05-whitebox::$episode_root/whitebox/segment-05-first-frame.png::image::image/png" \
  "${target_asset_args[@]}" \
  --output "${plan_path#"$project_root"/}::$plan_path::application/json"
node scripts/episodes/validate-style-variant-plan.mjs \
  --scene-id "$scene_id" --episode-id "$episode_id" \
  --input "$input_path" --plan "$plan_path" --report "$report_path"
node scripts/episodes/materialize-style-variant-roots.mjs \
  --episode-root "$episode_root" --plan "$plan_path"
