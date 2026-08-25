#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${1:-}" == "--" ]]; then shift; fi
scene_id=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; [[ $# -gt 0 ]] || exit 2; scene_id="$1" ;;
    --) ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done
if [[ ! "$scene_id" =~ ^[a-z0-9][a-z0-9-]{2,79}$ ]]; then
  echo "Usage: pnpm agent:world:styled-triviews -- --scene-id <id>" >&2
  exit 2
fi
if [[ "${WORLDKIT_PROMPT_SMOKE:-0}" == "1" ]]; then
  echo "WORLDKIT_STYLED_TRIVIEWS_SMOKE_OK styled-opening-frame whitebox-triviews no-playtest"
  exit 0
fi

artifact_root="$project_root/artifacts/scenes/$scene_id"
for required in \
  "$artifact_root/visual-generation-prompts.json" \
  "$artifact_root/styled-opening-frame.png" \
  "$artifact_root/triviews/whitebox-triview-manifest.json"; do
  [[ -s "$required" ]] || { echo "Required styled tri-view input is missing: $required" >&2; exit 3; }
done

pnpm_bin="$(command -v pnpm)"
user_frame="$artifact_root/user-first-frame.png"
if [[ ! -s "$user_frame" ]]; then
  user_frame="$(find "$artifact_root" -maxdepth 1 -type f -name 'user-first-frame.*' -print -quit)"
fi
[[ -n "$user_frame" && -s "$user_frame" ]] || { echo "Stored user first frame is missing." >&2; exit 3; }

echo "WORLDKIT_STAGE visual-imagegen"
python3 "$project_root/scripts/run-gemini-visual-pipeline.py" \
  --scene-id "$scene_id" \
  --scene-root "$artifact_root" \
  --user-frame "$user_frame" \
  --generate-only \
  --only triviews
"$pnpm_bin" exec tsx scripts/finalize-styled-triviews.ts \
  --scene-id "$scene_id" --scene-root "$artifact_root"
echo "WORLDKIT_STAGE visual-imagegen-ready"
