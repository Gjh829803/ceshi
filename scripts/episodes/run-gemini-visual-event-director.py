#!/usr/bin/env python3
"""Author five action-independent events for three selected Episode captures."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image

from cloud_production_slots import acquire_global_production_slot


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "episode-visual-event-director.json"
DEFAULT_ENV_FILE = PROJECT_ROOT / ".codex-tmp" / "runtime-config" / "gemini.env"
DEFAULT_CREDENTIAL_FILE = (
    PROJECT_ROOT / ".codex-tmp" / "runtime-config" / "google-service-account.json"
)
ID_PATTERN = __import__("re").compile(r"^[a-z0-9][a-z0-9-]{2,119}$")


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        value = raw_value.strip().strip('"').strip("'")
        if key:
            os.environ[key] = value


def _prepare_vertex_environment(config: dict[str, Any]) -> tuple[str, str, str]:
    managed_keys = (
        "GOOGLE_APPLICATION_CREDENTIALS",
        "GCLOUD_PROJECT_ID",
        "WORLDKIT_GEMINI_EVENT_LOCATION",
        "WORLDKIT_GEMINI_EVENT_MODEL",
    )
    for key in managed_keys:
        os.environ.pop(key, None)
    _load_env_file(DEFAULT_ENV_FILE)
    credential_path = DEFAULT_CREDENTIAL_FILE.resolve()
    if not credential_path.is_file() or PROJECT_ROOT not in credential_path.parents:
        raise RuntimeError(
            "Gemini Event Director requires project-local credentials at "
            ".codex-tmp/runtime-config/google-service-account.json."
        )
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credential_path)
    project_id = os.environ.get("GCLOUD_PROJECT_ID", "").strip()
    if not project_id:
        try:
            credential_payload = json.loads(credential_path.read_text(encoding="utf-8"))
            project_id = str(credential_payload.get("project_id") or "").strip()
        except (OSError, json.JSONDecodeError):
            project_id = ""
    if not project_id:
        raise RuntimeError("GCLOUD_PROJECT_ID is required for Gemini Event Director.")
    location = str(config.get("location") or "global").strip() or "global"
    model = str(config.get("model") or "").strip()
    return project_id, location, model


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _assert_png(path: Path) -> None:
    if not path.is_file() or path.is_symlink() or path.stat().st_size <= 2048:
        raise RuntimeError(f"Styled opening frame is missing or unsafe: {path}")
    with Image.open(path) as image:
        image.verify()


def _assert_video(path: Path) -> None:
    if not path.is_file() or path.is_symlink() or path.stat().st_size <= 2048:
        raise RuntimeError(f"Whitebox Segment video is missing or unsafe: {path}")
    probe = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=60,
    )
    duration = float(json.loads(probe.stdout)["format"]["duration"])
    if duration < 29.5 or duration > 30.5:
        raise RuntimeError(
            f"Whitebox Segment must be a real 30-second video: {path.name} {duration}"
        )


def _event_response_schema() -> dict[str, Any]:
    event = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "targetNames", "eventClass", "magnitude", "frameImpact",
            "dominantChange", "targetContext", "beforeState",
            "transitionDescription", "afterState", "spatialContinuity",
            "audioDescription", "negativeConstraints", "timing",
        ],
        "properties": {
            "targetNames": {
                "type": "array", "minItems": 1, "maxItems": 4,
                "items": {"type": "string", "minLength": 2},
            },
            "eventClass": {
                "type": "string",
                "enum": [
                    "subject-transformation", "ability-manifestation",
                    "environment-transformation", "atmospheric-spectacle",
                ],
            },
            "magnitude": {"type": "string", "enum": ["large-scale"]},
            "frameImpact": {
                "type": "object", "additionalProperties": False,
                "required": ["scope", "coverage", "contrast"],
                "properties": {
                    "scope": {
                        "type": "string",
                        "enum": [
                            "subject-dominant", "environment-dominant", "sky-dominant"
                        ],
                    },
                    "coverage": {"type": "string", "enum": ["large"]},
                    "contrast": {"type": "string", "enum": ["dramatic"]},
                },
            },
            "dominantChange": {"type": "string", "minLength": 80},
            "targetContext": {"type": "string", "minLength": 16},
            "beforeState": {"type": "string", "minLength": 30},
            "transitionDescription": {"type": "string", "minLength": 50},
            "afterState": {"type": "string", "minLength": 30},
            "spatialContinuity": {"type": "string", "minLength": 40},
            "audioDescription": {"type": "string", "minLength": 20},
            "negativeConstraints": {"type": "string", "minLength": 50},
            "timing": {
                "type": "object", "additionalProperties": False,
                "required": [
                    "transitionDurationSeconds", "ending", "endingDurationSeconds"
                ],
                "properties": {
                    "transitionDurationSeconds": {
                        "type": "number", "minimum": 1.5, "maximum": 4.0
                    },
                    "ending": {
                        "type": "string", "enum": ["hold", "fade", "settle"]
                    },
                    "endingDurationSeconds": {
                        "type": "number", "minimum": 0, "maximum": 6
                    },
                },
            },
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["events"],
        "properties": {
            "events": {
                "type": "array", "minItems": 5, "maxItems": 5, "items": event
            }
        },
    }


def _host_slots(trace: dict[str, Any]) -> list[dict[str, Any]]:
    markers = {
        str(item.get("id")): item
        for item in trace.get("events", [])
        if isinstance(item, dict) and item.get("kind") == "prompt-marker"
    }
    slots: list[dict[str, Any]] = []
    slot_layout = [
        (0, 8.0), (0, 20.0),
        (2, 8.0), (2, 20.0),
        (4, 14.0),
    ]
    for index, (segment_index, expected_relative_seconds) in enumerate(slot_layout):
        event_id = f"prompt-event-{index:02d}"
        marker = markers.get(event_id)
        if not isinstance(marker, dict) or not isinstance(marker.get("actualSeconds"), (int, float)):
            raise RuntimeError(f"Host Event marker is missing: {event_id}")
        global_seconds = float(marker["actualSeconds"])
        relative_seconds = global_seconds - segment_index * 30
        window = (6, 12) if expected_relative_seconds == 8 else (
            (18, 24) if expected_relative_seconds == 20 else (11, 19)
        )
        if relative_seconds < window[0] or relative_seconds >= window[1]:
            raise RuntimeError(f"Host Event marker left its window: {event_id}")
        slots.append({
            "segmentId": f"segment-0{segment_index}",
            "globalSeconds": global_seconds,
            "segmentRelativeSeconds": relative_seconds,
        })
    return slots


def _generate_events(
    *,
    videos: list[Path],
    frames: list[Path],
    slots: list[dict[str, Any]],
    prompt_template: str,
    project_id: str,
    location: str,
    model: str,
    config: dict[str, Any],
    video_sampling_fps: float,
) -> list[dict[str, Any]]:
    from google import genai
    from google.genai import types

    prompt = prompt_template.replace(
        "HOST_EVENT_SLOTS_JSON",
        json.dumps(slots, ensure_ascii=False, indent=2),
    )
    styled_frames = []
    for frame in frames:
        with Image.open(frame) as source:
            styled_frames.append(source.convert("RGB"))
    try:
        client = genai.Client(vertexai=True, project=project_id, location=location)
        contents: list[Any] = [prompt]
        for video, styled_frame in zip(videos, styled_frames, strict=True):
            contents.extend([
                types.Part(
                    inline_data=types.Blob(
                        data=video.read_bytes(),
                        mime_type="video/mp4",
                    ),
                    video_metadata=types.VideoMetadata(fps=video_sampling_fps),
                ),
                styled_frame,
            ])
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=(
                    "你是 WorldKit 的大型视觉事件导演。一次性比较三个不同起点的完整"
                    "30秒白膜视频及各自最终样式首帧，创作五条互不重复、与各自场景强关联、"
                    "有趣、合理且具有强视觉渲染力的大型事件。禁止把同一类变化换词复用，"
                    "并保持事件与玩家按键动作完全独立。严格按 Host 槽位顺序输出 JSON。"
                ),
                temperature=float(config.get("temperature", 0.8)),
                max_output_tokens=int(config.get("maxOutputTokens", 8192)),
                response_mime_type="application/json",
                response_json_schema=_event_response_schema(),
            ),
        )
    finally:
        for styled_frame in styled_frames:
            styled_frame.close()
    response_text = getattr(response, "text", None)
    if not response_text:
        raise RuntimeError("Gemini Event Director returned no JSON")
    raw = json.loads(response_text)
    events = raw.get("events") if isinstance(raw, dict) else None
    if not isinstance(events, list) or len(events) != 5:
        raise RuntimeError("Gemini must return exactly five events in Host slot order")
    return events


def _run(args: argparse.Namespace) -> None:
    config_path = Path(args.config).resolve()
    config = _read_json(config_path)
    if config.get("kind") != "worldkit-episode-visual-event-director-config" or \
            config.get("schemaVersion") != 1 or \
            config.get("model") != "gemini-3.5-flash" or \
            config.get("videoSamplingFps") != 0.25 or \
            config.get("selectedCaptureIndices") != [0, 2, 4] or \
            config.get("eventDistribution") != [2, 2, 1]:
        raise RuntimeError("Gemini Event Director config identity is invalid.")
    prompt_path = (PROJECT_ROOT / str(config.get("promptTemplatePath") or "")).resolve()
    if PROJECT_ROOT not in prompt_path.parents or not prompt_path.is_file():
        raise RuntimeError("Gemini Event Director prompt template is missing or unsafe.")
    if args.smoke:
        prompt_bytes = prompt_path.read_bytes()
        print(json.dumps({
            "model": str(config.get("model")),
            "prompt_sha256": hashlib.sha256(prompt_bytes).hexdigest(),
            "styled_frame_count": 3,
            "whitebox_video_count": 3,
            "video_sampling_fps": config["videoSamplingFps"],
            "event_count": 5,
            "event_distribution": [2, 2, 1],
            "single_model_call": True,
            "event_field_extension": False,
            "action_independent": True,
        }, ensure_ascii=False))
        return
    if args.runtime_config_smoke:
        project_id, location, model = _prepare_vertex_environment(config)
        print(json.dumps({
            "project_id_present": bool(project_id),
            "location": location,
            "model": model,
            "credential_file": str(DEFAULT_CREDENTIAL_FILE.relative_to(PROJECT_ROOT)),
            "project_local_only": True,
        }, ensure_ascii=False))
        return

    scene_id = str(args.scene_id or "")
    episode_id = str(args.episode_id or "")
    if not ID_PATTERN.fullmatch(scene_id) or not ID_PATTERN.fullmatch(episode_id):
        raise RuntimeError("Stable --scene-id and --episode-id are required.")
    episode_root = Path(args.episode_root).resolve()
    if PROJECT_ROOT not in episode_root.parents:
        raise RuntimeError("Episode root must stay inside the project.")
    style_root = Path(args.style_root).resolve() if args.style_root else episode_root
    if PROJECT_ROOT not in style_root.parents:
        raise RuntimeError("Style root must stay inside the project.")
    style_variant = None
    style_variant_input = None
    if args.style_variant:
        style_variant_path = Path(args.style_variant).resolve()
        if PROJECT_ROOT not in style_variant_path.parents:
            raise RuntimeError("Style Variant path must stay inside the project.")
        style_variant = _read_json(style_variant_path)
        if style_variant.get("sceneId") != scene_id or \
                style_variant.get("episodeId") != episode_id or \
                not ID_PATTERN.fullmatch(str(style_variant.get("id") or "")) or \
                len(str(style_variant.get("geminiEventPrompt") or "").strip()) < 200:
            raise RuntimeError("Style Variant Gemini prompt identity is invalid.")
        visual_review_path = style_root / "review" / "visual-quality-review.json"
        visual_review_report_path = (
            style_root / "review" / "visual-quality-review-report.json"
        )
        visual_review = _read_json(visual_review_path)
        visual_review_report = _read_json(visual_review_report_path)
        if visual_review.get("reviewer") != "lwdp-codex" or \
                visual_review.get("verdict") != "passed" or \
                visual_review.get("styleVariantId") != style_variant.get("id") or \
                visual_review_report.get("passed") is not True or \
                not str(visual_review_report.get("reviewerTaskId") or "").startswith(
                    f"style-review-{style_variant.get('id')}-"
                ):
            raise RuntimeError(
                "Gemini cannot run before the independent Codex visual review passes."
            )
        style_variant_input = {
            "styleVariantHash": "sha256:" + hashlib.sha256(
                style_variant_path.read_bytes()
            ).hexdigest(),
            "visualReviewHash": "sha256:" + hashlib.sha256(
                visual_review_path.read_bytes()
            ).hexdigest(),
            "visualReviewReportHash": "sha256:" + hashlib.sha256(
                visual_review_report_path.read_bytes()
            ).hexdigest(),
        }
    visual_manifest_path = style_root / "visual" / (
        "visual-manifest.json" if style_variant else "episode-visual-manifest.json"
    )
    visual_manifest = _read_json(visual_manifest_path)
    trace_path = episode_root / "whitebox" / "executed-playthrough-trace.json"
    trace = _read_json(trace_path)
    slots = _host_slots(trace)
    frames: list[Path] = []
    videos: list[Path] = []
    selected_indices = list(config["selectedCaptureIndices"])
    opening_frames = visual_manifest.get("segmentOpeningFrames") or []
    opening_frames_by_segment = {
        str(item.get("segmentId")): item
        for item in opening_frames
        if isinstance(item, dict)
    }
    for index in selected_indices:
        expected = f"visual/segment-0{index}-styled-opening-frame.png"
        item = opening_frames_by_segment.get(f"segment-0{index}")
        if not isinstance(item, dict):
            raise RuntimeError(f"Styled opening frame manifest missing: segment-0{index}")
        if str(item.get("path") or "") != expected:
            raise RuntimeError(f"Styled opening frame manifest mismatch: segment-0{index}")
        frame = (style_root / expected).resolve()
        if style_root not in frame.parents:
            raise RuntimeError("Styled opening frame escaped Style root.")
        _assert_png(frame)
        frames.append(frame)
        video = (episode_root / "whitebox" / f"segment-0{index}.mp4").resolve()
        if episode_root not in video.parents:
            raise RuntimeError("Whitebox Segment video escaped Episode root.")
        _assert_video(video)
        videos.append(video)

    project_id, location, model = _prepare_vertex_environment(config)
    prompt_template = prompt_path.read_text(encoding="utf-8")
    if style_variant:
        prompt_template = (
            "以下是当前视觉世界独立且唯一的事件创作要求。不得借用其他风格：\n"
            + str(style_variant["geminiEventPrompt"]).strip()
            + "\n\n"
            + prompt_template
        )
    gemini_slot = acquire_global_production_slot("gemini", {
        "sceneId": scene_id,
        "episodeId": episode_id,
        "styleVariantId": style_variant.get("id") if style_variant else "legacy",
    })
    try:
        if gemini_slot is not None:
            gemini_slot.__enter__()
        events = _generate_events(
            videos=videos,
            frames=frames,
            slots=slots,
            prompt_template=prompt_template,
            project_id=project_id,
            location=location,
            model=model,
            config=config,
            video_sampling_fps=float(config["videoSamplingFps"]),
        )
    finally:
        if gemini_slot is not None:
            gemini_slot.__exit__(None, None, None)
    print("WORLDKIT_GEMINI_VISUAL_EVENTS_READY videos=3 events=5 fps=0.25", flush=True)
    raw = {"events": events}
    prompt_root = style_root / "prompts"
    prompt_root.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=".gemini-visual-events.", suffix=".json", dir=prompt_root
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(raw, handle, ensure_ascii=False)
            handle.write("\n")
        output_path = prompt_root / "visual-events.json"
        subprocess.run([
            "node", "scripts/episodes/finalize-gemini-visual-events.mjs",
            "--scene-id", scene_id,
            "--episode-id", episode_id,
            "--model", model,
            "--input", temporary_name,
            "--trace", str(trace_path),
            "--output", str(output_path),
            "--episode-root", str(episode_root),
            "--style-root", str(style_root),
            "--config", str(config_path),
            "--prompt-template", str(prompt_path),
            "--selected-capture-indices", ",".join(str(index) for index in selected_indices),
            *(["--style-variant-id", str(style_variant["id"])] if style_variant else []),
            *(["--style-variant-hash", style_variant_input["styleVariantHash"]]
              if style_variant_input else []),
            *(["--visual-review-hash", style_variant_input["visualReviewHash"]]
              if style_variant_input else []),
            *(["--visual-review-report-hash", style_variant_input["visualReviewReportHash"]]
              if style_variant_input else []),
        ], cwd=PROJECT_ROOT, check=True)
    finally:
        try:
            os.unlink(temporary_name)
        except OSError:
            pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene-id")
    parser.add_argument("--episode-id")
    parser.add_argument("--episode-root")
    parser.add_argument("--style-root")
    parser.add_argument("--style-variant")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--runtime-config-smoke", action="store_true")
    args = parser.parse_args()
    try:
        _run(args)
    except Exception as error:  # noqa: BLE001 - CLI boundary
        print(f"WORLDKIT_GEMINI_VISUAL_EVENT_FAILED {error}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
