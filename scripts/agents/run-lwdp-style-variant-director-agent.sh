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
temporary_root="$project_root/.codex-tmp"; mkdir -p "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/style-variant-director.XXXXXX")"
trap 'case "$task_tmp" in "$temporary_root"/style-variant-director.*) /bin/rm -rf -- "$task_tmp" ;; esac' EXIT
instruction_file="$task_tmp/instruction.txt"
instruction="Use .codex/skills/worldkit-style-variant-director/SKILL.md as the complete guide.

Plan exactly ten independent visual worlds for scene '$scene_id', episode '$episode_id'.
Copy sourceWhiteboxIdentity byte-for-byte from the attached plan-input JSON. Preserve the exact target order and ids. Each variant id is style-00 through style-09 in order. Write only:
- ${plan_path#"$project_root"/}

The ten concepts must be materially different world premises, not palette or weather swaps. Examples in conversation are illustrative only; choose scene-specific concepts. Every visualPrompt and geminiEventPrompt must be standalone.

Before delivery, run the Skill-bundled self-check against the attached style-variant-plan-input.json and the declared output path. Repair and rerun inside this same task until it returns ok=true."
printf '%s\n' "$instruction" > "$instruction_file"
unset LWDP_GENERATION_API_TOKEN LWDP_API_BASE LWDP_USER_ID
export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
input_hash="$(shasum -a 256 "$input_path" "$scene_root/scene-brief.md" | shasum -a 256 | cut -c1-20)"
node scripts/agents/run-codex-task.mjs --backend "$backend" --repo-root "$project_root" \
  --task-id "style-variant-director-$input_hash" --stage episode-visual \
  --job-name "WorldKit Style Variant Director · $scene_id" \
  --request-id "$episode_id-style-director-$input_hash" \
  --output-s3-prefix "${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}/episodes/$episode_id/style-director-$input_hash" \
  --instruction-file "$instruction_file" --execution-profile formal --timeout-seconds 1800 \
  --context ".codex/skills/worldkit-style-variant-director" \
  --context "artifacts/scenes/$scene_id/scene-brief.md" \
  --asset "style-variant-plan-input::$input_path::file::application/json" \
  --asset "whitebox-opening::$scene_root/opening-frame.png::image::image/png" \
  --output "${plan_path#"$project_root"/}::$plan_path::application/json"
node scripts/episodes/validate-style-variant-plan.mjs \
  --scene-id "$scene_id" --episode-id "$episode_id" \
  --input "$input_path" --plan "$plan_path" --report "$report_path"
node scripts/episodes/materialize-style-variant-roots.mjs \
  --episode-root "$episode_root" --plan "$plan_path"
