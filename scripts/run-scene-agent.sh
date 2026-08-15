#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${1:-}" == "--" ]]; then shift; fi

image_sources=()
prompt_parts=()
scene_id=""
plan_only=false
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
    --scene-id)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing catalog id after --scene-id." >&2
        exit 2
      fi
      scene_id="$1"
      ;;
    --plan-only)
      plan_only=true
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
  echo 'Usage: pnpm agent:scene -- --scene-id <catalog-id> [--plan-only] [--image /absolute/reference.png] "<scene description>"' >&2
  exit 2
fi
if [[ ! "$scene_id" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "--scene-id must contain lowercase letters, numbers, and hyphens." >&2
  exit 2
fi
prompt="${prompt_parts[*]}"

if [[ "$plan_only" == true ]]; then
  workflow_instruction="Stop after creating and validating WorldSpec plus the two Codex imagegen planning images. Do not implement or register scene geometry."
else
  workflow_instruction="After the planning assets exist, implement and register the scene with definePlannedOutdoorScene, then compare the actual SDK planning captures against the intended plan and correct material spatial differences."
fi

prompt="$prompt

Mandatory plan-first workflow for catalog id '$scene_id':
1. Before writing scene geometry, create apps/playground/src/scenes/plans/$scene_id.ts with defineOutdoorWorldSpec. Preserve user-explicit, reference-visible, planner-inferred, and planner-optional claims separately.
2. Define the whole playable world: bounds, relief, terrain regions, water, landmarks, primary routes, entry spawn, facing, camera pitch/distance/FOV, and foreground/middleground/background composition.
3. Use Codex's built-in image generation tool, not a custom API script, to generate exactly two project assets from the prompts stored in WorldSpec:
   - apps/playground/public/scene-plans/$scene_id/world-plan.png: strict orthographic top-down topology plan.
   - apps/playground/public/scene-plans/$scene_id/opening-shot.png: the intended player entry composition.
   Copy the final generated images into those workspace paths. Never invent placeholder bytes or claim generation succeeded if the image tool is unavailable.
4. Height/slope planning is SDK-derived from the built terrain; do not ask image generation to invent walkability.
5. $workflow_instruction
6. Keep whitebox geometry limited to logic, navigation, collision, silhouette, and composition. Leave texture, flowers, clouds, painterly style, and other surface detail to the world model.
7. Do not edit SDK internals merely to satisfy this scene."

real_codex_home="${CODEX_HOME:-$HOME/.codex}"
codex_bin="$(command -v codex)"
pnpm_bin="$(command -v pnpm)"
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

if [[ "$plan_only" == true ]]; then
  "$pnpm_bin" typecheck
  "$pnpm_bin" exec tsx -e "import('./apps/playground/src/scenes/plans/$scene_id.ts')"
  for planned_image in world-plan.png opening-shot.png; do
    planned_path="$project_root/apps/playground/public/scene-plans/$scene_id/$planned_image"
    if [[ ! -s "$planned_path" ]]; then
      echo "Missing or empty planning image: $planned_path" >&2
      exit 1
    fi
  done
else
  "$pnpm_bin" test:scenes
  "$pnpm_bin" typecheck
  "$pnpm_bin" build
  "$pnpm_bin" plan:scene -- --scene "$scene_id"
  "$pnpm_bin" plan:scene:check -- --scene "$scene_id"
fi
