#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${1:-}" == "--" ]]; then shift; fi
scene_id=""
whitebox_video=""
user_frame=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; [[ $# -gt 0 ]] || exit 2; scene_id="$1" ;;
    --whitebox-video) shift; [[ $# -gt 0 ]] || exit 2; whitebox_video="$1" ;;
    --user-frame) shift; [[ $# -gt 0 ]] || exit 2; user_frame="$1" ;;
    --) ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ ! "$scene_id" =~ ^[a-z0-9][a-z0-9-]{2,79}$ || -z "$whitebox_video" ]]; then
  echo "Usage: pnpm agent:world:video-prompt -- --scene-id <id> --whitebox-video <recording> [--user-frame <image>]" >&2
  exit 2
fi
if [[ "${WORLDKIT_PROMPT_SMOKE:-0}" == "1" ]]; then
  echo "WORLDKIT_VIDEO_PROMPT_SMOKE_OK explicit-manual-video existing-styled-opening prompt-template"
  exit 0
fi

artifact_root="$project_root/artifacts/scenes/$scene_id"
public_plan_root="$project_root/apps/playground/public/scene-plans/$scene_id"
for required in \
  "$artifact_root/scene-brief.md" \
  "$artifact_root/scene-implementation-map.json" \
  "$artifact_root/opening-frame.png" \
  "$artifact_root/runtime-snapshot.json" \
  "$artifact_root/triviews/capture-targets.json" \
  "$artifact_root/styled-opening-frame.png" \
  "$artifact_root/styled-opening-frame-manifest.json" \
  "$artifact_root/styled-opening-frame-report.json"; do
  [[ -s "$required" ]] || { echo "Completed first-frame artifact is missing: $required" >&2; exit 3; }
done

if [[ -z "$user_frame" ]]; then
  for candidate in "$public_plan_root"/reference-0.png "$public_plan_root"/reference-0.jpg "$public_plan_root"/reference-0.webp; do
    if [[ -f "$candidate" ]]; then user_frame="$candidate"; break; fi
  done
fi
[[ -n "$user_frame" && -f "$user_frame" && ! -L "$user_frame" ]] || {
  echo "The original user-uploaded first frame is required." >&2; exit 3;
}

node_bin="$(command -v node)"
pnpm_bin="$(command -v pnpm)"
temporary_root="$project_root/.codex-tmp"
mkdir -p "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/video-prompt.XXXXXX")"
cleanup() {
  case "$task_tmp" in "$temporary_root"/video-prompt.*) /bin/rm -rf -- "$task_tmp" ;; esac
}
trap cleanup EXIT
mkdir -p "$task_tmp/runtime"
cloud_run_nonce="$(date -u +%Y%m%d-%H%M%S)-$$"
cloud_s3_root="${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}"
cloud_run_prefix="${cloud_s3_root%/}/$scene_id/$cloud_run_nonce/video-prompt"

echo "WORLDKIT_VIDEO_STAGE reference-ingest"
"$node_bin" scripts/prepare-visual-reconstruction.mjs \
  --scene-id "$scene_id" --scene-root "$artifact_root" \
  --video "$whitebox_video" --user-frame "$user_frame" \
  --opening-frame "$artifact_root/opening-frame.png" \
  --triview-manifest "$artifact_root/triviews/capture-targets.json"

copied_user_frame=""
for candidate in "$artifact_root"/user-first-frame.png "$artifact_root"/user-first-frame.jpg "$artifact_root"/user-first-frame.webp; do
  if [[ -f "$candidate" ]]; then copied_user_frame="$candidate"; break; fi
done
[[ -n "$copied_user_frame" ]] || { echo "Prepared user first frame is missing." >&2; exit 5; }

prompt_asset_args=(
  --asset "motion-contact-sheet::$artifact_root/whitebox-motion-contact-sheet.png::image::image/png"
  --asset "runtime-opening-frame::$artifact_root/opening-frame.png::image::image/png"
  --asset "user-first-frame::$copied_user_frame::image::image/png"
  --asset "styled-opening-frame::$artifact_root/styled-opening-frame.png::image::image/png"
)
triview_index=0
while IFS= read -r triview_path; do
  if [[ -n "$triview_path" ]]; then
    prompt_asset_args+=(--asset "runtime-triview-$triview_index::$triview_path::image::image/png")
    triview_index=$((triview_index + 1))
  fi
done < <("$node_bin" scripts/list-visual-triview-inputs.mjs --scene-root "$artifact_root" --limit 5)

echo "WORLDKIT_VIDEO_STAGE prompt-synthesis"
prompt_fields_prompt="You are the conservative Video Prompt Field Analyst for '$scene_id'. Write exactly artifacts/scenes/$scene_id/video-prompt-fields.json and no other file.

