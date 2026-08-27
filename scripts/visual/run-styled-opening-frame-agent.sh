#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "${1:-}" == "--" ]]; then shift; fi
scene_id=""
user_frame=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; [[ $# -gt 0 ]] || exit 2; scene_id="$1" ;;
    --user-frame) shift; [[ $# -gt 0 ]] || exit 2; user_frame="$1" ;;
    --) ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done
if [[ ! "$scene_id" =~ ^[a-z0-9][a-z0-9-]{2,79}$ ]]; then
  echo "Usage: pnpm agent:world:first-frame -- --scene-id <id> [--user-frame <image>]" >&2
  exit 2
fi
if [[ "${WORLDKIT_PROMPT_SMOKE:-0}" == "1" ]]; then
  echo "WORLDKIT_FIRST_FRAME_SMOKE_OK gemini-prompt-synthesis direct-parallel-imagegen whitebox-opening user-first-frame runtime-triviews"
  exit 0
fi

artifact_root="$project_root/artifacts/scenes/$scene_id"
public_plan_root="$project_root/apps/playground/public/scene-plans/$scene_id"
for required in \
  "$artifact_root/scene-brief.md" \
  "$artifact_root/visual-identity-palette.json" \
  "$artifact_root/scene-implementation-map.json" \
  "$artifact_root/opening-frame.png" \
  "$artifact_root/runtime-snapshot.json" \
  "$artifact_root/triviews/whitebox-triview-manifest.json"; do
  [[ -s "$required" ]] || { echo "Required whitebox artifact is missing: $required" >&2; exit 3; }
done
if [[ -z "$user_frame" ]]; then
  for candidate in "$public_plan_root"/reference-0.png "$public_plan_root"/reference-0.jpg "$public_plan_root"/reference-0.webp; do
    if [[ -f "$candidate" ]]; then user_frame="$candidate"; break; fi
  done
fi
[[ -n "$user_frame" && -f "$user_frame" && ! -L "$user_frame" ]] || {
  echo "A regular user-uploaded first frame is required." >&2; exit 3;
}

pnpm_bin="$(command -v pnpm)"
echo "WORLDKIT_STAGE visual-prompt-synthesis"
python3 "$project_root/scripts/visual/run-gemini-visual-pipeline.py" \
  --scene-id "$scene_id" \
  --scene-root "$artifact_root" \
  --user-frame "$user_frame" \
  --prompt-only

echo "WORLDKIT_STAGE visual-imagegen"
python3 "$project_root/scripts/visual/run-gemini-visual-pipeline.py" \
  --scene-id "$scene_id" \
  --scene-root "$artifact_root" \
  --user-frame "$user_frame" \
  --generate-only \
  --only all

"$pnpm_bin" exec tsx scripts/visual/finalize-styled-opening-frame.ts \
  --scene-id "$scene_id" --scene-root "$artifact_root" --user-frame "$user_frame"
"$pnpm_bin" exec tsx scripts/visual/finalize-styled-triviews.ts \
  --scene-id "$scene_id" --scene-root "$artifact_root"
echo "WORLDKIT_STAGE visual-imagegen-ready"
