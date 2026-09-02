#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
scene_id=""; episode_id=""; episode_root=""; attempt="1"; review="1"
style_variant_ids=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; scene_id="${1:-}" ;;
    --episode-id) shift; episode_id="${1:-}" ;;
    --episode-root) shift; episode_root="${1:-}" ;;
    --style-variant-id) shift; style_variant_ids+=("${1:-}") ;;
    --attempt) shift; attempt="${1:-}" ;;
    --skip-review) review="0" ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done
id_pattern='^[a-z0-9][a-z0-9-]{2,119}$'
[[ "$scene_id" =~ $id_pattern && "$episode_id" =~ $id_pattern ]] || exit 2
[[ "$attempt" =~ ^[1-3]$ ]] || exit 2
[[ "${#style_variant_ids[@]}" -ge 1 && "${#style_variant_ids[@]}" -le 2 ]] || {
  echo "Local visual smoke requires one or two --style-variant-id values." >&2
  exit 2
}
episode_root="$(cd "$(dirname "$episode_root")" && pwd)/$(basename "$episode_root")"
overall_status=0
for style_variant_id in "${style_variant_ids[@]}"; do
  [[ "$style_variant_id" =~ ^style-0[0-9]$ ]] || exit 2
  printf 'WORLDKIT_STYLE_VISUAL_SMOKE variant=%s stage=reconstruct running\n' "$style_variant_id"
  bash scripts/agents/run-lwdp-style-variant-visual-agent.sh \
    --scene-id "$scene_id" --episode-id "$episode_id" \
    --episode-root "$episode_root" --style-variant-id "$style_variant_id" \
    --backend local --attempt "$attempt"
  printf 'WORLDKIT_STYLE_VISUAL_SMOKE variant=%s stage=reconstruct complete\n' "$style_variant_id"
  if [[ "$review" == "1" ]]; then
    printf 'WORLDKIT_STYLE_VISUAL_SMOKE variant=%s stage=review running\n' "$style_variant_id"
    set +e
    bash scripts/agents/run-lwdp-style-variant-reviewer-agent.sh \
      --scene-id "$scene_id" --episode-id "$episode_id" \
      --episode-root "$episode_root" --style-variant-id "$style_variant_id" \
      --backend local --attempt "$attempt"
    status=$?
    set -e
    if [[ "$status" -ne 0 && "$status" -ne 10 ]]; then exit "$status"; fi
    if [[ "$status" -eq 10 ]]; then overall_status=10; fi
    printf 'WORLDKIT_STYLE_VISUAL_SMOKE variant=%s stage=review complete status=%s\n' \
      "$style_variant_id" "$status"
  fi
done
exit "$overall_status"
