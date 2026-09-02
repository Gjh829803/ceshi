#!/usr/bin/env python3
"""Generate one selected 30-second Episode capture with Seedance 2.5 720p.

The provider Job id is a durable checkpoint. Submission uncertainty retries the
same payload with the same Idempotency-Key; after a Job id exists, only that Job
is polled. Reference upload URLs and API credentials are never persisted.
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


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPO_ROOT / "config" / "episode-video-pipeline.json"
TERMINAL_FAILURE = {"failed", "refunded"}
MAX_MATERIAL_BYTES = 50 * 1024 * 1024


class EpisodeVideoError(RuntimeError):
    pass


class EpisodeVideoProviderTerminalError(EpisodeVideoError):
    def __init__(self, status: str, detail: Any):
        self.status = status
        self.detail = sanitized(detail)
        super().__init__(f"Seedance Job {status}: {self.detail}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--result", required=True)
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--until", choices=("seedance", "conformance"), default="conformance")
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def existing_file(value: Any, label: str) -> Path:
    path = Path(str(value or "")).expanduser().resolve()
    if not path.is_file() or path.is_symlink() or path.stat().st_size <= 0:
        raise EpisodeVideoError(f"{label} is missing or unsafe: {path}")
    return path


def project_local_file(value: Any, label: str) -> Path:
    configured = Path(str(value or ""))
    candidate = configured if configured.is_absolute() else REPO_ROOT / configured
    path = candidate.resolve()
    if candidate.is_symlink() or REPO_ROOT not in path.parents or not path.is_file():
        raise EpisodeVideoError(f"project-local {label} is unavailable: {path}")
    return path


def safe_id(value: Any, label: str) -> str:
    text = str(value or "")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,119}", text):
        raise EpisodeVideoError(f"invalid {label}: {text}")
    return text


def sanitized(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    text = re.sub(r"https?://[^\s\"']+", "<redacted-url>", text)
    text = re.sub(r"(?i)(authorization|api[_-]?key|token)[=: ]+[^,\s]+", r"\1=<redacted>", text)
    return text[:3000]


def api_headers(api_key: str, *, idempotency_key: str | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    return headers


def response_error(response: requests.Response) -> str:
    try:
        body: Any = response.json()
    except ValueError:
        body = response.text
    return f"HTTP {response.status_code}: {sanitized(body)}"


def provider_url(provider: dict[str, Any], path_value: str) -> str:
    return str(provider["baseUrl"]).rstrip("/") + path_value


def model_available(provider: dict[str, Any], api_key: str, model: str) -> None:
    response = requests.get(
        provider_url(provider, str(provider["modelsPath"])),
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=60,
    )
    if not response.ok:
        raise EpisodeVideoError(f"Seedance model query failed: {response_error(response)}")
    body = response.json()
    models = body.get("data") if isinstance(body, dict) else None
    if isinstance(models, dict):
        models = models.get("models") or models.get("data")
    if not isinstance(models, list):
        models = body.get("models") if isinstance(body, dict) else None
    if not isinstance(models, list) or not any(
        isinstance(item, dict) and item.get("id") == model for item in models
    ):
        raise EpisodeVideoError(f"Seedance model is unavailable: {model}")


def upload_material(
    path: Path,
    *,
    provider: dict[str, Any],
    api_key: str,
    episode_id: str,
    segment_id: str,
) -> str:
    if path.stat().st_size > MAX_MATERIAL_BYTES:
        raise EpisodeVideoError(
            f"Seedance material exceeds the documented 50 MiB limit: {path.name}"
        )
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    digest = sha256(path)
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", path.name)[:100]
    response = requests.post(
        provider_url(provider, str(provider["uploadSignPath"])),
        headers=api_headers(api_key),
        json={
            "folder": f"openapi/video/worldkit/{episode_id}/{segment_id}",
            "fileName": f"{digest[:16]}-{safe_name}",
            "contentType": content_type,
        },
        timeout=90,
    )
    if not response.ok:
        raise EpisodeVideoError(f"Seedance material signing failed: {response_error(response)}")
    data = response.json().get("data")
    if not isinstance(data, dict) or not str(data.get("uploadUrl") or "").startswith("https://") or not str(data.get("publicUrl") or "").startswith("https://"):
        raise EpisodeVideoError("Seedance material signing returned no upload/public URL")
    upload_headers = data.get("headers") if isinstance(data.get("headers"), dict) else {}
    with path.open("rb") as stream:
        upload = requests.put(
            str(data["uploadUrl"]),
            headers={str(key): str(value) for key, value in upload_headers.items()},
            data=stream,
            timeout=600,
        )
    if not upload.ok:
        raise EpisodeVideoError(f"Seedance material upload failed: HTTP {upload.status_code}")
    print(f"WORLDKIT_EPISODE_SEEDANCE25_REFERENCE_READY {path.name}", flush=True)
    return str(data["publicUrl"])


def submit_job(
    *,
    provider: dict[str, Any],
    api_key: str,
    idempotency_key: str,
    payload: dict[str, Any],
) -> str:
    last_error = ""
    for attempt in range(1, 4):
        try:
            response = requests.post(
                provider_url(provider, str(provider["submitPath"])),
                headers=api_headers(api_key, idempotency_key=idempotency_key),
                json=payload,
                timeout=180,
            )
        except requests.RequestException as error:
            last_error = f"transport {type(error).__name__}"
            if attempt < 3:
                time.sleep(2 * attempt)
                continue
            raise EpisodeVideoError(f"Seedance submit outcome is unknown: {last_error}") from error
        if response.ok:
            data = response.json().get("data")
            job_id = data.get("id") if isinstance(data, dict) else None
            if isinstance(job_id, str) and job_id:
                return job_id
            raise EpisodeVideoError("Seedance submit returned no Job id")
        if (response.status_code in {408, 429} or response.status_code >= 500) and attempt < 3:
            last_error = response_error(response)
            time.sleep(2 * attempt)
            continue
        raise EpisodeVideoError(f"Seedance submit rejected: {response_error(response)}")
    raise EpisodeVideoError(f"Seedance submit outcome is unknown: {last_error}")


def poll_job(provider: dict[str, Any], api_key: str, job_id: str) -> str:
    interval = max(5, int(provider.get("pollIntervalSeconds") or 8))
    deadline = time.monotonic() + max(60, int(provider.get("timeoutSeconds") or 7200))
    last_status = ""
    while time.monotonic() < deadline:
        path_value = str(provider["pollPathTemplate"]).replace("{taskId}", job_id)
        try:
            response = requests.get(
                provider_url(provider, path_value),
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=90,
            )
        except requests.RequestException as error:
            print(f"WORLDKIT_EPISODE_SEEDANCE25_POLL_WARNING {type(error).__name__}", flush=True)
            time.sleep(interval)
            continue
        if not response.ok:
            if response.status_code in {408, 429} or response.status_code >= 500:
                print(f"WORLDKIT_EPISODE_SEEDANCE25_POLL_WARNING HTTP_{response.status_code}", flush=True)
                time.sleep(interval)
                continue
            raise EpisodeVideoError(f"Seedance poll rejected: {response_error(response)}")
        data = response.json().get("data")
        if not isinstance(data, dict):
            raise EpisodeVideoError("Seedance poll returned no Job data")
        status = str(data.get("status") or "unknown").lower()
        if status != last_status:
            print(f"WORLDKIT_EPISODE_SEEDANCE25_STATUS {status} stage={data.get('stage')}", flush=True)
            last_status = status
        if status == "completed":
            result = data.get("result")
            url = result.get("url") if isinstance(result, dict) else None
            if isinstance(url, str) and url.startswith("https://"):
                return url
            raise EpisodeVideoError("Completed Seedance Job has no formal result URL")
        if status in TERMINAL_FAILURE:
            raise EpisodeVideoProviderTerminalError(status, data.get("error"))
        time.sleep(interval)
    raise EpisodeVideoError(f"Seedance Job {job_id} timed out")


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.download")
    with requests.get(url, stream=True, timeout=180) as response:
        if not response.ok:
            raise EpisodeVideoError(f"Seedance result download failed: HTTP {response.status_code}")
        with temporary.open("wb") as stream:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    stream.write(chunk)
    os.replace(temporary, destination)


def probe(path: Path) -> dict[str, Any]:
    completed = subprocess.run(
        ["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    body = json.loads(completed.stdout)
    streams = body.get("streams") or []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if not isinstance(video, dict):
        raise EpisodeVideoError(f"Video stream is missing: {path}")
    numerator, denominator = [int(item) for item in str(video.get("avg_frame_rate") or "0/1").split("/")]
    return {
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "fps": numerator / denominator if denominator else 0,
        "frameCount": int(video.get("nb_read_frames") or video.get("nb_frames") or 0),
        "durationSeconds": float((body.get("format") or {}).get("duration") or video.get("duration") or 0),
        "hasAudio": any(stream.get("codec_type") == "audio" for stream in streams),
        "sizeBytes": path.stat().st_size,
    }


def raw_checkpoint_is_valid(path: Path, receipt: Any) -> bool:
    if not path.is_file() or path.stat().st_size <= 0 or not isinstance(receipt, dict):
        return False
    if receipt.get("sha256") != sha256(path):
        return False
    try:
        media = probe(path)
    except Exception:  # noqa: BLE001 - corrupt checkpoint is recoverable
        return False
    return media["durationSeconds"] >= 29.5 and media["hasAudio"] is True


def conform(source: Path, destination: Path) -> dict[str, Any]:
    source_media = probe(source)
    if source_media["durationSeconds"] < 29.5 or not source_media["hasAudio"]:
        raise EpisodeVideoError(f"Seedance source media is incomplete: {source_media}")
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-i", str(source),
            "-filter_complex",
            "[0:v]fps=24,scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,trim=duration=30,setpts=N/(24*TB)[v];[0:a]aresample=48000:async=1,apad=pad_dur=30,atrim=duration=30,asetpts=N/SR/TB[a]",
            "-map", "[v]", "-map", "[a]", "-frames:v", "720", "-r", "24",
            "-fps_mode", "cfr", "-enc_time_base", "1/24", "-video_track_timescale", "24000",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart", str(destination),
        ],
        check=True,
        timeout=1800,
    )
    media = probe(destination)
    if media["width"] != 1280 or media["height"] != 720 or media["fps"] != 24 or media["frameCount"] != 720 or abs(media["durationSeconds"] - 30) > 0.05 or not media["hasAudio"]:
        raise EpisodeVideoError(f"Final Seedance conformance failed: {media}")
    return media


def main() -> None:
    args = parse_args()
    request_path = existing_file(args.request, "request")
    result_path = Path(args.result).resolve()
    config = read_json(existing_file(args.config, "pipeline config"))
    request = read_json(request_path)
    if config.get("kind") != "worldkit-episode-video-pipeline" or config.get("schemaVersion") != 2:
        raise EpisodeVideoError("Episode video pipeline config identity is invalid")
    if request.get("kind") != "worldkit-episode-video-segment-request" or request.get("schemaVersion") != 2:
        raise EpisodeVideoError("Episode video request identity is invalid")
    scene_id = safe_id(request.get("sceneId"), "sceneId")
    episode_id = safe_id(request.get("episodeId"), "episodeId")
    segment_id = safe_id(request.get("segmentId"), "segmentId")
    prompt_file = existing_file(request.get("promptPath"), "Seedance prompt")
    prompt_record = read_json(prompt_file)
    prompt = str(prompt_record.get("prompt") or "").strip()
    seedance = config["seedance"]
    if not prompt or len(prompt) > int(seedance.get("maxPromptChars") or 15000):
        raise EpisodeVideoError(f"Seedance prompt length is invalid: {len(prompt)}")
    reference_video = existing_file(request.get("referenceVideoPath"), "whitebox reference video")
    reference_images = [existing_file(item, "styled reference image") for item in request.get("referenceImagePaths") or []]
    if len(reference_images) < 2 or len(reference_images) > 30:
        raise EpisodeVideoError("Seedance requires the styled opening frame plus all declared tri-views")
    raw_output = Path(str(request.get("rawProviderOutputPath") or "")).resolve()
    final_output = Path(str(request.get("outputPath") or "")).resolve()
    for output in (raw_output, final_output, result_path):
        if REPO_ROOT not in output.parents:
            raise EpisodeVideoError(f"Episode output escaped project root: {output}")

    provider = config["seedanceProvider"]
    api_key = project_local_file(provider["credentialFile"], "Infinite Canvas API key").read_text(encoding="utf-8").strip()
    model = str(seedance["model"])
    material_hashes = [sha256(reference_video), *(sha256(image) for image in reference_images)]
    input_identity = {
        "provider": str(provider["kind"]),
        "model": model,
        "promptTemplateVersion": str(config["promptTemplateVersion"]),
        "promptSha256": sha256_text(prompt),
        "referenceVideoSha256": material_hashes[0],
        **{f"referenceImageSha256[{index}]:{image.name}": material_hashes[index + 1] for index, image in enumerate(reference_images)},
    }
    previous = read_json(result_path) if result_path.is_file() else {}
    if previous.get("inputIdentity") != input_identity:
        # A provider output is valid only for the exact Prompt + reference
        # identity that produced it. Re-conforming an older raw video after a
        # Prompt or image update would create a false-success receipt for stale
        # pixels, so invalidate both local media checkpoints before resubmitting.
        raw_output.unlink(missing_ok=True)
        final_output.unlink(missing_ok=True)
        previous = {}
    raw_receipt = previous.get("rawProviderOutput")
    raw_valid = raw_checkpoint_is_valid(raw_output, raw_receipt)
    if previous.get("status") in TERMINAL_FAILURE:
        raw_valid = False
    if raw_output.is_file() and not raw_valid:
        raw_output.unlink(missing_ok=True)
    provider_attempt = max(1, int(previous.get("providerAttempt") or 1))
    if previous.get("status") in TERMINAL_FAILURE:
        maximum_terminal_attempts = max(1, int(provider.get("maxTerminalAttempts") or 1))
        if provider_attempt >= maximum_terminal_attempts:
            raise EpisodeVideoError(
                f"Seedance terminal retry limit reached after {provider_attempt} attempts: "
                f"{sanitized(previous.get('error'))}"
            )
        provider_attempt += 1
        job_id = ""
        previous.pop("providerRequest", None)
    job_id = str(previous.get("providerJobId") or "")
    if previous.get("status") in TERMINAL_FAILURE:
        job_id = ""

    if not raw_valid:
        model_available(provider, api_key, model)
        if not job_id:
            saved_payload = previous.get("providerRequest")
            saved_idempotency_key = previous.get("idempotencyKey")
            if isinstance(saved_payload, dict) and isinstance(saved_idempotency_key, str):
                payload = saved_payload
                idempotency_key = saved_idempotency_key
            else:
                video_url = upload_material(
                    reference_video,
                    provider=provider,
                    api_key=api_key,
                    episode_id=episode_id,
                    segment_id=segment_id,
                )
                image_urls = [
                    upload_material(
                        image,
                        provider=provider,
                        api_key=api_key,
                        episode_id=episode_id,
                        segment_id=segment_id,
                    )
                    for image in reference_images
                ]
                idempotency_key = "worldkit-" + sha256_text(json.dumps({
                    "episodeId": episode_id,
                    "segmentId": segment_id,
                    "inputIdentity": input_identity,
                    "providerAttempt": provider_attempt,
                }, sort_keys=True, separators=(",", ":")))
                payload = {
                    "model": model,
                    "prompt": prompt,
                    "duration": int(seedance["duration"]),
                    "resolution": str(seedance["resolution"]),
                    "ratio": str(seedance["ratio"]),
                    "generate_audio": bool(seedance.get("generateAudio", True)),
                    "images": image_urls,
                    "videos": [video_url],
                }
                write_json_atomic(result_path, {
                    "kind": "worldkit-episode-video-provider-run",
                    "schemaVersion": 3,
                    "sceneId": scene_id,
                    "episodeId": episode_id,
                    "segmentId": segment_id,
                    "status": "seedance-submitting",
                    "providerJobId": None,
                    "providerAttempt": provider_attempt,
                    "modelChain": [model],
                    "inputIdentity": input_identity,
                    "idempotencyKey": idempotency_key,
                    "providerRequest": payload,
                    "createdAt": previous.get("createdAt") or utc_now(),
                    "updatedAt": utc_now(),
                })
            job_id = submit_job(
                provider=provider,
                api_key=api_key,
                idempotency_key=idempotency_key,
                payload=payload,
            )
            write_json_atomic(result_path, {
                "kind": "worldkit-episode-video-provider-run",
                "schemaVersion": 3,
                "sceneId": scene_id,
                "episodeId": episode_id,
                "segmentId": segment_id,
                "status": "seedance-submitted",
                "providerJobId": job_id,
                "providerAttempt": provider_attempt,
                "modelChain": [model],
                "inputIdentity": input_identity,
                "idempotencyKey": idempotency_key,
                "providerRequest": payload,
                "createdAt": previous.get("createdAt") or utc_now(),
                "updatedAt": utc_now(),
            })
            print(f"WORLDKIT_EPISODE_SEEDANCE25_SUBMITTED {job_id}", flush=True)
        try:
            result_url = poll_job(provider, api_key, job_id)
        except EpisodeVideoProviderTerminalError as error:
            record = read_json(result_path) if result_path.is_file() else {}
            record.update({
                "kind": "worldkit-episode-video-provider-run",
                "schemaVersion": 3,
                "sceneId": scene_id,
                "episodeId": episode_id,
                "segmentId": segment_id,
                "status": error.status,
                "providerJobId": job_id,
                "providerAttempt": provider_attempt,
                "modelChain": [model],
                "inputIdentity": input_identity,
                "updatedAt": utc_now(),
                "error": error.detail,
            })
            record.pop("providerRequest", None)
            write_json_atomic(result_path, record)
            raise
        download(result_url, raw_output)
        raw_media = probe(raw_output)
        if raw_media["durationSeconds"] < 29.5 or not raw_media["hasAudio"]:
            raw_output.unlink(missing_ok=True)
            raise EpisodeVideoError(f"Seedance source media is incomplete: {raw_media}")
        raw_receipt = {
            "fileName": raw_output.name,
            "sha256": sha256(raw_output),
            "media": raw_media,
            "resultUrl": result_url,
        }
        print("WORLDKIT_EPISODE_SEEDANCE25_READY", flush=True)

    if args.until == "seedance":
        record = read_json(result_path) if result_path.is_file() else {}
        record.update({
            "kind": "worldkit-episode-video-provider-run",
            "schemaVersion": 3,
            "sceneId": scene_id,
            "episodeId": episode_id,
            "segmentId": segment_id,
            "status": "seedance-ready",
            "providerJobId": job_id or record.get("providerJobId"),
            "providerAttempt": provider_attempt,
            "modelChain": [model],
            "inputIdentity": input_identity,
            "rawProviderOutput": raw_receipt,
            "updatedAt": utc_now(),
        })
        record.pop("providerRequest", None)
        write_json_atomic(result_path, record)
        return

    media = conform(raw_output, final_output)
    record = read_json(result_path) if result_path.is_file() else {}
    record.update({
        "kind": "worldkit-episode-video-provider-run",
        "schemaVersion": 3,
        "sceneId": scene_id,
        "episodeId": episode_id,
        "segmentId": segment_id,
        "status": "succeeded",
        "providerJobId": job_id or record.get("providerJobId"),
        "providerAttempt": provider_attempt,
        "modelChain": [model],
        "inputIdentity": input_identity,
        "rawProviderOutput": raw_receipt,
        "updatedAt": utc_now(),
        "error": None,
        "output": {
            "fileName": final_output.name,
            "sha256": sha256(final_output),
            "media": media,
            "frameParity": True,
            "deliveryResolutionConformant": True,
            "referenceResolutionParity": True,
        },
    })
    record.pop("providerRequest", None)
    write_json_atomic(result_path, record)
    print("WORLDKIT_EPISODE_VIDEO_SEGMENT_READY", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - CLI boundary
        print(f"WORLDKIT_EPISODE_VIDEO_SEGMENT_FAILED {sanitized(str(error))}", flush=True)
        raise
