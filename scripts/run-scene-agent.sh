#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${1:-}" == "--" ]]; then shift; fi

image_sources=()
prompt_parts=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--image)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing file path after --image." >&2
        exit 2
      fi
      image_sources+=("$1")
      ;;
    --)
      ;;
    -*)
      echo "Unsupported agent:scene option: $1" >&2
      exit 2
      ;;
    *)
      prompt_parts+=("$1")
      ;;
  esac
  shift
done

if [[ ${#prompt_parts[@]} -eq 0 ]]; then
  echo 'Usage: pnpm agent:scene -- [--image /absolute/reference.png] "<scene description>"' >&2
  exit 2
fi
prompt="${prompt_parts[*]}"

real_codex_home="${CODEX_HOME:-$HOME/.codex}"
codex_bin="$(command -v codex)"
task_tmp="$(mktemp -d /tmp/whitebox-agent.XXXXXX)"

case "$task_tmp" in
  /tmp/whitebox-agent.*) ;;
  *) echo "Unexpected isolation temp path: $task_tmp" >&2; exit 2 ;;
esac
cleanup() {
  /bin/rm -rf -- "$task_tmp"
}
trap cleanup EXIT
mkdir -p "$task_tmp/home" "$task_tmp/tmp" "$task_tmp/input"

image_args=()
image_index=0
for image_source in "${image_sources[@]}"; do
  if [[ ! -f "$image_source" || ! -r "$image_source" ]]; then
    echo "Image is not a readable regular file: $image_source" >&2
    exit 2
  fi
  if [[ -L "$image_source" ]]; then
    echo "Image inputs may not be symbolic links: $image_source" >&2
    exit 2
  fi
  extension="${image_source##*.}"
  case "$extension" in
    png|PNG|jpg|JPG|jpeg|JPEG|webp|WEBP) ;;
    *)
      echo "Unsupported image format .$extension (expected png, jpg, jpeg, or webp)." >&2
      exit 2
      ;;
  esac
  staged_image="$task_tmp/input/reference-$image_index.$extension"
  /bin/cp -- "$image_source" "$staged_image"
  /bin/chmod 0444 "$staged_image"
  image_args+=(--image "$staged_image")
  image_index=$((image_index + 1))
done

permission_args=(
  -c 'default_permissions="whitebox_workspace_only"'
  -c 'permissions.whitebox_workspace_only.extends=":workspace"'
  -c "permissions.whitebox_workspace_only.workspace_roots={\"$project_root\"=true}"
  -c "permissions.whitebox_workspace_only.filesystem={\":root\"=\"deny\", \":minimal\"=\"read\", \"/opt/homebrew\"=\"read\", \"$task_tmp\"=\"write\", \":tmpdir\"=\"deny\", \":slash_tmp\"=\"deny\"}"
  -c 'permissions.whitebox_workspace_only.network.enabled=false'
)

HOME="$task_tmp/home" \
CODEX_HOME="$real_codex_home" \
TMPDIR="$task_tmp/tmp" \
NPM_CONFIG_USERCONFIG="$task_tmp/home/.npmrc" \
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
LC_ALL=C \
LANG=C \
"$codex_bin" \
  "${permission_args[@]}" \
  --strict-config \
  --cd "$project_root" \
  --ask-for-approval never \
  exec \
  --ignore-user-config \
  --ephemeral \
  "${image_args[@]}" \
  -- \
  "$prompt"
