#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
if [[ "${1:-}" == "--" ]]; then shift; fi

scene_id=""; episode_id=""; episode_root=""; review_id="visual-reconstructor-v5"; backend="cloud"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene-id) shift; scene_id="${1:-}" ;;
    --episode-id) shift; episode_id="${1:-}" ;;
    --episode-root) shift; episode_root="${1:-}" ;;
    --review-id) shift; review_id="${1:-}" ;;
    --backend) shift; backend="${1:-}" ;;
    *) echo "Unsupported option: $1" >&2; exit 2 ;;
  esac
  shift
done

id_pattern='^[a-z0-9][a-z0-9-]{2,119}$'
[[ "$scene_id" =~ $id_pattern && "$episode_id" =~ $id_pattern && "$review_id" =~ $id_pattern ]] || exit 2
[[ "$backend" == "cloud" || "$backend" == "local" ]] || exit 2
episode_root="$(cd "$(dirname "$episode_root")" && pwd)/$(basename "$episode_root")"
case "$episode_root" in
  "$project_root"/artifacts/episodes/*) ;;
  *) echo "Episode root must stay inside project artifacts/episodes." >&2; exit 2 ;;
esac

scene_root="$project_root/artifacts/scenes/$scene_id"
whitebox_root="$episode_root/whitebox"
public_root="$project_root/apps/playground/public/scene-plans/$scene_id"
review_root="$episode_root/visual-reviews/$review_id"
mkdir -p "$review_root"

for required in \
  "$whitebox_root/segment-00-first-frame.png" \
  "$whitebox_root/segment-01-first-frame.png" \
  "$whitebox_root/segment-02-first-frame.png" \
  "$scene_root/scene-brief.md" \
  "$scene_root/visual-generation-prompts.json" \
  "$scene_root/visual-identity-palette.json" \
  "$scene_root/styled-opening-frame.png" \
  "$public_root/reference-0.png"; do
  [[ -f "$required" && -s "$required" && ! -L "$required" ]] || {
    echo "Missing episode opening-review input: $required" >&2
    exit 3
  }
done

if [[ -z "${WORLDKIT_LWDP_ENV_FILE:-}" && -f "$project_root/.codex-tmp/runtime-config/lwdp.env" ]]; then
  export WORLDKIT_LWDP_ENV_FILE="$project_root/.codex-tmp/runtime-config/lwdp.env"
fi

relative_review_root="${review_root#"$project_root"/}"
temporary_root="$project_root/.codex-tmp"
mkdir -p "$temporary_root"
task_tmp="$(mktemp -d "$temporary_root/episode-opening-review.XXXXXX")"
trap 'case "$task_tmp" in "$temporary_root"/episode-opening-review.*) /bin/rm -rf -- "$task_tmp" ;; esac' EXIT
instruction_file="$task_tmp/instruction.txt"

instruction="Use .codex/skills/worldkit-episode-visual-reconstructor/SKILL.md as the complete guide.

This is an opening-only human-review run for scene '$scene_id', episode '$episode_id', review '$review_id'. Use the built-in image generation tool. Generate exactly one prompt bundle and three event-free styled Segment opening frames. Do not generate tri-views, video, or undeclared files.

Read these mandatory inherited context files before writing any prompt:
- artifacts/scenes/$scene_id/scene-brief.md
- artifacts/scenes/$scene_id/visual-generation-prompts.json
- artifacts/scenes/$scene_id/visual-identity-palette.json

Attached image roles in order:
1. segment-00-whitebox-first-frame: Segment 00 spatial authority and edit target
2. segment-01-whitebox-first-frame: Segment 01 spatial authority and edit target
3. segment-02-whitebox-first-frame: Segment 02 spatial authority and edit target
4. user-first-frame: direct high-fidelity appearance authority
5. base-styled-opening-frame: accepted original Visual Reconstructor appearance evidence

The original openingFrame.prompt in visual-generation-prompts.json is the mandatory case-specific base Prompt for subject identity, final materials, continuous-surface reconstruction, palette, lighting, atmosphere, art style, protected movement medium, and helper removal. It is not permission to retain old pixel-registered or exact-silhouette wording. For each Segment, rewrite camera-relative registration, current Subject screen region, visible blocker anchors and approximate bounding envelopes, and the near/middle/far movement-envelope description from that Segment's whitebox frame.

Do not preserve Block World rendering residue. Remove cube seams, voxel facets, staircase contours, semantic-color boundaries, prototype grids, and incidental step banding. Fit one continuous natural contour or smooth curve through each block cluster. Adjacent blocks expressing one ground, floor, water, snowfield, wall, cliff, bridge deck, or curved landmark become one continuous final surface matching the original accepted styled opening and user image. The Segment whitebox strictly owns camera distance and height, FOV, crop, Subject registration, movement clearance, scene depth, and every landmark's projected screen-space occupancy, apparent proximity, visible fraction, frame-edge entry/exit, crop, overlap, and occlusion. It does not own exact landmark geometry, component count, local silhouette shape, curvature, thickness, break pattern, terminals, local proportions, ornament, cube-level edges, or individual block boundaries; those are owned by the user image and accepted base styled opening within the locked projection. A key landmark may look substantially different from its proxy, but must not be pulled farther away, shrunk to fit, fully revealed, or given a different visible fraction. If only half or a partial section is visible in the whitebox, only that partial reference-style landmark appears in the output and the unseen remainder stays outside the frame. Incidental obstacle blocks need no one-to-one visual replacement and may be omitted or merged into terrain. Never say “pixel-registered material repaint”, “Image 1 wins every geometry or silhouette”, “preserve every block”, “preserve every polygon boundary”, “preserve every repeated ledge”, or “preserve every silhouette exactly”. If the base Prompt contains those older phrases, preserve their intent only for movement boundaries and broad spatial relationships. Prompt Events occur later and must not appear in any first frame.

Write $relative_review_root/episode-opening-review-prompts.json with kind=worldkit-episode-opening-review-prompts, schemaVersion=1, provider=lwdp-codex, the exact sceneId/episodeId/reviewId, baseVisualPromptPath=artifacts/scenes/$scene_id/visual-generation-prompts.json, and segmentOpeningFrames in exact segment-00, segment-01, segment-02 order. Each entry has referenceRoles=[its Segment whitebox role,user-first-frame,base-styled-opening-frame] and one self-contained complete prompt.

Generate and inspect these exact outputs:
- $relative_review_root/segment-00-styled-opening-frame.png
- $relative_review_root/segment-01-styled-opening-frame.png
- $relative_review_root/segment-02-styled-opening-frame.png

Reject and regenerate an image once if any major landmark or terrain still reads as stacked cubes, stepped voxel arcs, rectangular block masonry, block-faceted cliffs, or Minecraft-like construction; also reject a pulled-back camera, reduced landmark screen occupancy, changed visible fraction or crop, a complete landmark shown where the whitebox exposes only part, movement-envelope changes, imported user-reference camera, Subject-registration changes, early Prompt Events, or failed inherited appearance."
printf '%s\n' "$instruction" > "$instruction_file"

input_material="$(shasum -a 256 \
  "$whitebox_root/segment-00-first-frame.png" \
  "$whitebox_root/segment-01-first-frame.png" \
  "$whitebox_root/segment-02-first-frame.png" \
  "$public_root/reference-0.png" \
  "$scene_root/styled-opening-frame.png" \
  "$scene_root/visual-generation-prompts.json" \
  "$scene_root/visual-identity-palette.json" \
  "$project_root/.codex/skills/worldkit-episode-visual-reconstructor/SKILL.md")"
input_hash="$(printf '%s' "$input_material" | shasum -a 256 | cut -c1-20)"
task_id="episode-opening-review-$input_hash"
cloud_root="${WORLDKIT_LWDP_S3_ROOT:-s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk}"

echo "WORLDKIT_EPISODE_OPENING_REVIEW submitting scene=$scene_id episode=$episode_id review=$review_id"
node scripts/agents/run-codex-task.mjs \
  --backend "$backend" \
  --repo-root "$project_root" \
  --task-id "$task_id" \
  --stage episode-opening-review \
  --job-name "WorldKit Episode Opening Review · $scene_id" \
  --request-id "$episode_id-$review_id-$input_hash" \
  --output-s3-prefix "${cloud_root%/}/episodes/$episode_id/opening-review-$input_hash" \
  --instruction-file "$instruction_file" \
  --execution-profile formal \
  --timeout-seconds 1800 \
  --context ".codex/skills/worldkit-episode-visual-reconstructor" \
  --context "artifacts/scenes/$scene_id/scene-brief.md" \
  --context "artifacts/scenes/$scene_id/visual-generation-prompts.json" \
  --context "artifacts/scenes/$scene_id/visual-identity-palette.json" \
  --asset "segment-00-whitebox-first-frame::$whitebox_root/segment-00-first-frame.png::image::image/png" \
  --asset "segment-01-whitebox-first-frame::$whitebox_root/segment-01-first-frame.png::image::image/png" \
  --asset "segment-02-whitebox-first-frame::$whitebox_root/segment-02-first-frame.png::image::image/png" \
  --asset "user-first-frame::$public_root/reference-0.png::image::image/png" \
  --asset "base-styled-opening-frame::$scene_root/styled-opening-frame.png::image::image/png" \
  --output "$relative_review_root/episode-opening-review-prompts.json::$review_root/episode-opening-review-prompts.json::application/json" \
  --output "$relative_review_root/segment-00-styled-opening-frame.png::$review_root/segment-00-styled-opening-frame.png::image/png" \
  --output "$relative_review_root/segment-01-styled-opening-frame.png::$review_root/segment-01-styled-opening-frame.png::image/png" \
  --output "$relative_review_root/segment-02-styled-opening-frame.png::$review_root/segment-02-styled-opening-frame.png::image/png"

node scripts/episodes/finalize-episode-opening-review.mjs \
  --scene-id "$scene_id" \
  --episode-id "$episode_id" \
  --episode-root "$episode_root" \
  --review-id "$review_id"
echo "WORLDKIT_EPISODE_OPENING_REVIEW ready scene=$scene_id episode=$episode_id review=$review_id"
