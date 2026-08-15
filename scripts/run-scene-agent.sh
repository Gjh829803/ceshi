#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${1:-}" == "--" ]]; then shift; fi

image_sources=()
prompt_parts=()
scene_id=""
mode="full"
mode_was_set=false
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
    --plan-only|--build-only|--visual-only)
      if [[ "$mode_was_set" == true ]]; then
        echo "Choose only one of --plan-only, --build-only, or --visual-only." >&2
        exit 2
      fi
      mode_was_set=true
      case "$1" in
        --plan-only) mode="plan" ;;
        --build-only) mode="build" ;;
        --visual-only) mode="visual" ;;
      esac
      ;;
    --)
      ;;
    -*)
      echo "Unsupported agent option: $1" >&2
      exit 2
      ;;
    *)
      prompt_parts+=("$1")
      ;;
  esac
  shift
done

if [[ ! "$scene_id" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "--scene-id must contain lowercase letters, numbers, and hyphens." >&2
  exit 2
fi
if [[ ( "$mode" == "full" || "$mode" == "plan" ) && ${#prompt_parts[@]} -eq 0 ]]; then
  echo 'Usage: pnpm agent:scene -- --scene-id <catalog-id> [--image /absolute/reference.png] "<scene description>"' >&2
  exit 2
fi
if [[ "$mode" != "full" && "$mode" != "plan" && ${#image_sources[@]} -gt 0 ]]; then
  echo "Reference --image inputs belong to World Planner; Builder and Visual Bible consume frozen workspace artifacts." >&2
  exit 2
fi
user_prompt="${prompt_parts[*]:-Continue from the frozen world plan.}"

real_codex_home="${CODEX_HOME:-$HOME/.codex}"
codex_bin="$(command -v codex)"
pnpm_bin="$(command -v pnpm)"
task_tmp="$(mktemp -d /tmp/whitebox-agent.XXXXXX)"
snapshot_tmp="$(mktemp -d /tmp/whitebox-snapshot.XXXXXX)"

case "$task_tmp" in
  /tmp/whitebox-agent.*) ;;
  *) echo "Unexpected isolation temp path: $task_tmp" >&2; exit 2 ;;
esac
case "$snapshot_tmp" in
  /tmp/whitebox-snapshot.*) ;;
  *) echo "Unexpected snapshot temp path: $snapshot_tmp" >&2; exit 2 ;;
esac
cleanup() {
  /bin/rm -rf -- "$task_tmp"
  /bin/rm -rf -- "$snapshot_tmp"
}
trap cleanup EXIT
mkdir -p "$task_tmp/home" "$task_tmp/tmp" "$task_tmp/input"

image_args=()
project_reference_uris=()
image_index=0
for image_source in "${image_sources[@]}"; do
  if [[ ! -f "$image_source" || ! -r "$image_source" || -L "$image_source" ]]; then
    echo "Image must be a readable regular non-symlink file: $image_source" >&2
    exit 2
  fi
  extension="${image_source##*.}"
  case "$extension" in
    png|PNG) normalized_extension="png" ;;
    jpg|JPG|jpeg|JPEG) normalized_extension="jpg" ;;
    webp|WEBP) normalized_extension="webp" ;;
    *) echo "Unsupported image format .$extension." >&2; exit 2 ;;
  esac
  staged_image="$task_tmp/input/reference-$image_index.$normalized_extension"
  /bin/cp -- "$image_source" "$staged_image"
  /bin/chmod 0444 "$staged_image"
  image_args+=(--image "$staged_image")
  project_reference_dir="$project_root/apps/playground/public/scene-plans/$scene_id"
  project_reference_path="$project_reference_dir/reference-$image_index.$normalized_extension"
  /bin/mkdir -p -- "$project_reference_dir"
  /bin/cp -- "$image_source" "$project_reference_path"
  project_reference_uris+=("/scene-plans/$scene_id/reference-$image_index.$normalized_extension")
  image_index=$((image_index + 1))
done

