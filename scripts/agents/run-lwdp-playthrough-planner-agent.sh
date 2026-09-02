#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
if [[ "${1:-}" == "--" ]]; then shift; fi

scene_id=""
episode_id=""
episode_root=""
recon_root=""
backend="cloud"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; scene_id="${1:-}" ;;
    --episode-id) shift; episode_id="${1:-}" ;;
    --episode-root) shift; episode_root="${1:-}" ;;
    --recon-root) shift; recon_root="${1:-}" ;;
    --backend) shift; backend="${1:-}" ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done

id_pattern='^[a-z0-9][a-z0-9-]{2,79}$'
[[ "$scene_id" =~ $id_pattern && "$episode_id" =~ $id_pattern ]] || {
  echo "--scene-id and --episode-id are required stable ids." >&2
  exit 2
}
[[ "$backend" == "cloud" || "$backend" == "local" ]] || exit 2
episode_root="$(cd "$(dirname "$episode_root")" && pwd)/$(basename "$episode_root")"
recon_root="$(cd "$recon_root" && pwd)"
scene_root="$project_root/artifacts/scenes/$scene_id"
public_root="$project_root/apps/playground/public/scene-plans/$scene_id"
plan_path="$episode_root/planning/playthrough-plan.json"
navigation_path="$episode_root/planning/navigation-evidence.json"
mkdir -p "$episode_root/planning"

for required in \
  "$scene_root/scene-brief.md" \
  "$scene_root/authoring.json" \
  "$scene_root/world.mjs" \
  "$scene_root/runtime-snapshot.json" \
  "$scene_root/opening-frame.png" \
  "$scene_root/visual-identity-palette.json" \
  "$scene_root/triviews/whitebox-triview-manifest.json" \
  "$recon_root/reconnaissance-report.json" \
  "$navigation_path" \
  "$public_root/world-plan.png"; do
  [[ -f "$required" && -s "$required" && ! -L "$required" ]] || {
    echo "Required playthrough evidence is missing or unsafe: $required" >&2
    exit 3
  }
done

unset LWDP_GENERATION_API_TOKEN LWDP_API_BASE LWDP_USER_ID
export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
[[ -s "$WORLDKIT_LWDP_ENV_FILE" && ! -L "$WORLDKIT_LWDP_ENV_FILE" ]] || {
  echo "Project-local LWDP runtime config is missing or unsafe." >&2; exit 3;
}

relative_episode_root="${episode_root#"$project_root"/}"
relative_recon_root="${recon_root#"$project_root"/}"
[[ "$relative_episode_root" != "$episode_root" && "$relative_recon_root" != "$recon_root" ]] || {
  echo "Episode and reconnaissance roots must be inside the repository." >&2
  exit 3
}

temporary_root="$project_root/.codex-tmp"
mkdir -p "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/playthrough-planner.XXXXXX")"
trap 'case "$task_tmp" in "$temporary_root"/playthrough-planner.*) /bin/rm -rf -- "$task_tmp" ;; esac' EXIT
instruction_file="$task_tmp/instruction.txt"
instruction="Use .codex/skills/worldkit-playthrough-planner/SKILL.md as the complete guide.

Plan six independent 30-second wander captures for scene '$scene_id'. The Host already ran real Runtime reconnaissance and generated trusted navigation evidence. Read every declared context file and inspect every attached image before choosing the six start positions, local destinations, controls or camera views.

Write only:
- $relative_episode_root/planning/playthrough-plan.json

The plan id is '$episode_id-plan', sceneId is '$scene_id', seed is 731991. Use schemaVersion 3 and the exact Skill constants: 180 delivered/execution seconds, six independent 30-second captures, no reset buffer, 24fps and 4320 genuine frames. worldPackageRootHash may be 'unavailable'. Use the controlledEntityId from reconnaissance-report.json and bind the exact navigation-evidence hash.

Choose six different initialPositionMetersXYZ values from exact Host-admitted safe stand positions and a useful initialFacingYawRadians for each. Captures are independent and do not connect: each local route begins at its own initial position. Spread them across the important geography and landmarks. Avoid unsupported edges, known colliders and blocked reconnaissance directions.

