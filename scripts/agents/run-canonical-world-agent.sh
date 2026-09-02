#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "${1:-}" == "--" ]]; then shift; fi

scene_id=""
scene_source=""
mode="full"
mode_was_set=false
image_sources=()
prompt_parts=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-source)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value after --scene-source." >&2; exit 2; }
      scene_source="$1"
      ;;
    --scene-id)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value after --scene-id." >&2; exit 2; }
      scene_id="$1"
      ;;
    -i|--image)
      shift
      [[ $# -gt 0 ]] || { echo "Missing file after --image." >&2; exit 2; }
      image_sources+=("$1")
      ;;
    --plan-only|--build-only)
      [[ "$mode_was_set" == false ]] || { echo "Choose one execution mode." >&2; exit 2; }
      mode_was_set=true
      [[ "$1" == "--plan-only" ]] && mode="plan" || mode="build"
      ;;
    --) ;;
    -*) echo "Unsupported option: $1" >&2; exit 2 ;;
    *) prompt_parts+=("$1") ;;
  esac
  shift
done

if [[ "$scene_source" != "canonical" && "$scene_source" != "babylon-native" ]]; then
  echo "--scene-source must be canonical or babylon-native." >&2
  exit 2
fi
if [[ ! "$scene_id" =~ ^[a-z0-9][a-z0-9-]{2,79}$ ]]; then
  echo "--scene-id must be 3-80 lowercase letters, numbers, or hyphens." >&2
  exit 2
fi
if [[ "$scene_source" == "babylon-native" && "$mode" != "plan" ]]; then
  echo "Babylon Native may use this internal Planner launcher only with --plan-only." >&2
  exit 2