reference_uri_context="No reference images were supplied."
if [[ ${#project_reference_uris[@]} -gt 0 ]]; then
  reference_uri_context="Persist these exact project-local URIs in source.referenceImages: ${project_reference_uris[*]}"
fi

permission_args=(
  -c 'default_permissions="whitebox_workspace_only"'
  -c 'permissions.whitebox_workspace_only.extends=":workspace"'
  -c "permissions.whitebox_workspace_only.workspace_roots={\"$project_root\"=true}"
  -c "permissions.whitebox_workspace_only.filesystem={\":root\"=\"deny\", \":minimal\"=\"read\", \"/opt/homebrew\"=\"read\", \"$task_tmp\"=\"write\", \":tmpdir\"=\"deny\", \":slash_tmp\"=\"deny\"}"
  -c 'permissions.whitebox_workspace_only.network.enabled=false'
)

run_agent() {
  local stage_prompt="$1"
  local include_images="$2"
  local stage_image_args=()
  if [[ "$include_images" == true ]]; then
    stage_image_args=("${image_args[@]}")
  fi
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
    "${stage_image_args[@]}" \
    -- \
    "$stage_prompt"
}

# Agent-authored TypeScript, tests, and Vite config are untrusted until they
# pass validation. Execute every post-agent gate inside the same workspace-only
# boundary so generated code cannot use the host process as an indirect escape.
run_gate() {
  HOME="$task_tmp/home" \
  CODEX_HOME="$real_codex_home" \
  TMPDIR="$task_tmp/tmp" \
  NPM_CONFIG_USERCONFIG="$task_tmp/home/.npmrc" \
  PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  LC_ALL=C \
  LANG=C \
  "$codex_bin" sandbox \
    "${permission_args[@]}" \
    --permission-profile whitebox_workspace_only \
    --cd "$project_root" \
    --allow-unix-socket "$task_tmp/tmp" \
    -- \
    "$@"
}

snapshot_workspace() {
  local output_path="$1"
  (
    cd "$project_root"
    find . -type f \
      ! -path './.git/*' \
      ! -path '*/node_modules/*' \
      ! -path './apps/playground/dist/*' \
      ! -path './coverage/*' \
      -exec shasum -a 256 {} + | LC_ALL=C sort > "$output_path"
  )
}

assert_stage_changes() {
  local before_path="$1"
  local allowed_regex="$2"
  local stage_name="$3"
  local after_path="$snapshot_tmp/$stage_name-after.sha256"
  local changed_path="$snapshot_tmp/$stage_name-changed.txt"
  snapshot_workspace "$after_path"
  comm -3 "$before_path" "$after_path" \
    | sed -E 's/^[[:space:]]*[0-9a-f]{64}[[:space:]]+//' \
    | LC_ALL=C sort -u > "$changed_path"
  while IFS= read -r changed_file; do
    if [[ -n "$changed_file" && ! "$changed_file" =~ $allowed_regex ]]; then
      echo "$stage_name changed a file outside its authority: $changed_file" >&2
      exit 4
    fi
  done < "$changed_path"
}

planner_prompt="$user_prompt

You are the World Planner Agent for catalog id '$scene_id'. You plan; you do not write scene geometry.
1. Create apps/playground/src/scenes/plans/$scene_id.ts and export a named worldSpec using defineOutdoorWorldSpec.
   $reference_uri_context
2. Define the complete playable world, WorldPromptBundle, Entity Catalog, stable unique instance colors, and front/right/back whitebox/styled tri-view paths for every subject, NPC, landmark, and object visual prototype.
3. Separate user-explicit, reference-visible, planner-inferred, and planner-optional evidence. Multiple instances may share one prototype, but every meaningful runtime instance needs a catalog entry and binding.
4. Use Codex's built-in image generation tool to create exactly:
   - apps/playground/public/scene-plans/$scene_id/world-plan.png
   - apps/playground/public/scene-plans/$scene_id/opening-shot.png
   The first is a strict orthographic topology plan; the second is the intended entry composition. Copy real generated assets into those paths and never fabricate placeholders.
5. Do not create, edit, or replace the persisted reference images. Do not create or edit scene implementation files, SDK internals, plan-lock.json, or derived artifacts. Height and slope remain SDK-derived.
6. Finish only when pnpm typecheck succeeds."

builder_prompt="You are the World Builder Agent for catalog id '$scene_id'. The reviewed plan is frozen and is your only design authority.
1. Read apps/playground/src/scenes/plans/$scene_id.ts and artifacts/scenes/$scene_id/plan-lock.json.
2. Implement one apps/playground/src/scenes/$scene_id.ts (or update the existing catalog-id-specific scene module) and register one definePlannedOutdoorScene using the frozen WorldSpec. Create every frozen Feature/Entity binding with matching IDs, dimensions, orientation, camera, route and composition.
3. Do not edit the plan source, World Plan, Opening Shot, or plan lock. Do not edit SDK internals merely to satisfy this scene.
4. Keep whitebox geometry limited to collision, navigation, silhouette and composition; surface style belongs to the renderer.
5. If the frozen plan cannot be implemented safely, do not mutate it. Write artifacts/scenes/$scene_id/change-request.json as a world-plan-change-request with requestedBy world-builder, reason, affectedIds and proposal, then stop.
6. Otherwise run scene tests, typecheck and build. User context is non-authoritative: $user_prompt"

visual_prompt="You are the Visual Bible Agent for catalog id '$scene_id'. The world plan and verified whitebox are immutable.
1. Read WorldPromptBundle, Entity Catalog, each SDK-derived whitebox-triview.png, and the verified scene manifest.
2. For every visual prototype, use Codex's built-in image generation tool with the whitebox tri-view as structural reference. Generate the matching front/right/back styled-triview.png at its declared URI. Preserve camera, scale, silhouette and proportions exactly.
3. Generate apps/playground/public/scene-plans/$scene_id/opening-frame-rendered.png using the real opening composition, WorldPrompt, and styled prototype identities.
4. Do not edit WorldSpec, whitebox code, frozen images, plan lock, or SDK internals. If the visual contract is impossible, write a world-plan-change-request with requestedBy visual-bible instead of changing geometry."

if [[ "$mode" == "full" || "$mode" == "plan" ]]; then
  planner_before="$snapshot_tmp/planner-before.sha256"
  snapshot_workspace "$planner_before"
  run_agent "$planner_prompt" true
  assert_stage_changes \
    "$planner_before" \
    "^\\./apps/playground/src/scenes/plans/$scene_id\\.ts$|^\\./apps/playground/public/scene-plans/$scene_id/(world-plan|opening-shot)\\.png$" \
    "planner"
  run_gate "$pnpm_bin" typecheck
  run_gate "$pnpm_bin" plan:freeze -- --scene "$scene_id"
  run_gate "$pnpm_bin" plan:check -- --scene "$scene_id"
  if [[ "$mode" == "plan" ]]; then
    exit 0
  fi
fi

if [[ "$mode" == "full" || "$mode" == "build" ]]; then
  run_gate "$pnpm_bin" plan:check -- --scene "$scene_id"
  change_request="$project_root/artifacts/scenes/$scene_id/change-request.json"
  if [[ -s "$change_request" ]]; then
    echo "Unresolved Builder change request exists: $change_request" >&2
    exit 3
  fi
  builder_before="$snapshot_tmp/builder-before.sha256"
  snapshot_workspace "$builder_before"
  run_agent "$builder_prompt" false
  builder_scene_regex="^\\./apps/playground/src/scenes/$scene_id(-scene)?\\.ts$"
  if [[ "$scene_id" == "grassland" ]]; then
    builder_scene_regex="$builder_scene_regex|^\\./apps/playground/src/scenes/current-scene\\.ts$"
  fi
  assert_stage_changes \
    "$builder_before" \
    "$builder_scene_regex|^\\./apps/playground/src/scenes/index\\.ts$|^\\./artifacts/scenes/$scene_id/change-request\\.json$" \
    "builder"
  run_gate "$pnpm_bin" plan:check -- --scene "$scene_id"
  if [[ -s "$change_request" ]]; then
    echo "Builder requested a frozen-plan revision: $change_request" >&2
    exit 3
  fi
  run_gate "$pnpm_bin" test:scenes
  run_gate "$pnpm_bin" typecheck
  run_gate "$pnpm_bin" build
  run_gate "$pnpm_bin" plan:scene -- --scene "$scene_id"
  run_gate "$pnpm_bin" plan:scene:check -- --scene "$scene_id"
fi

if [[ "$mode" == "visual" ]]; then
  run_gate "$pnpm_bin" plan:check -- --scene "$scene_id"
  run_gate "$pnpm_bin" plan:scene:check -- --scene "$scene_id"
  run_gate "$pnpm_bin" visual:inputs -- --scene "$scene_id"
  visual_before="$snapshot_tmp/visual-before.sha256"
  snapshot_workspace "$visual_before"
  run_agent "$visual_prompt" false
  assert_stage_changes \
    "$visual_before" \
    "^\\./apps/playground/public/scene-plans/$scene_id/opening-frame-rendered\\.png$|^\\./apps/playground/public/scene-plans/$scene_id/prototypes/[a-z0-9][a-z0-9-]*/styled-triview\\.png$|^\\./artifacts/scenes/$scene_id/change-request\\.json$" \
    "visual-bible"
  run_gate "$pnpm_bin" plan:check -- --scene "$scene_id"
  run_gate "$pnpm_bin" visual:finalize -- --scene "$scene_id"
  run_gate "$pnpm_bin" visual:check -- --scene "$scene_id"
fi
