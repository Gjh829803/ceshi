#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${1:-}" == "--" ]]; then
  shift
fi
source_path="${1:-${WHITEBOX_HUMANOID_GLB:-}}"
target_dir="$project_dir/apps/playground/public/local-assets"
target_path="$target_dir/Xbot.glb"

if [[ -z "$source_path" ]]; then
  echo "Usage: pnpm import:local-humanoid -- /absolute/path/to/mixamo-compatible.glb" >&2
  exit 2
fi

if [[ ! -f "$source_path" ]]; then
  echo "Humanoid GLB does not exist: $source_path" >&2
  exit 2
fi

mkdir -p "$target_dir"
staged_path="$(mktemp "$target_dir/.Xbot.glb.XXXXXX")"
trap 'rm -f "$staged_path"' EXIT
cp "$source_path" "$staged_path"
mv -f "$staged_path" "$target_path"
trap - EXIT
echo "Imported a workspace-local humanoid copy: $target_path"