fi
if [[ ( "$mode" == "full" || "$mode" == "plan" ) && ${#prompt_parts[@]} -eq 0 ]]; then
  echo 'Usage: pnpm agent:world -- --scene-source canonical --scene-id <id> [--image <file>] "<world request>"' >&2
  exit 2
fi
if [[ "$mode" == "build" && ${#image_sources[@]} -gt 0 ]]; then
  echo "--build-only consumes the existing Scene Brief and staged references." >&2
  exit 2
fi
user_prompt="${prompt_parts[*]:-Implement the existing Scene Brief.}"

if [[ "${WORLDKIT_PROMPT_SMOKE:-0}" == "1" ]]; then
  echo "WORLDKIT_PROMPT_SMOKE_OK planner coding-agent terrain-compilation canonical-build runtime-capture visual-prompt-synthesis visual-imagegen"
  exit 0
fi

pnpm_bin="$(command -v pnpm)"
node_bin="$(command -v node)"
artifact_root="$project_root/artifacts/scenes/$scene_id"
public_plan_root="$project_root/apps/playground/public/scene-plans/$scene_id"
temporary_root="$project_root/.codex-tmp"
mkdir -p "$artifact_root" "$public_plan_root" "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/spatial-agent.XXXXXX")"
authoring_attempt_started=false
authoring_attempt_completed=false
authoring_attempt_path=""
authoring_attempt_result_path=""
cleanup() {
  exit_status=$?
  if [[ "$authoring_attempt_started" == true && "$authoring_attempt_completed" == false && -s "$authoring_attempt_path" ]]; then
    "$pnpm_bin" exec tsx scripts/scenes/record-scene-authoring-attempt.ts reject \
      --scene-id "$scene_id" \
      --run-id "$codex_run_nonce" \
      --attempt "$authoring_attempt_path" \
      --outcome rejected \
      --diagnostic-ref "worldkit://diagnostic/hosted-canonical-authoring-rejected@1" \
      --result-output "$authoring_attempt_result_path" >/dev/null 2>&1 || true
  fi
  case "$task_tmp" in "$temporary_root"/spatial-agent.*) /bin/rm -rf -- "$task_tmp" ;; esac
  return "$exit_status"
}
trap cleanup EXIT
mkdir -p "$task_tmp/input" "$task_tmp/runtime"
codex_backend="${WORLDKIT_CODEX_BACKEND:-cloud}"
[[ "$codex_backend" == "cloud" || "$codex_backend" == "local" ]] || {
  echo "WORLDKIT_CODEX_BACKEND must be cloud or local." >&2; exit 2;
}
codex_run_nonce="$(date -u +%Y%m%d-%H%M%S)-$$"
cloud_s3_root="${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}"
codex_output_prefix="${cloud_s3_root%/}/$scene_id/$codex_run_nonce"
reference_asset_args=()
reference_index=0
if [[ ${#image_sources[@]} -gt 0 ]]; then
  for source_path in "${image_sources[@]}"; do
    if [[ ! -f "$source_path" || ! -r "$source_path" || -L "$source_path" ]]; then
      echo "Reference must be a readable regular non-symlink file: $source_path" >&2
      exit 2
    fi
    extension="${source_path##*.}"
    case "$extension" in
      png|PNG) extension="png" ;;
      jpg|JPG|jpeg|JPEG) extension="jpg" ;;
      webp|WEBP) extension="webp" ;;
      *) echo "Unsupported reference image format: .$extension" >&2; exit 2 ;;
    esac
    staged_path="$task_tmp/input/reference-$reference_index.$extension"
    public_path="$public_plan_root/reference-$reference_index.$extension"
    /bin/cp -- "$source_path" "$staged_path"
    /bin/chmod 0444 "$staged_path"
    /bin/cp -- "$source_path" "$public_path"
    media_type="image/$extension"
    [[ "$extension" == "jpg" ]] && media_type="image/jpeg"
    reference_asset_args+=(--asset "reference-$reference_index::$staged_path::image::$media_type")
    reference_index=$((reference_index + 1))
  done
fi

run_codex() {
  "$node_bin" scripts/agents/run-codex-task.mjs --backend "$codex_backend" --repo-root "$project_root" "$@" --execution-profile formal
}

planner_prompt="$user_prompt

You are the unified WorldKit Planner for world '$scene_id'. The Host selected the '$scene_source' closed output profile. Use .codex/skills/worldkit-spatial-planner/SKILL.md as the hosted preview-planning guide. Keep user facts, visible reference evidence, inferred continuation, and render-only ideas in the four separate provenance sections required by current main. Name exactly one standard or custom movement mode, but describe the complete controlled shape and movement behavior only in plain language: Planner does not select Subject Definitions, Subject Assets, Runtime Bundles, rigs, clips, colliders, or motion resources. Treat the opening frame only as an entry slice and describe entry, middle, remote, and off-camera exploration areas appropriate to the request without empty map padding; do not use a fixed play-time or perimeter target. Define 1-5 visual targets as whole targets beginning with the complete controlled subject; never pad or split targets. The top-down image must show the complete reference-consistent world geography, the initial-subject marker, and the traversable domain/path, not merely the entry-frame crop. The entry target is non-authoritative composition intent, not runtime whitebox evidence. The complete red primary Subject, its main body/pilot, and visual mass center are exactly on the 50% image-width vertical centerline. Near-center, any slight left/right bias, diagonal rear, three-quarter rear, shoulder, or side composition is invalid. Use the same bright neutral clear daytime inspection lighting for every case and neutralize everything except the skill's fixed target-order identity colors. Do not delegate to another Image Planner or external API. Do not create JSON, coordinates, dimensions, geometry, route graphs, or AuthoringSpec."

if [[ "$scene_source" == "canonical" ]]; then
  planner_prompt="$planner_prompt

Create exactly five semantic outputs: artifacts/scenes/$scene_id/scene-brief.md, artifacts/scenes/$scene_id/terrain-height-intent-prompt.md, apps/playground/public/scene-plans/$scene_id/world-plan.png, apps/playground/public/scene-plans/$scene_id/entry-whitebox-target.png, and apps/playground/public/scene-plans/$scene_id/terrain-height-intent.png. Write the Brief and World Plan first, expand and save the exact terrain prompt from the Skill reference, then use Codex's built-in image generation tool to generate all three PNGs from those same decisions and the attached user reference images. Height Intent uses the World Plan as its orientation and complete-world coordinate frame, and may use only a compatible accepted exemplar as encoding-style-only reference.

Before finishing, run this bundled self-check from the extracted workspace:
node .codex/skills/worldkit-spatial-planner/scripts/self-check.mjs --scene-source canonical --scene-id '$scene_id' --brief artifacts/scenes/$scene_id/scene-brief.md --world-plan apps/playground/public/scene-plans/$scene_id/world-plan.png --entry apps/playground/public/scene-plans/$scene_id/entry-whitebox-target.png --terrain-prompt artifacts/scenes/$scene_id/terrain-height-intent-prompt.md --terrain-intent apps/playground/public/scene-plans/$scene_id/terrain-height-intent.png --report artifacts/scenes/$scene_id/planner-self-check.json
If it exits nonzero, read its JSON diagnostics, repair the five semantic Planner outputs inside this same task, and run it again."
else
  planner_prompt="$planner_prompt

Create exactly three semantic outputs: artifacts/scenes/$scene_id/scene-brief.md, apps/playground/public/scene-plans/$scene_id/world-plan.png, and apps/playground/public/scene-plans/$scene_id/entry-whitebox-target.png. Write the Brief and World Plan first, then use Codex's built-in image generation tool to generate the two PNGs from those same decisions and the attached user reference images. This Babylon Native Source profile must not create Height Intent, a Height Intent prompt, terrain samples, or another terrain proposal; the Native Builder owns block geometry after planning.

Before finishing, run this bundled self-check from the extracted workspace:
node .codex/skills/worldkit-spatial-planner/scripts/self-check.mjs --scene-source babylon-native --scene-id '$scene_id' --brief artifacts/scenes/$scene_id/scene-brief.md --world-plan apps/playground/public/scene-plans/$scene_id/world-plan.png --entry apps/playground/public/scene-plans/$scene_id/entry-whitebox-target.png --report artifacts/scenes/$scene_id/planner-self-check.json
If it exits nonzero, read its JSON diagnostics, repair the three semantic Planner outputs inside this same task, and run it again."
fi

planner_prompt="$planner_prompt
Use at most three self-repair cycles. Finish only when planner-self-check.json has status 'passed'. The trusted Host only replays the same check once after delivery; it does not start a separate Repair Agent."

builder_prompt="You are the Canonical World Builder for '$scene_id'. Read artifacts/scenes/$scene_id/scene-brief.md, artifacts/scenes/$scene_id/visual-identity-palette.json, artifacts/scenes/$scene_id/terrain-height-intent-prompt.md, and the three planner images. Convert their intent into pre-terrain Canonical AuthoringSpec V4 at artifacts/scenes/$scene_id/authoring.builder.json. Also create artifacts/scenes/$scene_id/implementation-map.draft.json. Inspect Height Intent for topology and choose coherent bounds, grid resolution, height range, baseHeightMeters datum, placements, and constraints, but do not decode, resample, normalize, or edit its pixels; the trusted Host owns that compilation into final authoring.json.

Use .codex/skills/worldkit-canonical-builder/SKILL.md and every reference it marks required as the authoring guide for this hosted path. The Planner does not provide coordinates or geometry: you own practical bounds, scale, terrain, support surfaces, routes when explicitly restricted, placements, collision, camera numbers, and exact resource selection. Implement the complete world rather than only the opening view. Every generated whitebox AuthoringSpec must set world.environment.preset to clear-day. Size meaningful entry, middle, remote, and off-camera areas from the request, evidence, resource budget and terrain-cell guidance; do not use a fixed play-time estimate. The real Babylon opening must be a strict centered rear view: spawn yaw 0 toward canonical -Z, controlled Subject targeted by the camera, zero lateral/yaw offset, camera directly behind the Subject, and primary visual mass on the image vertical centerline. For every ground-supported movement mode, put the capsule feet on an actual support surface. Never rely on runtime falling/recovery. Preserve the brief's requested movement semantics in Subject metadata; execute it exactly when a compatible implemented Registry closure exists, otherwise use the Skill's disclosed playable approximation without deleting the world or controlled silhouette. Keep open land fully traversable outside collision blockers and do not invent routes.

Capability and resource-budget requirements are hard. Shape and movement are independent decisions: use the modular humanoid G Bot @2 for an ordinary person, or create one package-local controlled Subject from exact registered Subject Assets and/or primitive visualParts when the planned complete silhouette is custom. A named Registry Subject is a shortcut, not a whitelist, and absence of a same-named preset is never a reason to omit the world. Select an exact registered movement closure only when the current Registry and bundled validator accept its complete closure without reserved relationships. Otherwise preserve the complete requested silhouette and world topology, use the documented current ground closure as an explicitly disclosed playable approximation, and record requested versus implemented behavior in Subject metadata. Never put lower-level bundle, rig, clip, collider, capability, motion, control, camera, or asset-pipeline refs in AuthoringSpec, and never add or modify SDK motion bases, Registry catalogs, Runtime, Compiler, or protocols. Never invent relationship.mount, relationship.seat, or relationship.tether capabilities. Motion Kernel and Control Profile command kinds must match. Configure the camera from the complete assembled Subject bounds and requested movement rather than copying a preset number. maxVertices, maxTriangles, and maxColliders are all blocking compiler budgets; choose declared values within the current schema limits and keep compiled use within every declaration. Use the ordinary roughly 100000-vertex target by default; for an explicitly requested 1–2km world, use at most 1024 Heightfield vertices per axis, normally 1.25–2.5m cells, and declare measured Terrain plus world costs instead of copying the ordinary ceiling. Do not remove meaningful world geometry merely to hide a budget overrun—simplify deterministically or report the gap. Keep routes, traversalAreas, and connectivity empty for open worlds. Use required connected-by-route only for an explicitly constrained ground connection supported by Route R1 Heightfield surfaces or an unambiguous R1b chain of collision-enabled static box steps/decks/platforms/ramps whose Prototypes declare exact collider-subshape traversalSurfaceBindings to worldkit://traversal-surface-profile/ground.static@1. maximumTiles is a per-route build-window budget, not a world-size field. If self-check reports ROUTE_BUILD_WINDOW_BUDGET_EXCEEDED, split that connection into ordered Routes whose neighboring connectivity rows reuse the exact same explicit seam Anchor. Dynamic or overlapping surfaces and bridge-underpass dual layers do not receive current production connectivity claims.

The map draft shape is {kind:'worldkit-scene-brief-implementation-map-draft',schemaVersion:1,sceneId:'$scene_id',authoringSpecId,visualTargetMappings:[{visualTargetId,runtimeEntityIds}]}. Map exactly every visual-target-N row from visual-identity-palette.json and nothing else. The primary target maps the controlled Subject. One repeated target maps all intentionally identical complete instances in one row. Do not map parts, helpers, or generic decoration. Do not invent hashes; the trusted host adds them. Do not edit the brief, palette, or images.

Before finishing, run this standalone validator bundled inside the Skill:
node .codex/skills/worldkit-canonical-builder/scripts/self-check.mjs --scene-id '$scene_id' --brief artifacts/scenes/$scene_id/scene-brief.md --world artifacts/scenes/$scene_id/authoring.builder.json --map-draft artifacts/scenes/$scene_id/implementation-map.draft.json --report artifacts/scenes/$scene_id/builder-self-check.json
It is generated from the current repository source and contains Authoring V4 validation, IR V4 compilation into the terminal Canonical Scene Plan and independent World Runtime Bootstrap, layout, Registry closure, resource-budget and implementation-map checks. If it exits nonzero, read its JSON diagnostics, repair authoring.builder.json and implementation-map.draft.json inside this same task, and run it again. Use at most three self-repair cycles. Finish only when builder-self-check.json has status 'passed'. The trusted Host replays the source-equivalent validator once after delivery; it does not start a separate Repair Agent."

if [[ "$mode" == "full" || "$mode" == "plan" ]]; then
  echo "WORLDKIT_STAGE planner"
  planner_log="$task_tmp/planner.log"
  planner_prompt_file="$task_tmp/planner.prompt.txt"
  printf '%s\n' "$planner_prompt" > "$planner_prompt_file"
  planner_task_id="planner-$codex_run_nonce"
  planner_context_args=(--context ".codex/skills/worldkit-spatial-planner")
  planner_output_args=(
    --output "artifacts/scenes/$scene_id/scene-brief.md::$artifact_root/scene-brief.md::text/markdown"
    --output "artifacts/scenes/$scene_id/planner-self-check.json::$artifact_root/planner-self-check.json::application/json"
    --output "apps/playground/public/scene-plans/$scene_id/world-plan.png::$public_plan_root/world-plan.png::image/png"
    --output "apps/playground/public/scene-plans/$scene_id/entry-whitebox-target.png::$public_plan_root/entry-whitebox-target.png::image/png"
  )
  if [[ "$scene_source" == "canonical" ]]; then
    planner_context_args+=(--context "assets/terrain-height-intent")
    planner_output_args+=(
      --output "artifacts/scenes/$scene_id/terrain-height-intent-prompt.md::$artifact_root/terrain-height-intent-prompt.md::text/markdown"
      --output "apps/playground/public/scene-plans/$scene_id/terrain-height-intent.png::$public_plan_root/terrain-height-intent.png::image/png"
    )
  fi
  run_codex \
    --task-id "$planner_task_id" \
    --stage planner \
    --job-name "WorldKit Planner · $scene_id" \
    --request-id "$scene_id-planner-$codex_run_nonce" \
    --output-s3-prefix "$codex_output_prefix/planner" \
    --instruction-file "$planner_prompt_file" \
    "${planner_context_args[@]}" \
    "${reference_asset_args[@]+"${reference_asset_args[@]}"}" \
    "${planner_output_args[@]}" \
    2>&1 | /usr/bin/tee "$planner_log"
  "$pnpm_bin" worldkit brief validate "$artifact_root/scene-brief.md" --json
  planner_host_receipt="$task_tmp/planner-self-check.host.json"
  planner_check_args=(
    --scene-source "$scene_source"
    --scene-id "$scene_id"
    --brief "$artifact_root/scene-brief.md"
    --world-plan "$public_plan_root/world-plan.png"
    --entry "$public_plan_root/entry-whitebox-target.png"
    --report "$planner_host_receipt"
  )
  if [[ "$scene_source" == "canonical" ]]; then
    planner_check_args+=(
      --terrain-prompt "$artifact_root/terrain-height-intent-prompt.md"
      --terrain-intent "$public_plan_root/terrain-height-intent.png"
    )
  fi
  node "$project_root/.codex/skills/worldkit-spatial-planner/scripts/self-check.mjs" "${planner_check_args[@]}"
  /usr/bin/cmp -s "$planner_host_receipt" "$artifact_root/planner-self-check.json" || {
    echo "Planner self-check receipt does not match trusted Host replay." >&2
    exit 2
  }

  visual_identity_palette="$artifact_root/visual-identity-palette.json"
  "$pnpm_bin" exec tsx scripts/visual/write-visual-identity-palette.ts \
    --scene-id "$scene_id" \
    --brief "$artifact_root/scene-brief.md" \
    --output "$visual_identity_palette"
  [[ -s "$public_plan_root/world-plan.png" && -s "$public_plan_root/entry-whitebox-target.png" ]] || {
    echo "Unified Planner image delivery is incomplete." >&2; exit 5;
  }
  if [[ "$scene_source" == "canonical" ]]; then
    [[ -s "$artifact_root/terrain-height-intent-prompt.md" && -s "$public_plan_root/terrain-height-intent.png" ]] || {
      echo "Canonical Planner Height Intent delivery is incomplete." >&2; exit 5;
    }
  fi
  if [[ "$mode" == "plan" ]]; then
    echo "WORLDKIT_STAGE plan-ready"
    exit 0
  fi
fi

if [[ "$mode" == "build" ]]; then
  planner_host_receipt="$task_tmp/planner-self-check.host.json"
  node "$project_root/.codex/skills/worldkit-spatial-planner/scripts/self-check.mjs" \
    --scene-source canonical \
    --scene-id "$scene_id" \
    --brief "$artifact_root/scene-brief.md" \
    --world-plan "$public_plan_root/world-plan.png" \
    --entry "$public_plan_root/entry-whitebox-target.png" \
    --terrain-prompt "$artifact_root/terrain-height-intent-prompt.md" \
    --terrain-intent "$public_plan_root/terrain-height-intent.png" \
    --report "$planner_host_receipt"
  /usr/bin/cmp -s "$planner_host_receipt" "$artifact_root/planner-self-check.json" || {
    echo "Planner self-check receipt does not match trusted Host replay." >&2
    exit 2
  }
fi

authoring_attempt_root="$artifact_root/scene-authoring-attempts/$codex_run_nonce"
authoring_route_decision_path="$authoring_attempt_root/route-decision.json"
authoring_attempt_path="$authoring_attempt_root/attempt.json"
authoring_attempt_result_path="$authoring_attempt_root/result.json"
"$pnpm_bin" exec tsx scripts/scenes/world-generation-route.ts \
  --scene-source canonical \
  --scene-id "$scene_id" \
  --run-id "$codex_run_nonce" \
  --brief "$artifact_root/scene-brief.md" \
  --output "$authoring_route_decision_path"

echo "WORLDKIT_STAGE coding-agent"
[[ -s "$artifact_root/scene-brief.md" ]] || { echo "Scene Brief is missing." >&2; exit 3; }
[[ -s "$artifact_root/visual-identity-palette.json" ]] || { echo "Visual identity palette is missing." >&2; exit 3; }
[[ -s "$artifact_root/terrain-height-intent-prompt.md" && -s "$public_plan_root/world-plan.png" && -s "$public_plan_root/entry-whitebox-target.png" && -s "$public_plan_root/terrain-height-intent.png" ]] || {
  echo "Planner images are missing." >&2; exit 3;
}
builder_log="$task_tmp/coding-agent.log"
builder_prompt_file="$task_tmp/canonical-builder.prompt.txt"
printf '%s\n' "$builder_prompt" > "$builder_prompt_file"
builder_task_id="builder-$codex_run_nonce"
run_codex \
  --task-id "$builder_task_id" \
  --stage coding-agent \
  --job-name "WorldKit Builder · $scene_id" \
  --request-id "$scene_id-builder-$codex_run_nonce" \
  --output-s3-prefix "$codex_output_prefix/canonical-builder" \
  --instruction-file "$builder_prompt_file" \
  --context ".codex/skills/worldkit-canonical-builder" \
  --context "artifacts/scenes/$scene_id/scene-brief.md" \
  --context "artifacts/scenes/$scene_id/visual-identity-palette.json" \
  --context "artifacts/scenes/$scene_id/terrain-height-intent-prompt.md" \
  --context "apps/playground/public/scene-plans/$scene_id/world-plan.png" \
  --context "apps/playground/public/scene-plans/$scene_id/entry-whitebox-target.png" \
  --context "apps/playground/public/scene-plans/$scene_id/terrain-height-intent.png" \
  "${reference_asset_args[@]+"${reference_asset_args[@]}"}" \
  --asset "world-plan::$public_plan_root/world-plan.png::image::image/png" \
  --asset "entry-whitebox-target::$public_plan_root/entry-whitebox-target.png::image::image/png" \
  --asset "terrain-height-intent::$public_plan_root/terrain-height-intent.png::image::image/png" \
  --output "artifacts/scenes/$scene_id/authoring.builder.json::$artifact_root/authoring.builder.json::application/json" \
  --output "artifacts/scenes/$scene_id/implementation-map.draft.json::$artifact_root/implementation-map.draft.json::application/json" \
  --output "artifacts/scenes/$scene_id/builder-self-check.json::$artifact_root/builder-self-check.json::application/json" \
  2>&1 | /usr/bin/tee "$builder_log"

echo "WORLDKIT_STAGE canonical-build"
builder_host_receipt="$task_tmp/builder-self-check.host.json"
"$pnpm_bin" exec tsx scripts/agents/agent-builder-self-check.ts \
  --scene-id "$scene_id" \
  --brief "$artifact_root/scene-brief.md" \
  --world "$artifact_root/authoring.builder.json" \
  --map-draft "$artifact_root/implementation-map.draft.json" \
  --report "$builder_host_receipt"
/usr/bin/cmp -s "$builder_host_receipt" "$artifact_root/builder-self-check.json" || {
  echo "Builder self-check receipt does not match trusted Host replay." >&2
  exit 2
}

"$pnpm_bin" exec tsx scripts/scenes/record-scene-authoring-attempt.ts begin \
  --scene-id "$scene_id" \
  --run-id "$codex_run_nonce" \
  --brief "$artifact_root/scene-brief.md" \
  --authoring-input "$artifact_root/authoring.builder.json" \
  --route-decision "$authoring_route_decision_path" \
  --attempt-output "$authoring_attempt_path"
authoring_attempt_started=true

echo "WORLDKIT_STAGE terrain-compilation"
"$pnpm_bin" exec tsx scripts/scenes/finalize-scene-terrain.ts \
  --scene-id "$scene_id" \
  --run-id "$codex_run_nonce" \
  --brief "$artifact_root/scene-brief.md" \
  --planner-receipt "$artifact_root/planner-self-check.json" \
  --terrain-prompt "$artifact_root/terrain-height-intent-prompt.md" \
  --terrain-intent "$public_plan_root/terrain-height-intent.png" \
  --builder-receipt "$artifact_root/builder-self-check.json" \
  --builder-authoring "$artifact_root/authoring.builder.json" \
  --map-draft "$artifact_root/implementation-map.draft.json" \
  --output-authoring "$artifact_root/authoring.json" \
  --output-report "$artifact_root/terrain-height-intent-report.json" \
  --output-manifest "$artifact_root/terrain-compilation-manifest.json" \
  --output-self-check "$artifact_root/final-authoring-self-check.json" \
  --failure-report "$artifact_root/terrain-height-intent-report.failed.$codex_run_nonce.json"

run_builder_gates() {
  "$pnpm_bin" exec tsx scripts/scenes/finalize-spatial-build.ts \
    --scene-id "$scene_id" \
    --brief "$artifact_root/scene-brief.md" \
    --world "$artifact_root/authoring.json" \
    --map-draft "$artifact_root/implementation-map.draft.json" \
    --output "$artifact_root/scene-implementation-map.json" &&
  "$pnpm_bin" exec tsx scripts/cli/build-world-artifact.ts \
    "$artifact_root/authoring.json" \
    --output "$artifact_root/world.build.json" --json &&
  route_validation_required="$("$node_bin" -e 'const fs=require("node:fs");const report=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(report.requiresTrustedRouteValidation===true?"1":"0")' "$artifact_root/final-authoring-self-check.json")" &&
  if [[ "$route_validation_required" == "1" ]]; then
    echo "WORLDKIT_STAGE route-validation"
    route_validation_report="$artifact_root/route-validation.$codex_run_nonce.json"
    "$pnpm_bin" worldkit verify route "$artifact_root/authoring.json" \
      --profile worldkit://validation-profile/outdoor-world-package-dev@1 \
      --output "$route_validation_report" --json &&
    "$node_bin" -e '
      const fs = require("node:fs");
      const path = require("node:path");
      const crypto = require("node:crypto");
      const [reportPath, manifestPath, sceneId] = process.argv.slice(1);
      const bytes = fs.readFileSync(reportPath);
      const manifest = {
        kind: "worldkit-route-validation-manifest",
        schemaVersion: 1,
        sceneId,
        reportFileName: path.basename(reportPath),
        reportContentHash: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`,
      };
      const temporaryPath = `${manifestPath}.tmp-${process.pid}`;
      fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest)}\n`, { flag: "wx" });
      fs.renameSync(temporaryPath, manifestPath);
    ' "$route_validation_report" "$artifact_root/route-validation-manifest.json" "$scene_id"
  fi &&
  echo "WORLDKIT_STAGE runtime-capture" &&
  "$pnpm_bin" worldkit capture "$artifact_root/authoring.json" \
    --output "$artifact_root/opening-frame.png" \
    --snapshot "$artifact_root/runtime-snapshot.json" \
    --triview-output "$artifact_root/triviews" \
    --implementation-map "$artifact_root/scene-implementation-map.json" --json &&
  python3 "$project_root/scripts/visual/validate-entry-third-person.py" \
    --image "$artifact_root/opening-frame.png" \
    --snapshot "$artifact_root/runtime-snapshot.json" \
    --output "$artifact_root/entry-third-person-validation.json"
}
run_builder_gates

"$pnpm_bin" exec tsx scripts/scenes/record-scene-authoring-attempt.ts complete \
  --scene-id "$scene_id" \
  --run-id "$codex_run_nonce" \
  --attempt "$authoring_attempt_path" \
  --authored-source "$artifact_root/authoring.json" \
  --evidence-ref "worldkit://evidence/canonical-world-build/$scene_id/$codex_run_nonce@1" \
  --evidence-ref "worldkit://evidence/entry-third-person/$scene_id/$codex_run_nonce@1" \
  --evidence-ref "worldkit://evidence/runtime-snapshot/$scene_id/$codex_run_nonce@1" \
  --evidence-ref "worldkit://evidence/whitebox-triview/$scene_id/$codex_run_nonce@1" \
  --result-output "$authoring_attempt_result_path"
authoring_attempt_completed=true

primary_user_frame=""
for candidate in "$public_plan_root"/reference-0.png "$public_plan_root"/reference-0.jpg "$public_plan_root"/reference-0.webp; do
  if [[ -f "$candidate" ]]; then primary_user_frame="$candidate"; break; fi
done
if [[ -n "$primary_user_frame" ]]; then
  "$project_root/scripts/visual/run-styled-opening-frame-agent.sh" \
    --scene-id "$scene_id" --user-frame "$primary_user_frame"
fi

echo "WORLDKIT_STAGE ready"