This is an explicitly user-triggered post-completion action. The automatic world workflow already ended at styled-opening-frame.png. Read scene-brief.md and visual-reference-manifest.draft.json. Attachments are: a 12-frame contact sheet from the user's manually recorded whitebox video, actual runtime opening frame, original user first frame, completed styled opening frame, then selected runtime tri-views.

Write kind worldkit-video-prompt-fields, schemaVersion 1, sceneId '$scene_id', and only:
- finalScene: location, timeOfDay, weather, groundAndWallMaterials, keyLightDirection, colorTemperature, visualStyle.
- action: only motion visibly supported by the recorded contact sheet; never add a main action.
- cinematography: lens 35mm or 50mm; movement one of 手持跟拍/轨道推进/弧形环绕/跟随镜头/固定机位; notes must preserve the video as authority.
- additionalRestrictions: scene-specific identity or silhouette restrictions only.

Do not write the final prompt or change the fixed reference-authority template."
prompt_log="$task_tmp/prompt-fields.log"
prompt_fields_file="$task_tmp/video-prompt-fields.prompt.txt"
printf '%s\n' "$prompt_fields_prompt" > "$prompt_fields_file"
"$node_bin" scripts/run-lwdp-codex-task.mjs \
  --repo-root "$project_root" \
  --execution-profile formal \
  --task-id "video-prompt-$cloud_run_nonce" \
  --stage prompt-synthesis \
  --job-name "WorldKit Video Prompt · $scene_id" \
  --request-id "$scene_id-video-prompt-$cloud_run_nonce" \
  --output-s3-prefix "$cloud_run_prefix/analysis" \
  --instruction-file "$prompt_fields_file" \
  --context "artifacts/scenes/$scene_id/scene-brief.md" \
  --context "artifacts/scenes/$scene_id/visual-reference-manifest.draft.json" \
  "${prompt_asset_args[@]}" \
  --output "artifacts/scenes/$scene_id/video-prompt-fields.json::$artifact_root/video-prompt-fields.json::application/json" \
  2>&1 | /usr/bin/tee "$prompt_log"

prompt_repair_limit="${WORLDKIT_PROMPT_REPAIR_LIMIT:-2}"
[[ "$prompt_repair_limit" =~ ^[0-4]$ ]] || { echo "WORLDKIT_PROMPT_REPAIR_LIMIT must be in [0, 4]." >&2; exit 2; }
prompt_gate_log="$task_tmp/prompt-gate.log"
prompt_repair_attempt=0
until "$pnpm_bin" exec tsx scripts/finalize-video-generation-prompt.ts \
    --scene-root "$artifact_root" \
    --manifest-draft "$artifact_root/visual-reference-manifest.draft.json" \
    --fields "$artifact_root/video-prompt-fields.json" 2>&1 | /usr/bin/tee "$prompt_gate_log"; do
  if (( prompt_repair_attempt >= prompt_repair_limit )); then
    echo "Prompt fields exhausted $prompt_repair_limit trusted repairs." >&2
    exit 2
  fi
  prompt_repair_attempt=$((prompt_repair_attempt + 1))
  echo "WORLDKIT_VIDEO_PROMPT_REPAIR $prompt_repair_attempt"
  repair_prompt="Repair only artifacts/scenes/$scene_id/video-prompt-fields.json for the trusted diagnostics below. Preserve all reference authority, add no main action, and use only the requested closed enums and bounded fields. Do not modify any image, manifest, plan, world artifact, template or source code.

TRUSTED DIAGNOSTICS:
$(<"$prompt_gate_log")"
  repair_log="$task_tmp/prompt-repair-$prompt_repair_attempt.log"
  repair_prompt_file="$task_tmp/video-prompt-repair-$prompt_repair_attempt.prompt.txt"
  printf '%s\n' "$repair_prompt" > "$repair_prompt_file"
  "$node_bin" scripts/run-lwdp-codex-task.mjs \
    --repo-root "$project_root" \
    --execution-profile formal \
    --task-id "video-prompt-repair-$prompt_repair_attempt-$cloud_run_nonce" \
    --stage prompt-synthesis \
    --job-name "WorldKit Video Prompt Repair $prompt_repair_attempt · $scene_id" \
    --request-id "$scene_id-video-prompt-repair-$prompt_repair_attempt-$cloud_run_nonce" \
    --output-s3-prefix "$cloud_run_prefix/repair-$prompt_repair_attempt" \
    --instruction-file "$repair_prompt_file" \
    --context "artifacts/scenes/$scene_id/scene-brief.md" \
    --context "artifacts/scenes/$scene_id/visual-reference-manifest.draft.json" \
    --context "artifacts/scenes/$scene_id/video-prompt-fields.json" \
    "${prompt_asset_args[@]}" \
    --output "artifacts/scenes/$scene_id/video-prompt-fields.json::$artifact_root/video-prompt-fields.json::application/json" \
    2>&1 | /usr/bin/tee "$repair_log"
done

echo "WORLDKIT_VIDEO_PROMPT_READY"
