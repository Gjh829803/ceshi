#!/usr/bin/env python3
"""Check a Creator delivery as data; this never runs scene or browser code."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import sys
import tarfile
import tempfile
import unicodedata
import zlib
from datetime import datetime, timezone
from fractions import Fraction
from typing import Any, Callable

SHA256 = re.compile(r"^sha256:[a-f0-9]{64}$")
MAX_JSON_BYTES = 4 * 1024 * 1024
CHUNK = 1024 * 1024


class VerificationFailure(Exception):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code


def require(condition: bool, code: str, detail: str) -> None:
    if not condition:
        raise VerificationFailure(code, detail)


def sha256_file(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        while chunk := stream.read(CHUNK):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def json_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        require(key not in result, "JSON_DUPLICATE_KEY", f"Duplicate JSON key: {key[:120]}")
        result[key] = value
    return result


def read_json(file: Path) -> Any:
    require(file.is_file() and not file.is_symlink(), "JSON_FILE_MISSING", str(file))
    require(file.stat().st_size <= MAX_JSON_BYTES, "JSON_SIZE_EXCEEDED", file.name)
    try:
        return json.loads(file.read_text("utf-8"), object_pairs_hook=json_pairs,
                          parse_constant=lambda value: (_ for _ in ()).throw(
                              VerificationFailure("JSON_NONFINITE_NUMBER", value)))
    except (ValueError, UnicodeError, RecursionError) as error:
        raise VerificationFailure("JSON_INVALID", f"{file.name}: {error}") from error


def number(value: Any, label: str, minimum: float = 0) -> float:
    require(type(value) in (int, float) and math.isfinite(value) and value >= minimum,
            "NUMBER_INVALID", f"{label} must be finite and >= {minimum}")
    return float(value)


def integer(value: Any, label: str, minimum: int = 0) -> int:
    require(type(value) is int and value >= minimum, "INTEGER_INVALID", label)
    return value


def canonical_path(name: str, directory: bool = False) -> str:
    require(isinstance(name, str), "ARCHIVE_PATH_INVALID", "Path must be text")
    if directory:
        name = name.rstrip("/")
    require(0 < len(name.encode("utf-8")) <= 1024 and len(name.split("/")) <= 32,
            "ARCHIVE_PATH_INVALID", "Path length/depth exceeded")
    require(unicodedata.normalize("NFC", name) == name and "\\" not in name
            and ":" not in name and not name.startswith("/")
            and all(ord(character) >= 32 and ord(character) != 127 for character in name)
            and all(part not in ("", ".", "..") for part in name.split("/")),
            "ARCHIVE_PATH_INVALID", repr(name[:200]))
    return name


def freeze_archive(source: Path, destination: Path, maximum: int) -> str:
    digest = hashlib.sha256()
    size = 0
    with source.open("rb") as incoming, destination.open("xb") as output:
        while chunk := incoming.read(CHUNK):
            size += len(chunk)
            require(size <= maximum, "ARCHIVE_SIZE_EXCEEDED", str(maximum))
            digest.update(chunk)
            output.write(chunk)
    require(size > 0, "ARCHIVE_EMPTY", source.name)
    return "sha256:" + digest.hexdigest()


def decompress_tar(archive: Path, raw: Path, maximum: int) -> None:
    size = 0
    with gzip.open(archive, "rb") as incoming, raw.open("xb") as output:
        while chunk := incoming.read(CHUNK):
            size += len(chunk)
            require(size <= maximum, "EXPANDED_ARCHIVE_SIZE_EXCEEDED", str(maximum))
            output.write(chunk)


def preflight_headers(raw: Path, limits: argparse.Namespace) -> None:
    """Bound extension records before tarfile is allowed to parse their payloads."""
    size = raw.stat().st_size
    count = 0
    metadata_bytes = 0
    with raw.open("rb") as stream:
        while True:
            header = stream.read(512)
            require(len(header) == 512, "TAR_TRUNCATED", "Missing complete tar end marker")
            if header == b"\0" * 512:
                require(stream.read(512) == b"\0" * 512, "TAR_END_INVALID", "Two zero blocks required")
                while trailing := stream.read(CHUNK):
                    require(not trailing.strip(b"\0"), "TAR_TRAILING_DATA", "Nonzero data after tar end")
                return
            count += 1
            require(count <= limits.max_members * 3, "TAR_HEADER_COUNT_EXCEEDED", str(count))
            info = tarfile.TarInfo.frombuf(header, "utf-8", "strict")
            require(info.size >= 0, "TAR_SIZE_INVALID", info.name)
            if info.type in (tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.GNUTYPE_LONGNAME,
                             tarfile.GNUTYPE_LONGLINK):
                metadata_bytes += info.size
                require(info.size <= 64 * 1024 and metadata_bytes <= 8 * 1024 * 1024,
                        "TAR_METADATA_SIZE_EXCEEDED", info.name)
            else:
                require(info.type in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE),
                        "TAR_MEMBER_TYPE_FORBIDDEN", f"{info.name}: {info.type!r}")
                require(info.size <= limits.max_file_bytes, "TAR_MEMBER_SIZE_EXCEEDED", info.name)
            next_offset = stream.tell() + ((info.size + 511) // 512) * 512
            require(next_offset <= size, "TAR_TRUNCATED", info.name)
            stream.seek(next_offset)


def safe_extract(raw: Path, payload: Path, limits: argparse.Namespace) -> dict[str, int]:
    preflight_headers(raw, limits)
    # PAX xattrs may contain arbitrary bytes; path validation still requires
    # canonical UTF-8 and no xattr/ownership metadata is applied to output.
    with tarfile.open(raw, "r:", encoding="utf-8", errors="surrogateescape") as archive:
        members = []
        names: dict[str, tarfile.TarInfo] = {}
        folded = set()
        total = 0
        for info in archive:
            require(len(members) < limits.max_members, "TAR_MEMBER_COUNT_EXCEEDED", str(limits.max_members))
            require((info.isreg() or info.isdir()) and info.sparse is None,
                    "TAR_MEMBER_TYPE_FORBIDDEN", info.name)
            name = canonical_path(info.name, info.isdir())
            require(name.casefold() not in folded, "TAR_DUPLICATE_PATH", name)
            require(0 <= info.size <= limits.max_file_bytes, "TAR_MEMBER_SIZE_EXCEEDED", name)
            require(not info.isdir() or info.size == 0, "TAR_DIRECTORY_PAYLOAD", name)
            total += info.size
            require(total <= limits.max_expanded_bytes, "TAR_TOTAL_SIZE_EXCEEDED", str(total))
            names[name] = info
            folded.add(name.casefold())
            members.append((name, info))
        for name in names:
            for parent in PurePosixPath(name).parents:
                if str(parent) == ".":
                    continue
                require(str(parent) not in names or names[str(parent)].isdir(),
                        "TAR_PARENT_IS_FILE", name)
        payload.mkdir()
        for name, info in members:
            target = payload.joinpath(*name.split("/"))
            if info.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            require(target.resolve().is_relative_to(payload.resolve()), "EXTRACTION_ESCAPE", name)
            incoming = archive.extractfile(info)
            require(incoming is not None, "TAR_MEMBER_UNREADABLE", name)
            with incoming, target.open("xb") as output:
                remaining = info.size
                while remaining:
                    chunk = incoming.read(min(CHUNK, remaining))
                    require(bool(chunk), "TAR_MEMBER_TRUNCATED", name)
                    output.write(chunk)
                    remaining -= len(chunk)
            os.chmod(target, 0o644)
    return {name: info.size for name, info in members if info.isreg()}


def png_dimensions(file: Path) -> dict[str, int]:
    with file.open("rb") as stream:
        header = stream.read(33)
    require(len(header) == 33 and header[:8] == b"\x89PNG\r\n\x1a\n"
            and struct.unpack(">I", header[8:12])[0] == 13 and header[12:16] == b"IHDR",
            "PNG_IHDR_INVALID", file.name)
    require(zlib.crc32(header[12:29]) & 0xffffffff == struct.unpack(">I", header[29:33])[0],
            "PNG_IHDR_CRC_INVALID", file.name)
    width, height = struct.unpack(">II", header[16:24])
    require(0 < width <= 8192 and 0 < height <= 8192 and width * height <= 32_000_000,
            "PNG_DIMENSIONS_INVALID", f"{file.name}: {width}x{height}")
    return {"widthPixels": width, "heightPixels": height}


def image_evidence(payload: Path, expected_name: str, metadata: dict[str, Any],
                   hashes: dict[str, str]) -> dict[str, Any]:
    require(isinstance(metadata, dict) and isinstance(metadata.get("path"), str),
            "IMAGE_METADATA_INVALID", expected_name)
    require(PurePosixPath(metadata["path"]).name == expected_name and expected_name in hashes,
            "IMAGE_PATH_MISMATCH", expected_name)
    actual = sha256_file(payload / expected_name)
    require(metadata.get("sha256") == actual == hashes[expected_name], "IMAGE_HASH_MISMATCH", expected_name)
    dimensions = png_dimensions(payload / expected_name)
    require(all(metadata.get(key) == value for key, value in dimensions.items()),
            "IMAGE_DIMENSIONS_MISMATCH", expected_name)
    return {"path": expected_name, "sha256": actual, **dimensions}


def decode_video(file: Path, report: dict[str, Any], ffprobe: str) -> dict[str, Any]:
    require(isinstance(report.get("videoPath"), str)
            and PurePosixPath(report["videoPath"]).name == file.name,
            "VIDEO_PATH_MISMATCH", "Report must identify playtest.mp4")
    fps = number(report.get("framesPerSecond"), "framesPerSecond", 1)
    require(fps in (1, 2, 3, 6), "VIDEO_FPS_UNSUPPORTED", str(fps))
    simulation = number(report.get("actualSimulationSeconds"), "actualSimulationSeconds", 180)
    command = [ffprobe, "-v", "error", "-err_detect", "explode", "-threads", "1",
               "-protocol_whitelist", "file", "-enable_drefs", "0", "-f", "mov",
               "-count_frames", "-select_streams", "v", "-show_entries",
               "stream=codec_type,width,height,avg_frame_rate,nb_read_frames,duration,duration_ts,time_base:format=duration,format_name",
               "-of", "json", str(file)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
    require(result.returncode == 0 and not result.stderr.strip(), "VIDEO_DECODE_FAILED", result.stderr[-2000:])
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    require(len(streams) == 1, "VIDEO_STREAM_COUNT_INVALID", str(len(streams)))
    stream = streams[0]
    frames = int(stream.get("nb_read_frames", "0"))
    expected_frames = simulation * fps
    require(frames > 0 and abs(frames - expected_frames) <= 1 + 1e-6,
            "VIDEO_FRAME_COUNT_MISMATCH", f"decoded={frames}; expected={expected_frames}")
    encoded_fps = float(Fraction(stream["avg_frame_rate"]))
    require(abs(encoded_fps - fps) <= 1e-6, "VIDEO_FRAME_RATE_MISMATCH", f"{encoded_fps} != {fps}")
    duration = float(stream["duration"]) if "duration" in stream else (
        float(stream["duration_ts"] * Fraction(stream["time_base"])) if "duration_ts" in stream
        else float(data["format"]["duration"]))
    format_duration = float(data["format"]["duration"])
    tolerance = 1 / fps + 0.001
    require(math.isfinite(duration) and math.isfinite(format_duration)
            and abs(duration - simulation) <= tolerance and abs(format_duration - simulation) <= tolerance,
            "VIDEO_DURATION_MISMATCH", f"video={duration}; format={format_duration}; simulation={simulation}")
    require(stream["width"] > 0 and stream["height"] > 0, "VIDEO_DIMENSIONS_INVALID", file.name)
    return {"path": file.name, "decodedFrames": frames, "expectedFrames": expected_frames,
            "framesPerSecond": encoded_fps, "durationSeconds": duration,
            "formatDurationSeconds": format_duration, "durationToleranceSeconds": tolerance,
            "widthPixels": stream["width"], "heightPixels": stream["height"],
            "validation": "ffprobe decoded frame count; not a visual-quality or realtime-performance assessment"}


class Verifier:
    def __init__(self, args: argparse.Namespace, output: Path):
        self.args = args
        self.output = output
        self.report: dict[str, Any] = {
            "kind": "creator-host-artifact-verification", "schemaVersion": 1,
            "verifierSha256": sha256_file(Path(__file__)),
            "status": "failed", "createdAt": datetime.now(timezone.utc).isoformat(),
            "archivePath": str(args.archive.resolve()), "resultPath": str(args.result.resolve()),
            "inputKind": args.fixture_label or "creator-delivery",
            "checks": [], "limitations": [
                "Static artifact integrity and decoded-media checks only; scene code was not executed.",
                "Reported exploration metrics and recorded traces do not prove complete navigability or absence of bugs.",
                "Independent browser replay and visual comparison with the original reference remain required.",
                "The sourceHash is cross-bound between records, not recomputed from an unavailable runtime-lock preimage.",
            ],
        }

    def check(self, name: str, action: Callable[[], Any]) -> Any:
        try:
            evidence = action()
            self.report["checks"].append({"name": name, "status": "passed", "evidence": evidence})
            return evidence
        except Exception as error:
            self.report["checks"].append({"name": name, "status": "failed",
                                          "code": getattr(error, "code", type(error).__name__),
                                          "detail": str(error)[:2500]})
            return None

    def verify_payload(self, payload: Path, archive_files: dict[str, int], result: dict[str, Any]) -> None:
        manifest = read_json(payload / "artifact-hashes.json")
        require(isinstance(manifest, dict) and isinstance(manifest.get("files"), dict), "HASH_MANIFEST_INVALID", "files must be an object")
        hashes = manifest["files"]
        for name, digest in hashes.items():
            canonical_path(name)
            require(isinstance(digest, str) and SHA256.fullmatch(digest) is not None, "HASH_MANIFEST_INVALID", name)
        require("artifact-hashes.json" not in hashes, "HASH_MANIFEST_SELF_REFERENCE", "Manifest cannot hash itself")

        def closure() -> dict[str, Any]:
            expected = set(hashes) | {"artifact-hashes.json"}
            extra, missing = sorted(set(archive_files) - expected), sorted(expected - set(archive_files))
            require(not extra and not missing, "ARTIFACT_FILE_SET_MISMATCH",
                    f"Extra {len(extra)}: {extra[:12]}; missing {len(missing)}: {missing[:12]}")
            return {"payloadFileCount": len(hashes), "manifestFileCount": 1}

        self.check("closed-artifact-file-set", closure)

        def verify_hashes() -> dict[str, Any]:
            for name, digest in hashes.items():
                require(name in archive_files and sha256_file(payload / name) == digest, "ARTIFACT_HASH_MISMATCH", name)
            return {"verifiedFileCount": len(hashes)}

        hashes_verified = self.check("artifact-file-sha256", verify_hashes)
        delivery = read_json(payload / "delivery.json")
        playtest = read_json(payload / "playtest-report.json")
        config = read_json(payload / "source/scene.json")
        candidate = read_json(payload / "candidate.json")
        audit = read_json(payload / "runtime-audit.json")
        triviews = read_json(payload / "triview-manifest.json")

        def identities() -> dict[str, Any]:
            source_hash = result.get("sourceHash")
            scene_id = result.get("sceneId")
            require(isinstance(source_hash, str) and SHA256.fullmatch(source_hash) is not None,
                    "SOURCE_HASH_INVALID", "result.sourceHash")
            require(isinstance(scene_id, str) and 0 < len(scene_id) <= 128, "SCENE_ID_INVALID", "result.sceneId")
            for label, record, kind in [
                ("playtest", playtest, "experimental-native-controller-playtest"),
                ("candidate", candidate, "experimental-native-creator-candidate"),
                ("audit", audit, "experimental-native-creator-audit"),
                ("triviews", triviews, "experimental-runtime-triview-manifest"),
            ]:
                require(record.get("kind") == kind, "ARTIFACT_KIND_MISMATCH", label)
            require(config.get("schemaVersion") == 1, "SCENE_SCHEMA_VERSION_INVALID", "source/scene.json")
            for label, record in [("manifest", manifest), ("delivery", delivery), ("playtest", playtest),
                                  ("candidate", candidate), ("triviews", triviews), ("opening", delivery["opening"])]:
                require(record.get("sourceHash") == source_hash, "SOURCE_HASH_MISMATCH", label)
            for label, actual in [("delivery", delivery.get("sceneId")), ("candidate", candidate.get("sceneId")),
                                  ("scene.json", config.get("id")), ("audit", audit.get("sceneId")),
                                  ("opening.audit", delivery["opening"]["audit"].get("sceneId"))]:
                require(actual == scene_id, "SCENE_ID_MISMATCH", label)
            require(audit.get("inputHash") == source_hash and delivery["opening"]["audit"].get("inputHash") == source_hash,
                    "AUDIT_SOURCE_HASH_MISMATCH", scene_id)
            require({key: value for key, value in result.items() if key not in ("archivePath", "archiveSha256")} == delivery,
                    "RESULT_DELIVERY_MISMATCH", "External result differs from archived delivery")
            require(result.get("kind") == "experimental-native-creator-delivery" and result.get("status") == "submitted",
                    "DELIVERY_STATUS_INVALID", str(result.get("status")))
            require(delivery.get("playtest") == playtest, "PLAYTEST_REPORT_MISMATCH", "delivery.playtest")
            for label, record in [("opening", delivery["opening"]), ("playtest", playtest)]:
                require(record.get("browserErrors") == [], "BROWSER_ERRORS_REPORTED", label)
            require(audit.get("errors") == [] and delivery["opening"]["audit"].get("errors") == [], "RUNTIME_ERRORS_REPORTED", scene_id)
            self.report.update({"sceneId": scene_id, "sourceHash": source_hash})
            return {"sceneId": scene_id, "sourceHash": source_hash, "sourceHashValidation": "cross-record-consistency"}

        self.check("identity-and-result-bindings", identities)

        def playtest_requirements() -> dict[str, Any]:
            require(playtest.get("status") == "passed" and playtest.get("failure") is None, "PLAYTEST_NOT_PASSED", str(playtest.get("failure")))
            actual = number(playtest.get("actualSimulationSeconds"), "actualSimulationSeconds", 180)
            requested = number(playtest.get("requestedDurationSeconds"), "requestedDurationSeconds", 180)
            require(actual + 0.1 >= requested, "PLAYTEST_DURATION_SHORT", f"{actual} < {requested}")
            target_count = integer(playtest.get("targetCount"), "targetCount", 3)
            target_ids = [row["id"] for row in config["exploration"]["targets"]]
            visited = playtest.get("visitedTargets")
            require(len(target_ids) == len(set(target_ids)) == target_count and isinstance(visited, list)
                    and len(visited) == len(set(visited)) == target_count and set(visited) == set(target_ids),
                    "PLAYTEST_TARGETS_MISMATCH", "Source targets and visited target IDs must match")
            cells = integer(playtest.get("uniqueFiveMeterCells"), "uniqueFiveMeterCells", 15)
            extent = number(playtest.get("maximumDistanceFromSpawnMeters"), "maximumDistanceFromSpawnMeters", 30)
            number(playtest.get("travelledMeters"), "travelledMeters", extent)
            return {"actualSimulationSeconds": actual, "targetCount": target_count,
                    "reportedUniqueFiveMeterCells": cells, "reportedMaximumDistanceFromSpawnMeters": extent,
                    "qualification": "Checks reported coverage thresholds, not independent runtime replay"}

        self.check("reported-exploration-thresholds", playtest_requirements)

        def trace_consistency() -> dict[str, Any]:
            trace = read_json(payload / "playtest-trace.json")
            require(isinstance(trace, list) and bool(trace), "PLAYTEST_TRACE_EMPTY", "trace")
            actual = number(playtest["actualSimulationSeconds"], "actualSimulationSeconds", 180)
            previous_seconds, previous_tick, initial_tick = -1.0, -1, None
            for point in trace:
                seconds = number(point["simulationSeconds"], "trace.simulationSeconds")
                tick = integer(point["tick"], "trace.tick")
                require(previous_seconds < seconds <= actual and tick > previous_tick, "PLAYTEST_TRACE_ORDER_INVALID", str(seconds))
                inferred = tick - 60 * seconds
                initial_tick = inferred if initial_tick is None else initial_tick
                require(abs(inferred - initial_tick) < 1e-5, "PLAYTEST_TRACE_TICK_MISMATCH", str(tick))
                position = point["positionMetersXYZ"]
                require(isinstance(position, list) and len(position) == 3
                        and all(type(value) in (int, float) and math.isfinite(value) for value in position),
                        "PLAYTEST_TRACE_POSITION_INVALID", str(tick))
                previous_seconds, previous_tick = seconds, tick
            require(actual - previous_seconds <= 1.001, "PLAYTEST_TRACE_TRUNCATED", str(previous_seconds))
            return {"traceSamples": len(trace), "inferredInitialTick": initial_tick,
                    "lastSampleSeconds": previous_seconds, "fixedTicksPerSecond": 60}

        self.check("recorded-trace-consistency", trace_consistency)
        self.check("opening-png", lambda: image_evidence(payload, "opening-world.png", delivery["opening"]["image"], hashes))

        def tri_images() -> dict[str, Any]:
            require(triviews.get("viewOrder") == ["front", "right", "back"], "TRIVIEW_ORDER_INVALID", "Expected front/right/back")
            rows = triviews.get("images")
            require(isinstance(rows, list) and bool(rows), "TRIVIEW_IMAGES_MISSING", "images")
            expected_ids = {delivery["opening"]["camera"]["targetEntityId"]} | {row["id"] for row in config.get("visualTargets", [])}
            ids = [row["id"] for row in rows]
            require(len(ids) == len(set(ids)) and set(ids) == expected_ids, "TRIVIEW_TARGET_SET_MISMATCH", str(ids))
            images = []
            for row in rows:
                require(isinstance(row["id"], str) and re.fullmatch(r"[A-Za-z0-9._-]+", row["id"]) is not None,
                        "TRIVIEW_TARGET_ID_INVALID", str(row["id"]))
                evidence = image_evidence(payload, f"triview-{row['id']}.png", row["image"], hashes)
                require(evidence["widthPixels"] % 3 == 0, "TRIVIEW_PANEL_WIDTH_INVALID", row["id"])
                images.append({"id": row["id"], **evidence})
            return {"images": images, "pngValidation": "Signature, IHDR dimensions/CRC and SHA256; visual quality not assessed"}

        self.check("triview-pngs", tri_images)
        if hashes_verified is not None:
            self.check("decoded-playtest-video", lambda: decode_video(payload / "playtest.mp4", playtest, self.args.ffprobe))
        else:
            self.report["checks"].append({"name": "decoded-playtest-video", "status": "not-run", "reason": "Artifact hashes did not pass"})

    def run(self) -> dict[str, Any]:
        try:
            result = read_json(self.args.result)
            require(isinstance(result, dict), "RESULT_INVALID", "Expected JSON object")
            with tempfile.TemporaryDirectory(prefix=".archive-", dir=self.output) as temporary:
                archive, raw = Path(temporary) / "input.tar.gz", Path(temporary) / "input.tar"
                archive_hash = freeze_archive(self.args.archive, archive, self.args.max_archive_bytes)
                self.report["archiveSha256"] = archive_hash

                def external_binding() -> dict[str, Any]:
                    declared = result.get("archiveSha256")
                    supplied = self.args.expected_archive_sha256
                    for label, digest in [("result.archiveSha256", declared), ("--expected-archive-sha256", supplied)]:
                        if digest is not None:
                            require(digest == archive_hash, "ARCHIVE_HASH_MISMATCH", label)
                    return {"sha256": archive_hash, "binding": "externally-bound" if declared or supplied else "external-digest-unavailable-legacy-fixture"}

                self.check("external-archive-sha256", external_binding)
                decompress_tar(archive, raw, self.args.max_expanded_bytes + 16 * 1024 * 1024)
                files = safe_extract(raw, self.output / "payload", self.args)
                self.report["checks"].append({"name": "archive-safety", "status": "passed", "evidence": {"files": len(files), "expandedBytes": sum(files.values())}})
                self.verify_payload(self.output / "payload", files, result)
        except Exception as error:
            self.report["checks"].append({"name": "verification-pipeline", "status": "failed",
                                          "code": getattr(error, "code", type(error).__name__), "detail": str(error)[:2500]})
        passed = bool(self.report["checks"]) and all(check["status"] == "passed" for check in self.report["checks"])
        self.report["status"] = "static-artifacts-passed" if passed else "failed"
        self.report["visualQuality"] = "not-assessed"
        self.report["independentPlayability"] = "not-assessed"
        return self.report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--result", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--expected-archive-sha256")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--fixture-label", choices=["normalized-host-test-fixture"])
    parser.add_argument("--max-archive-bytes", type=int, default=512 * 1024 * 1024)
    parser.add_argument("--max-expanded-bytes", type=int, default=1024 * 1024 * 1024)
    parser.add_argument("--max-file-bytes", type=int, default=256 * 1024 * 1024)
    parser.add_argument("--max-members", type=int, default=10_000)
    args = parser.parse_args()
    require(all(getattr(args, name) > 0 for name in ("max_archive_bytes", "max_expanded_bytes", "max_file_bytes", "max_members")),
            "LIMIT_INVALID", "All resource limits must be positive")
    args.output_dir.parent.mkdir(parents=True, exist_ok=True)
    output = args.output_dir.parent.resolve() / args.output_dir.name
    require(not output.exists() and not output.is_symlink(), "OUTPUT_ALREADY_EXISTS", "Provide a new output directory")
    output.mkdir(mode=0o700)
    report = Verifier(args, output).run()
    report_path = output / "host-artifact-verification.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", "utf-8")
    print(json.dumps({"status": report["status"], "reportPath": str(report_path),
                      "failedChecks": [{"name": row["name"], "code": row.get("code")} for row in report["checks"] if row["status"] == "failed"]}, ensure_ascii=False))
    return 0 if report["status"] == "static-artifacts-passed" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except VerificationFailure as error:
        print(json.dumps({"status": "failed", "code": error.code, "detail": str(error)}, ensure_ascii=False))
        raise SystemExit(1)
