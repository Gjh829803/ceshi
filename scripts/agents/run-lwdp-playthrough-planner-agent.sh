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
  "$public_root/world-plan.png"; do
  [[ -f "$required" && -s "$required" && ! -L "$required" ]] || {
    echo "Required playthrough evidence is missing or unsafe: $required" >&2
    exit 3
  }
done

if [[ -z "${WORLDKIT_LWDP_ENV_FILE:-}" && -f "$project_root/.codex-tmp/runtime-config/lwdp.env" ]]; then
  export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
fi

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

Plan exactly one 90-second episode for scene '$scene_id'. The Host already ran real Runtime reconnaissance. Read every declared context file and inspect every attached whitebox/reconnaissance image before deciding the route, inputs, camera, or Seedance Prompt Events.
Treat reconnaissance Snapshot V4 positions and movementEvidence as route authority. Never infer that a visible gap is passable when the measured probe is null, blocked, or stalled; near large obstacles use short approaches with retreat and lateral reorientation instead of long blind forward holds.

Write only:
- $relative_episode_root/planning/playthrough-plan.json

The plan id is '$episode_id-plan', sceneId is '$scene_id', seed is 731991, durationSeconds is 90, simulationTickRate is 60, captureFrameRate is 24, frameCount is 2160, and worldPackageRootHash may be 'unavailable'. Use the controlledEntityId from reconnaissance-report.json.

The three Seedance Prompt Events are renderer instructions for later generated videos. They do not modify the whitebox Runtime. Each must be derived from this actual scene and synchronized with the planned player action at its selected time. Do not reuse generic examples.
Choose each Event as a familiar, scene-grounded phenomenon or transformation that an ordinary player can name immediately. Do not invent abstract sky rings, halos, portals, geometric canopies, magnetic curtains, energy ribbons, glyphs, light tunnels, generic particle streams, or unexplained color washes merely to look novel or satisfy scope diversity.

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
task_id="playthrough-$episode_hash"
echo "WORLDKIT_EPISODE_STAGE playthrough-planning"
node scripts/agents/run-codex-task.mjs \
  --backend "$backend" \
  --repo-root "$project_root" \
  --task-id "$task_id" \
  --stage playthrough-planner \
  --job-name "WorldKit Playthrough Planner · $scene_id" \
  --request-id "$episode_id-playthrough-plan-v1" \
  --output-s3-prefix "${cloud_root%/}/episodes/$episode_id/playthrough-plan-v1" \
  --instruction-file "$instruction_file" \
  --execution-profile formal \
  --timeout-seconds 1800 \
  --context ".codex/skills/worldkit-playthrough-planner" \
  --context "scripts/lib/playthrough-dataset.mjs" \
  --context "artifacts/scenes/$scene_id/scene-brief.md" \
  --context "artifacts/scenes/$scene_id/authoring.json" \
  --context "artifacts/scenes/$scene_id/world.mjs" \
  --context "artifacts/scenes/$scene_id/runtime-snapshot.json" \
  --context "artifacts/scenes/$scene_id/visual-identity-palette.json" \
  --context "artifacts/scenes/$scene_id/triviews/whitebox-triview-manifest.json" \
  --context "$relative_recon_root/reconnaissance-report.json" \
  "${asset_args[@]}" \
  --output "$relative_episode_root/planning/playthrough-plan.json::$plan_path::application/json"

node scripts/episodes/validate-playthrough-plan.mjs --input "$plan_path" --scene-id "$scene_id"
echo "WORLDKIT_EPISODE_STAGE playthrough-ready"
