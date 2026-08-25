#!/usr/bin/env python3
"""Run one WorldKit whitebox-to-styled Seedance 2.5 reference-video task.

The request contains only local paths and stable identifiers. Reference media is
uploaded to private S3 objects and exposed to Ark with short-lived signed URLs.
Secrets and signed URLs are never written to the sanitized result file.
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
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = REPO_ROOT / "config" / "seedance25-reference-video.json"
SUCCESS_STATUSES = {"succeeded"}
FAILURE_STATUSES = {"failed", "cancelled", "canceled"}


class SeedanceRunError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--result", required=True)
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    return parser.parse_args()


def now() -> str:
    return datetime.now(UTC).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_id(value: Any, label: str) -> str:
    text = str(value or "")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,79}", text):
        raise SeedanceRunError(f"invalid {label}: {text}")
    return text


def resolve_file(value: Any, label: str) -> Path:
    path = Path(str(value or "")).expanduser().resolve()
    if not path.is_file() or path.stat().st_size <= 0:
        raise SeedanceRunError(f"{label} is missing or empty: {path}")
    return path


def sanitize_text(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    text = re.sub(r"https?://[^\s\"']+", "<redacted-url>", text)
    text = re.sub(
        r"(?i)(authorization|api[_-]?key|token)[=: ]+[^,\s]+",
        r"\1=<redacted>",
        text,
    )
    return text[:2000]


def sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: sanitize(item)
            for key, item in value.items()
            if key not in {"video_url", "temp_url", "api_key", "authorization"}
        }
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    if isinstance(value, str):
        return sanitize_text(value)
    return value


def write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def load_api_key(config: dict[str, Any]) -> str:
    credentials = config.get("credentials") or {}
    environment_name = str(credentials.get("environmentVariable") or "ARK_API_KEY")
    value = os.environ.get(environment_name, "").strip()
    if value:
        return value
    service = str(credentials.get("keychainService") or "")
    account = str(credentials.get("keychainAccount") or "")
    if not service or not account:
        raise SeedanceRunError("Seedance credential configuration is incomplete")
    result = subprocess.run(
        [
            "security",
            "find-generic-password",
            "-s",
            service,
            "-a",
            account,
            "-w",
        ],
        capture_output=True,
        text=True,
        timeout=15,
    )
    value = result.stdout.strip() if result.returncode == 0 else ""
    if not value:
        raise SeedanceRunError(
            f"Seedance 2.5 key is unavailable in Keychain service={service} account={account}"
        )
    return value


def upload_reference(
    path: Path,
    *,
    config: dict[str, Any],
    scene_id: str,
    recording_id: str,
) -> str:
    upload = config.get("referenceUpload") or {}
    bucket = str(upload.get("bucket") or "")
    region = str(upload.get("region") or "")
    prefix = str(upload.get("prefix") or "").strip("/")
    expires = int(upload.get("presignSeconds") or 86400)
    if not bucket or not region or not prefix or not (900 <= expires <= 604800):
        raise SeedanceRunError("referenceUpload configuration is invalid")
    digest = sha256(path)
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", path.name)[:120]
    object_key = f"{prefix}/{scene_id}/{recording_id}/{digest[:16]}-{safe_name}"
    target = f"s3://{bucket}/{object_key}"
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    subprocess.run(
        [
            "aws",
            "s3",
            "cp",
            str(path),
            target,
            "--region",
            region,
            "--content-type",
            mime_type,
            "--only-show-errors",
        ],
        check=True,
        timeout=900,
    )
    presign = subprocess.run(
        [
            "aws",
            "s3",
            "presign",
            target,
            "--region",
            region,
            "--expires-in",
            str(expires),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    url = presign.stdout.strip()
    if not url.startswith(("http://", "https://")):
        raise SeedanceRunError(f"S3 did not return a signed URL for {path.name}")
    print(f"WORLDKIT_SEEDANCE25_REFERENCE_READY {path.name}", flush=True)
    return url


def headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def safe_response(response: requests.Response) -> str:
    try:
        body: Any = response.json()
    except ValueError:
        body = response.text
    return f"HTTP {response.status_code}: {sanitize_text(body)}"


def probe_video(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=60,
    )
    body = json.loads(result.stdout)
    streams = body.get("streams") or []
    video = next(
        (stream for stream in streams if stream.get("codec_type") == "video"),
        None,
    )
    if video is None:
        raise SeedanceRunError("generated file has no decodable video stream")
    rate = str(video.get("avg_frame_rate") or "0/1").split("/", 1)
    denominator = float(rate[1] or 1) if len(rate) == 2 else 1.0
    fps = float(rate[0]) / denominator if denominator else 0.0
    return {
        "width": int(video["width"]),
        "height": int(video["height"]),
        "durationSeconds": float(body["format"]["duration"]),
        "sizeBytes": path.stat().st_size,
        "videoCodec": video.get("codec_name"),
        "fps": fps,
        "hasAudio": any(stream.get("codec_type") == "audio" for stream in streams),
    }


def download_video(url: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.{os.getpid()}.tmp.mp4")
    with requests.get(url, stream=True, timeout=300) as response:
        response.raise_for_status()
        with temporary.open("wb") as stream:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    stream.write(chunk)
    probe_video(temporary)
    os.replace(temporary, output)


def main() -> int:
    args = parse_args()
    request_path = Path(args.request).resolve()
    result_path = Path(args.result).resolve()
    config_path = Path(args.config).resolve()
    request = json.loads(request_path.read_text(encoding="utf-8"))
    config = json.loads(config_path.read_text(encoding="utf-8"))
    scene_id = safe_id(request.get("sceneId"), "sceneId")
    recording_id = safe_id(request.get("recordingId"), "recordingId")
    prompt_path = resolve_file(request.get("promptPath"), "promptPath")
    reference_video = resolve_file(request.get("referenceVideoPath"), "referenceVideoPath")
    reference_images = [
        resolve_file(value, f"referenceImagePaths[{index}]")
        for index, value in enumerate(request.get("referenceImagePaths") or [])
    ]
    if not reference_images:
        raise SeedanceRunError("at least one reference image is required")
    output_path = Path(str(request.get("outputPath") or "")).resolve()
    if output_path.suffix.lower() != ".mp4":
        raise SeedanceRunError("outputPath must end in .mp4")
    prompt = prompt_path.read_text(encoding="utf-8").strip()
    if not prompt:
        raise SeedanceRunError("final prompt is empty")

    started_at = now()
    input_paths = [prompt_path, reference_video, *reference_images]
    record: dict[str, Any] = {
        "kind": "worldkit-seedance25-reference-video-run",
        "schemaVersion": 1,
        "sceneId": scene_id,
        "recordingId": recording_id,
        "startedAt": started_at,
        "finishedAt": None,
        "status": "preparing-references",
        "taskId": None,
        "modelEndpoint": config.get("modelEndpoint"),
        "resolvedModel": config.get("resolvedModel"),
        "inputSha256": {path.name: sha256(path) for path in input_paths},
        "output": None,
        "error": None,
    }
    write_json_atomic(result_path, record)

    try:
        api_key = load_api_key(config)
        image_urls = [
            upload_reference(
                path,
                config=config,
                scene_id=scene_id,
                recording_id=recording_id,
            )
            for path in reference_images
        ]
        video_url = upload_reference(
            reference_video,
            config=config,
            scene_id=scene_id,
            recording_id=recording_id,
        )
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        content.extend(
            {
                "type": "image_url",
                "image_url": {"url": url},
                "role": "reference_image",
            }
            for url in image_urls
        )
        content.append(
            {
                "type": "video_url",
                "video_url": {"url": video_url},
                "role": "reference_video",
            }
        )
        defaults = config.get("videoEditingDefaults") or {}
        payload = {
            "model": config["modelEndpoint"],
            "content": content,
            "generate_audio": bool(defaults.get("generateAudio", False)),
            "ratio": str(defaults.get("ratio") or "adaptive"),
            "duration": int(defaults.get("duration", -1)),
            "watermark": bool(defaults.get("watermark", False)),
        }
        endpoint = str(config["apiBaseUrl"]).rstrip("/")
        response = requests.post(
            endpoint,
            headers=headers(api_key),
            json=payload,
            timeout=180,
        )
        if not response.ok:
            raise SeedanceRunError(f"Ark submit rejected: {safe_response(response)}")
        body = response.json()
        task_id = str(body.get("id") or "")
        if not task_id:
            raise SeedanceRunError("Ark submit returned no task id")
        record.update({"status": "submitted", "taskId": task_id})
        write_json_atomic(result_path, record)
        print(f"WORLDKIT_SEEDANCE25_SUBMITTED {task_id}", flush=True)

        polling = config.get("poll") or {}
        interval_seconds = max(5, int(polling.get("intervalSeconds") or 15))
        timeout_seconds = max(60, int(polling.get("timeoutSeconds") or 3600))
        deadline = time.monotonic() + timeout_seconds
        last_status = ""
        while time.monotonic() < deadline:
            time.sleep(interval_seconds)
            try:
                response = requests.get(
                    f"{endpoint}/{task_id}",
                    headers=headers(api_key),
                    timeout=90,
                )
            except requests.RequestException as error:
                print(f"WORLDKIT_SEEDANCE25_POLL_WARNING {type(error).__name__}", flush=True)
                continue
            if not response.ok:
                print(f"WORLDKIT_SEEDANCE25_POLL_WARNING HTTP_{response.status_code}", flush=True)
                continue
            body = response.json()
            status = str(body.get("status") or "unknown").lower()
            if status != last_status:
                last_status = status
                record["status"] = status
                record["resolvedModel"] = str(body.get("model") or config.get("resolvedModel") or "")
                write_json_atomic(result_path, record)
                print(f"WORLDKIT_SEEDANCE25_STATUS {status}", flush=True)
            if status in SUCCESS_STATUSES:
                content_body = body.get("content") if isinstance(body.get("content"), dict) else {}
                generated_url = content_body.get("video_url") or body.get("video_url")
                if not generated_url:
                    raise SeedanceRunError("successful Ark task response has no video URL")
                download_video(str(generated_url), output_path)
                media = probe_video(output_path)
                record.update(
                    {
                        "finishedAt": now(),
                        "status": "succeeded",
                        "output": {
                            "fileName": output_path.name,
                            "sha256": sha256(output_path),
                            "media": media,
                        },
                        "error": None,
                    }
                )
                write_json_atomic(result_path, record)
                print("WORLDKIT_SEEDANCE25_READY", flush=True)
                return 0
            if status in FAILURE_STATUSES:
                raise SeedanceRunError(f"Ark task failed: {sanitize_text(body)}")
        raise SeedanceRunError(f"Ark poll timed out after {timeout_seconds} seconds")
    except (
        OSError,
        ValueError,
        subprocess.SubprocessError,
        requests.RequestException,
        SeedanceRunError,
    ) as error:
        record.update(
            {
                "finishedAt": now(),
                "status": "failed",
                "error": sanitize_text(str(error)),
            }
        )
        write_json_atomic(result_path, record)
        print(f"WORLDKIT_SEEDANCE25_FAILED {record['error']}", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
