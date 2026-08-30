#!/usr/bin/env python3
"""Generate one 30-second styled episode segment through MG 480p and CF 720p.

The run record is a durable checkpoint. If the process is interrupted after a
provider accepted a request, the next invocation polls the stored task id and
never blindly resubmits it. Secrets and signed URLs are not persisted.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = REPO_ROOT / "config" / "episode-video-pipeline.json"
SUCCESS = {"succeeded", "completed", "success", "done", "finished"}
FAILURE = {"failed", "error", "cancelled", "canceled", "stopped", "rejected"}


class EpisodeVideoError(RuntimeError):
    pass


def should_retry_terminal_task(
    error: Exception,
    stage: str,
    attempts: int,
    max_attempts: int = 3,
) -> bool:
    return f"{stage} task failed:" in str(error) and attempts < max_attempts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--result", required=True)
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument(
        "--until", choices=("seedance", "upscale", "conformance"), default="conformance"
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_id(value: Any, label: str) -> str:
    text = str(value or "")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,119}", text):
        raise EpisodeVideoError(f"invalid {label}: {text}")
    return text


def existing_file(value: Any, label: str) -> Path:
    path = Path(str(value or "")).expanduser().resolve()
    if not path.is_file() or path.stat().st_size <= 0:
        raise EpisodeVideoError(f"{label} is missing or empty: {path}")
    return path


def write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def sanitize_text(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    text = re.sub(r"https?://[^\s\"']+", "<redacted-url>", text)
    text = re.sub(r"(?i)(authorization|api[_-]?key|token)[=: ]+[^,\s]+", r"\1=<redacted>", text)
    return text[:3000]


def nested_values(value: Any):
    if isinstance(value, dict):
        for key, item in value.items():
            yield key, item
            yield from nested_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from nested_values(item)


def find_task_id(body: Any) -> str:
    if isinstance(body, dict):
        for key in ("task_id", "taskId", "id", "video_id"):
            value = body.get(key)
            if isinstance(value, (str, int)) and str(value):
                return str(value)
        for key in ("data", "task", "result"):
            found = find_task_id(body.get(key))
            if found:
                return found
    return ""


def find_status(body: Any) -> str:
    if isinstance(body, dict):
        for key in ("status", "state", "task_status"):
            value = body.get(key)
            if isinstance(value, str) and value:
                return value.lower()
        for key in ("data", "task", "result"):
            found = find_status(body.get(key))
            if found:
                return found
    return "unknown"


def find_video_url(body: Any) -> str:
    for key, value in nested_values(body):
        if key.lower() in {"video_url", "video", "url", "output_url", "download_url"}:
            if isinstance(value, str) and value.startswith(("http://", "https://")):
                return value
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            lowered = value.lower().split("?", 1)[0]
            if lowered.endswith((".mp4", ".mov", ".webm")):
                return value
    return ""


def load_api_key(config: dict[str, Any]) -> str:
    configured = Path(str(config["provider"]["credentialFile"]))
    key_path = configured if configured.is_absolute() else REPO_ROOT / configured
    value = key_path.read_text(encoding="utf-8").strip() if key_path.is_file() else ""
    if not value:
        raise EpisodeVideoError(f"project-local provider key is unavailable: {key_path}")
    return value


def upload_reference(path: Path, *, config: dict[str, Any], episode_id: str, segment_id: str) -> str:
    upload = config["referenceUpload"]
    digest = sha256(path)
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", path.name)[:120]
    object_key = (
        f"{str(upload['prefix']).strip('/')}/{episode_id}/{segment_id}/"
        f"{digest[:16]}-{safe_name}"
    )
    target = f"s3://{upload['bucket']}/{object_key}"
    subprocess.run(
        [
            "aws", "s3", "cp", str(path), target,
            "--region", str(upload["region"]),
            "--content-type", mimetypes.guess_type(path.name)[0] or "application/octet-stream",
            "--only-show-errors",
        ],
        check=True,
        timeout=900,
    )
    presign = subprocess.run(
        [
            "aws", "s3", "presign", target,
            "--region", str(upload["region"]),
            "--expires-in", str(upload["presignSeconds"]),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=60,
    )
    url = presign.stdout.strip()
    if not url.startswith(("http://", "https://")):
        raise EpisodeVideoError(f"S3 returned no signed URL for {path.name}")
    print(f"WORLDKIT_EPISODE_REFERENCE_READY {path.name}", flush=True)
    return url


def headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def safe_response(response: requests.Response) -> str:
    try:
        body: Any = response.json()
    except ValueError:
        body = response.text
    return f"HTTP {response.status_code}: {sanitize_text(body)}"


def provider_endpoint(config: dict[str, Any], task_id: str | None = None) -> str:
    provider = config["provider"]
    base = str(provider["baseUrl"]).rstrip("/")
    if task_id is None:
        return base + str(provider["submitPath"])
    return base + str(provider["pollPathTemplate"]).replace("{taskId}", task_id)


def submit(config: dict[str, Any], api_key: str, payload: dict[str, Any]) -> str:
    response = requests.post(provider_endpoint(config), headers=headers(api_key), json=payload, timeout=180)
    if not response.ok:
        raise EpisodeVideoError(f"provider submit rejected: {safe_response(response)}")
    task_id = find_task_id(response.json())
    if not task_id:
        raise EpisodeVideoError("provider submit returned no task id")
    return task_id


def poll(config: dict[str, Any], api_key: str, task_id: str, stage: str) -> str:
    provider = config["provider"]
    interval = max(5, int(provider.get("pollIntervalSeconds") or 15))
    deadline = time.monotonic() + max(60, int(provider.get("timeoutSeconds") or 7200))
    last_status = ""
    while time.monotonic() < deadline:
        try:
            response = requests.get(provider_endpoint(config, task_id), headers=headers(api_key), timeout=90)
        except requests.RequestException as error:
            print(
                f"WORLDKIT_EPISODE_{stage}_POLL_WARNING TRANSPORT_{type(error).__name__}",
                flush=True,
            )
            time.sleep(interval)
            continue
        if not response.ok:
            print(f"WORLDKIT_EPISODE_{stage}_POLL_WARNING HTTP_{response.status_code}", flush=True)
            time.sleep(interval)
            continue
        body = response.json()
        status = find_status(body)
        if status != last_status:
            last_status = status
            print(f"WORLDKIT_EPISODE_{stage}_STATUS {status}", flush=True)
        if status in SUCCESS:
            url = find_video_url(body)
            if not url:
                raise EpisodeVideoError(f"successful {stage} task has no video URL")
            return url
        if status in FAILURE:
            raise EpisodeVideoError(f"{stage} task failed: {sanitize_text(body)}")
        time.sleep(interval)
    raise EpisodeVideoError(f"{stage} task {task_id} timed out")


def download(url: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.{os.getpid()}.tmp")
    with requests.get(url, stream=True, timeout=600) as response:
        response.raise_for_status()
        with temporary.open("wb") as stream:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    stream.write(chunk)
    probe(temporary)
    os.replace(temporary, output)


def probe(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format",
            "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    body = json.loads(result.stdout)
    streams = body.get("streams") or []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if video is None:
        raise EpisodeVideoError(f"no video stream in {path.name}")
    numerator, denominator = (str(video.get("avg_frame_rate") or "0/1").split("/", 1) + ["1"])[:2]
    fps = float(numerator) / float(denominator or 1)
    raw_frames = video.get("nb_read_frames") or video.get("nb_frames") or 0
    return {
        "width": int(video["width"]),
        "height": int(video["height"]),
        "fps": fps,
        "frameCount": int(raw_frames) if str(raw_frames).isdigit() else 0,
        "durationSeconds": float((body.get("format") or {}).get("duration") or 0),
        "hasAudio": any(stream.get("codec_type") == "audio" for stream in streams),
        "sizeBytes": path.stat().st_size,
    }


def conform(
    video_source: Path,
    audio_source: Path,
    output: Path,
    delivery: dict[str, Any],
) -> dict[str, Any]:
    width = int(delivery["width"])
    height = int(delivery["height"])
    fps = int(delivery["fps"])
    frames = int(delivery["frameCount"])
    duration = frames / fps
    if not probe(audio_source)["hasAudio"]:
        raise EpisodeVideoError("Seedance output has no generated audio stream")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.{os.getpid()}.tmp.mp4")
    filters = (
        f"[0:v:0]scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,"
        f"fps={fps},tpad=stop_mode=clone:stop_duration={duration},"
        f"trim=duration={duration},setpts=N/({fps}*TB)[v];"
        f"[1:a:0]apad=pad_dur={duration},atrim=duration={duration},asetpts=PTS-STARTPTS[a]"
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-i", str(video_source), "-i", str(audio_source),
            "-filter_complex", filters, "-map", "[v]", "-map", "[a]",
            "-frames:v", str(frames), "-r", str(fps), "-fps_mode", "cfr",
            "-enc_time_base", f"1/{fps}", "-video_track_timescale", "24000",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
            "-t", str(duration), "-movflags", "+faststart", str(temporary),
        ],
        check=True,
        timeout=1800,
    )
    media = probe(temporary)
    if (
        media["width"] != width
        or media["height"] != height
        or abs(media["fps"] - fps) > 0.001
        or media["frameCount"] != frames
        or not media["hasAudio"]
    ):
        raise EpisodeVideoError(f"delivery conformance failed: {media}")
    os.replace(temporary, output)
    return media


def assert_source_covers_delivery(
    path: Path, delivery: dict[str, Any], label: str
) -> dict[str, Any]:
    """Reject a nominal provider success that returned only a short fragment."""
    media = probe(path)
    required_seconds = int(delivery["frameCount"]) / int(delivery["fps"])
    minimum_seconds = required_seconds - 1.0
    if media["durationSeconds"] < minimum_seconds:
        raise EpisodeVideoError(
            f"{label} output is too short for delivery: {media['durationSeconds']:.3f}s "
            f"< {minimum_seconds:.3f}s"
        )
    if media["fps"] <= 0 or media["frameCount"] < int(minimum_seconds * media["fps"]):
        raise EpisodeVideoError(f"{label} output has insufficient source frames: {media}")
    return media


def main() -> int:
    args = parse_args()
    request_path = Path(args.request).resolve()
    result_path = Path(args.result).resolve()
    config = json.loads(Path(args.config).resolve().read_text(encoding="utf-8"))
    request = json.loads(request_path.read_text(encoding="utf-8"))
    if request.get("kind") != "worldkit-episode-video-segment-request" or request.get("schemaVersion") != 2:
        raise EpisodeVideoError("episode video request identity is invalid")
    scene_id = safe_id(request.get("sceneId"), "sceneId")
    episode_id = safe_id(request.get("episodeId"), "episodeId")
    segment_id = safe_id(request.get("segmentId"), "segmentId")
    prompt_path = existing_file(request.get("promptPath"), "promptPath")
    reference_video = existing_file(request.get("referenceVideoPath"), "referenceVideoPath")
    reference_images = [
        existing_file(value, f"referenceImagePaths[{index}]")
        for index, value in enumerate(request.get("referenceImagePaths") or [])
    ]
    if not reference_images:
        raise EpisodeVideoError("at least one reference image is required")
    raw_provider = Path(str(request.get("rawProviderOutputPath") or "")).resolve()
    raw_upscale = Path(str(request.get("rawUpscaleOutputPath") or "")).resolve()
    output = Path(str(request.get("outputPath") or "")).resolve()
    prompt_body = json.loads(prompt_path.read_text(encoding="utf-8"))
    prompt = str(prompt_body.get("prompt") or "").strip()
    if not prompt:
        raise EpisodeVideoError("segment prompt is empty")

    previous: dict[str, Any] = {}
    if result_path.is_file():
        try:
            previous = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            previous = {}
    prompt_text_sha256 = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    prompt_file_sha256 = sha256(prompt_path)
    current_input_identity = {
        "providerModel": str(config["seedance"]["model"]),
        "upscaleModel": str(config["upscale"]["model"]),
        "promptTemplateVersion": str(
            prompt_body.get("promptTemplateVersion")
            or config.get("promptTemplateVersion")
            or "unversioned"
        ),
        # Provider behavior depends on the rendered prompt, not bookkeeping
        # fields (planHash/event hashes) stored beside it in the JSON artifact.
        "promptSha256": prompt_text_sha256,
        "referenceVideoSha256": sha256(reference_video),
        **{
            f"referenceImageSha256[{index}]:{image_path.name}": sha256(image_path)
            for index, image_path in enumerate(reference_images)
        },
    }
    previous_input_identity = previous.get("inputIdentity")
    if isinstance(previous_input_identity, dict) and previous_input_identity.get("promptSha256") == prompt_file_sha256:
        # One-time migration from the older whole-JSON identity. This branch is
        # safe only while that exact legacy JSON file is still present.
        previous_input_identity = {**previous_input_identity, "promptSha256": prompt_text_sha256}
    if isinstance(previous_input_identity, dict):
        # Upgrade a successful MG-only checkpoint into the MG + CF chain without
        # resubmitting MG when every actual generation input is unchanged.
        comparable = {
            key: value
            for key, value in current_input_identity.items()
            if key not in {"promptTemplateVersion", "upscaleModel"}
        }
        prior_comparable = {
            key: value
            for key, value in previous_input_identity.items()
            if key not in {"promptTemplateVersion", "upscaleModel"}
        }
        if prior_comparable == comparable:
            previous_input_identity = {
                **previous_input_identity,
                "promptTemplateVersion": current_input_identity["promptTemplateVersion"],
                "upscaleModel": current_input_identity["upscaleModel"],
            }
    inputs_match = previous_input_identity == current_input_identity
    if previous and not inputs_match:
        for stale_path in (raw_provider, raw_upscale, output):
            stale_path.unlink(missing_ok=True)
        previous = {}
    record: dict[str, Any] = {
        "kind": "worldkit-episode-video-segment-run",
        "schemaVersion": 1,
        "sceneId": scene_id,
        "episodeId": episode_id,
        "segmentId": segment_id,
        "startedAt": previous.get("startedAt") or utc_now(),
        "updatedAt": utc_now(),
        "finishedAt": previous.get("finishedAt") if previous.get("status") == "succeeded" else None,
        "status": previous.get("status") or "preparing-references",
        "providerTaskId": previous.get("providerTaskId"),
        "providerAttempts": previous.get("providerAttempts") or 0,
        "upscaleTaskId": previous.get("upscaleTaskId"),
        "upscaleAttempts": previous.get("upscaleAttempts") or 0,
        "modelChain": [config["seedance"]["model"], config["upscale"]["model"]],
        "inputIdentity": current_input_identity,
        "output": previous.get("output"),
        "error": None,
    }
    write_json_atomic(result_path, record)

    try:
        delivery = config["delivery"]
        reference = config.get("reference", delivery)
        reference_media = probe(reference_video)
        if (
            reference_media["width"] != int(reference["width"])
            or reference_media["height"] != int(reference["height"])
            or abs(reference_media["fps"] - int(reference["fps"])) > 0.001
            or reference_media["frameCount"] != int(reference["frameCount"])
        ):
            raise EpisodeVideoError(f"whitebox segment violates reference contract: {reference_media}")
        api_key = load_api_key(config)

        provider_task_id = str(record.get("providerTaskId") or "")
        provider_attempts = max(
            int(record.get("providerAttempts") or 0),
            1 if provider_task_id else 0,
        )
        if not raw_provider.is_file():
            while not raw_provider.is_file():
                if not provider_task_id:
                    if provider_attempts >= 3:
                        raise EpisodeVideoError("MG Seedance exhausted 3 terminal attempts")
                    image_urls = [
                        upload_reference(
                            path, config=config, episode_id=episode_id, segment_id=segment_id
                        )
                        for path in reference_images
                    ]
                    video_url = upload_reference(
                        reference_video, config=config, episode_id=episode_id, segment_id=segment_id
                    )
                    seedance = config["seedance"]
                    payload = {
                        "model": seedance["model"],
                        "prompt": prompt,
                        "aspect_ratio": seedance["aspectRatio"],
                        "resolution": seedance["resolution"],
                        "size": seedance["size"],
                        "seconds": seedance["seconds"],
                        "reference_image_urls": image_urls,
                        "reference_videos": [video_url],
                        "reference_audios": [],
                        "persist": True,
                        "bypass_face_check": True,
                    }
                    provider_task_id = submit(config, api_key, payload)
                    provider_attempts += 1
                    record.update({
                        "providerTaskId": provider_task_id,
                        "providerAttempts": provider_attempts,
                        "status": "provider-submitted",
                        "updatedAt": utc_now(),
                        "finishedAt": None,
                    })
                    write_json_atomic(result_path, record)
                    print(
                        f"WORLDKIT_EPISODE_SEEDANCE_SUBMITTED {provider_task_id} "
                        f"attempt={provider_attempts}/3",
                        flush=True,
                    )
                try:
                    provider_url = poll(config, api_key, provider_task_id, "SEEDANCE")
                except EpisodeVideoError as error:
                    if not should_retry_terminal_task(error, "SEEDANCE", provider_attempts):
                        raise
                    print(
                        f"WORLDKIT_EPISODE_SEEDANCE_RETRY terminal_attempt={provider_attempts}",
                        flush=True,
                    )
                    provider_task_id = ""
                    record.update({
                        "providerTaskId": None,
                        "providerAttempts": provider_attempts,
                        "status": "provider-retrying",
                        "updatedAt": utc_now(),
                        "finishedAt": None,
                    })
                    write_json_atomic(result_path, record)
                    time.sleep(5)
                    continue
                download(provider_url, raw_provider)
        assert_source_covers_delivery(raw_provider, delivery, "MG Seedance")
        if not probe(raw_provider)["hasAudio"]:
            raise EpisodeVideoError("Seedance output has no audio")
        if args.until == "seedance":
            record.update({"status": "seedance-ready", "updatedAt": utc_now(), "error": None})
            write_json_atomic(result_path, record)
            print("WORLDKIT_EPISODE_SEEDANCE_READY", flush=True)
            return 0

        upscale_task_id = str(record.get("upscaleTaskId") or "")
        upscale_attempts = max(
            int(record.get("upscaleAttempts") or 0),
            1 if upscale_task_id else 0,
        )
        if not raw_upscale.is_file():
            while not raw_upscale.is_file():
                if not upscale_task_id:
                    if upscale_attempts >= 3:
                        raise EpisodeVideoError("CF upscale exhausted 3 terminal attempts")
                    upscale_video_url = upload_reference(
                        raw_provider,
                        config=config,
                        episode_id=episode_id,
                        segment_id=f"{segment_id}-upscale",
                    )
                    upscale = config["upscale"]
                    payload = {
                        "model": upscale["model"],
                        "prompt": (
                            "仅进行清晰度与分辨率提升，严格保持输入视频的全部帧、时序、"
                            "构图、内容、颜色、动作和声音，不新增或删除任何视觉与声音内容。"
                        ),
                        "aspect_ratio": upscale["aspectRatio"],
                        "resolution": upscale["resolution"],
                        "size": upscale["size"],
                        "seconds": upscale["seconds"],
                        "reference_image_urls": [],
                        "reference_videos": [upscale_video_url],
                        "reference_audios": [],
                        "persist": True,
                        "bypass_face_check": True,
                    }
                    upscale_task_id = submit(config, api_key, payload)
                    upscale_attempts += 1
                    record.update({
                        "upscaleTaskId": upscale_task_id,
                        "upscaleAttempts": upscale_attempts,
                        "status": "upscale-submitted",
                        "updatedAt": utc_now(),
                    })
                    write_json_atomic(result_path, record)
                    print(
                        f"WORLDKIT_EPISODE_UPSCALE_SUBMITTED {upscale_task_id} "
                        f"attempt={upscale_attempts}/3",
                        flush=True,
                    )
                try:
                    upscale_url = poll(config, api_key, upscale_task_id, "UPSCALE")
                except EpisodeVideoError as error:
                    if not should_retry_terminal_task(error, "UPSCALE", upscale_attempts):
                        raise
                    print(
                        f"WORLDKIT_EPISODE_UPSCALE_RETRY terminal_attempt={upscale_attempts}",
                        flush=True,
                    )
                    upscale_task_id = ""
                    record.update({
                        "upscaleTaskId": None,
                        "status": "upscale-retrying",
                        "updatedAt": utc_now(),
                    })
                    write_json_atomic(result_path, record)
                    time.sleep(5)
                    continue
                download(upscale_url, raw_upscale)
        assert_source_covers_delivery(raw_upscale, delivery, "CF upscale")
        if args.until == "upscale":
            record.update({"status": "upscale-ready", "updatedAt": utc_now(), "error": None})
            write_json_atomic(result_path, record)
            print("WORLDKIT_EPISODE_UPSCALE_READY", flush=True)
            return 0

        media = conform(raw_upscale, raw_provider, output, delivery)
        record.update(
            {
                "status": "succeeded",
                "updatedAt": utc_now(),
                "finishedAt": utc_now(),
                "output": {
                    "fileName": output.name,
                    "sha256": sha256(output),
                    "media": media,
                    "frameParity": media["frameCount"] == reference_media["frameCount"],
                    "deliveryResolutionConformant": (
                        media["width"] == int(delivery["width"])
                        and media["height"] == int(delivery["height"])
                    ),
                    "referenceResolutionParity": (
                        media["width"] == reference_media["width"] and
                        media["height"] == reference_media["height"]
                    ),
                },
            }
        )
        write_json_atomic(result_path, record)
        print("WORLDKIT_EPISODE_VIDEO_SEGMENT_READY", flush=True)
        return 0
    except (EpisodeVideoError, OSError, ValueError, subprocess.SubprocessError, requests.RequestException) as error:
        record.update(
            {
                "status": "failed",
                "updatedAt": utc_now(),
                "finishedAt": utc_now(),
                "error": sanitize_text(str(error)),
            }
        )
        write_json_atomic(result_path, record)
        print(f"WORLDKIT_EPISODE_VIDEO_SEGMENT_FAILED {record['error']}", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
