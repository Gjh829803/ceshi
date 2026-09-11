"""Vertex visual-event generation shared by the Three Episode Host."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_ENV_FILE = PROJECT_ROOT / ".codex-tmp" / "runtime-config" / "gemini.env"
DEFAULT_CREDENTIAL_FILE = (
    PROJECT_ROOT / ".codex-tmp" / "runtime-config" / "google-service-account.json"
)


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