Every capture must keep naturally wandering for most of 30 seconds. Its first 2.0 seconds must continuously hold W and must not contain S, Space, an idle gap, or camera-only action. After that opening, use sustained W/W+Shift, scene-grounded A/D steering, short purposeful pauses, suitable Space actions and an appropriate amount of S across at least three captures. Vary the six control patterns and viewpoints; do not copy a macro, patrol with opposite keys, stop after reaching one point, or force a mandatory orbit/reset. Use I/J/K/L for useful moving observations and end each capture in playable third-person framing. Never schedule a camera event so its gesture overlaps a Space/jump interval; keep the camera stable throughout each jump.

Do not write seedancePromptEvents or propose visual events. All six captures receive styled opening frames and generate Seedance. Only captures 00, 02 and 04 receive Prompt Events: Gemini sees those three full videos together at 0.25fps plus their styled frames and creates five mutually different events in one call. Captures 01, 03 and 05 generate Seedance from the stable base visual without Prompt Events.

After writing the output, run the Skill self-check against this scene and repair the same file until it passes. Do not write any other file.
"
printf '%s\n' "$instruction" > "$instruction_file"

asset_args=(
  --asset "actual-whitebox-opening::$scene_root/opening-frame.png::image::image/png"
  --asset "world-plan::$public_root/world-plan.png::image::image/png"
)
for screenshot in "$recon_root"/recon-*.png; do
  [[ -f "$screenshot" ]] || continue
  asset_id="$(basename "$screenshot" .png | tr '_' '-')"
  asset_args+=(--asset "$asset_id::$screenshot::image::image/png")
done

cloud_root="${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}"
episode_hash="$(printf '%s' "$episode_id" | shasum -a 256 | cut -c1-20)"
playthrough_input_material="$(shasum -a 256 \
  "$scene_root/scene-brief.md" \
  "$scene_root/authoring.json" \
  "$scene_root/world.mjs" \
  "$scene_root/runtime-snapshot.json" \
  "$scene_root/opening-frame.png" \
  "$scene_root/visual-identity-palette.json" \
  "$scene_root/triviews/whitebox-triview-manifest.json" \
  "$recon_root/reconnaissance-report.json" \
  "$navigation_path" \
  "$public_root/world-plan.png")"
playthrough_input_hash="$(printf '%s' "$playthrough_input_material" | shasum -a 256 | cut -c1-20)"
task_id="playthrough-$episode_hash-$playthrough_input_hash"
echo "WORLDKIT_EPISODE_STAGE playthrough-planning"
node scripts/agents/run-codex-task.mjs \
  --backend "$backend" \
  --repo-root "$project_root" \
  --task-id "$task_id" \
  --stage playthrough-planner \
  --job-name "WorldKit Playthrough Planner · $scene_id" \
  --request-id "$episode_id-playthrough-plan-v5-$playthrough_input_hash" \
  --output-s3-prefix "${cloud_root%/}/episodes/$episode_id/playthrough-plan-v5-$playthrough_input_hash" \
  --instruction-file "$instruction_file" \
  --execution-profile formal \
  --timeout-seconds 1800 \
  --context ".codex/skills/worldkit-playthrough-planner" \
  --context "scripts/lib/playthrough-dataset.mjs" \
  --context "scripts/lib/playthrough-plan-structure.mjs" \
  --context "artifacts/scenes/$scene_id/scene-brief.md" \
  --context "artifacts/scenes/$scene_id/authoring.json" \
  --context "artifacts/scenes/$scene_id/world.mjs" \
  --context "artifacts/scenes/$scene_id/runtime-snapshot.json" \
  --context "artifacts/scenes/$scene_id/visual-identity-palette.json" \
  --context "artifacts/scenes/$scene_id/triviews/whitebox-triview-manifest.json" \
  --context "$relative_recon_root/reconnaissance-report.json" \
  --context "$relative_episode_root/planning/navigation-evidence.json" \
  "${asset_args[@]}" \
  --output "$relative_episode_root/planning/playthrough-plan.json::$plan_path::application/json"

node scripts/episodes/validate-playthrough-plan.mjs --input "$plan_path" --scene-id "$scene_id" --navigation-evidence "$navigation_path"
echo "WORLDKIT_EPISODE_STAGE playthrough-ready"
