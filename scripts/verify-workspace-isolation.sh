#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
outside_probe="$(dirname "$project_root")"
real_home="$HOME"
codex_bin="$(command -v codex)"
pnpm_bin="/opt/homebrew/bin/pnpm"
task_tmp="$(mktemp -d /tmp/whitebox-agent.XXXXXX)"

case "$task_tmp" in
  /tmp/whitebox-agent.*) ;;
  *) echo "Unexpected isolation temp path: $task_tmp" >&2; exit 2 ;;
esac
cleanup() {
  /bin/rm -rf -- "$task_tmp"
}
trap cleanup EXIT

mkdir -p "$task_tmp/home" "$task_tmp/tmp"
if [[ ! -x "$pnpm_bin" ]]; then
  echo "Expected the isolated Node toolchain at $pnpm_bin" >&2
  exit 2
fi
if find "$project_root/apps/playground/public" -type l -print -quit | grep -q .; then
  echo "FAIL: runtime assets may not be external symlinks." >&2
  exit 1
fi

permission_args=(
  -c 'default_permissions="whitebox_workspace_only"'
  -c 'permissions.whitebox_workspace_only.extends=":workspace"'
  -c "permissions.whitebox_workspace_only.workspace_roots={\"$project_root\"=true}"
  -c "permissions.whitebox_workspace_only.filesystem={\":root\"=\"deny\", \":minimal\"=\"read\", \"/opt/homebrew\"=\"read\", \"$task_tmp\"=\"write\", \":tmpdir\"=\"deny\", \":slash_tmp\"=\"deny\"}"
  -c 'permissions.whitebox_workspace_only.network.enabled=false'
)

HOME="$task_tmp/home" \
TMPDIR="$task_tmp/tmp" \
NPM_CONFIG_USERCONFIG="$task_tmp/home/.npmrc" \
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
LC_ALL=C \
LANG=C \
"$codex_bin" sandbox \
  "${permission_args[@]}" \
  --permission-profile whitebox_workspace_only \
  --cd "$project_root" \
  -- \
  bash -c '
    set -euo pipefail
    test -r package.json
    probe="apps/playground/src/scenes/.isolation-write-probe"
    trap '\''rm -f "$probe"'\'' EXIT
    touch "$probe"
    if ls "$1" >/dev/null 2>&1; then
      echo "FAIL: sandbox could list a directory outside the workspace: $1" >&2
      exit 1
    fi
    if ls "$2" >/dev/null 2>&1; then
      echo "FAIL: sandbox could list the user home directory: $2" >&2
      exit 1
    fi
    "$3" test:scenes
    echo "PASS: scene authoring works and outside user directories are denied."
  ' _ "$outside_probe" "$real_home" "$pnpm_bin"
