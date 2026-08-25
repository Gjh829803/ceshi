#!/usr/bin/env python3
"""Validate strict centered rear-third-person entry composition.

The planning and runtime whitebox images use the fixed primary-subject identity
color. This gate measures that mask without making a subjective image-quality
judgment. When a Runtime Snapshot is supplied it also proves that the camera is
targeting the controlled subject from directly behind its forward axis.
"""

from __future__ import annotations

import argparse
import colorsys
import json
import math
import sys
from pathlib import Path
from typing import Any

from PIL import Image


PRIMARY_SUBJECT_COLOR = "#E85D5D"
MAXIMUM_CENTER_ERROR_RATIO = 0.015
MAXIMUM_REAR_ALIGNMENT_DEGREES = 1.0
MAXIMUM_VIEW_YAW_OFFSET_RADIANS = 1e-6


def _hue_distance_degrees(left: float, right: float) -> float:
    distance = abs(left - right) % 360
    return min(distance, 360 - distance)


def _hex_hsv(value: str) -> tuple[float, float, float]:
    normalized = value.removeprefix("#")
    if len(normalized) != 6:
        raise ValueError("Identity color must be a six-digit hexadecimal color.")
    red, green, blue = (int(normalized[index:index + 2], 16) / 255 for index in (0, 2, 4))
    hue, saturation, brightness = colorsys.rgb_to_hsv(red, green, blue)
    return hue * 360, saturation, brightness


def measure_subject_center(image_path: Path) -> dict[str, float | int]:
    target_hue, target_saturation, _ = _hex_hsv(PRIMARY_SUBJECT_COLOR)
    with Image.open(image_path) as source:
        image = source.convert("RGB")
    width, height = image.size
    if width < 32 or height < 32:
        raise ValueError("Entry image is too small to validate.")
    x_total = 0
    pixel_count = 0
    for y in range(height):
        for x in range(width):
            red, green, blue = image.getpixel((x, y))
            hue, saturation, brightness = colorsys.rgb_to_hsv(
                red / 255,
                green / 255,
                blue / 255,
            )
            hue_degrees = hue * 360
            if (
                _hue_distance_degrees(hue_degrees, target_hue) <= 12
                and saturation >= max(0.3, target_saturation * 0.45)
                and brightness >= 0.2
            ):
                x_total += x
                pixel_count += 1
    minimum_pixels = max(64, round(width * height * 0.001))
    if pixel_count < minimum_pixels:
        raise ValueError(
            f"Primary-subject identity mask is missing or too small ({pixel_count} pixels)."
        )
    center_x_ratio = (x_total / pixel_count + 0.5) / width
    return {
        "widthPixels": width,
        "heightPixels": height,
        "subjectMaskPixelCount": pixel_count,
        "subjectCenterXRatio": center_x_ratio,
        "subjectCenterErrorRatio": abs(center_x_ratio - 0.5),
        "maximumCenterErrorRatio": MAXIMUM_CENTER_ERROR_RATIO,
    }


def measure_runtime_rear_alignment(snapshot_path: Path) -> dict[str, float | bool | str]:
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    if (
        snapshot.get("kind") != "worldkit-runtime-snapshot"
        or snapshot.get("schemaVersion") != 4
    ):
        raise ValueError("Runtime Snapshot must use the current WorldKit Snapshot V4 contract.")

    world = snapshot.get("world") if isinstance(snapshot.get("world"), dict) else {}
    inspection = (
        world.get("gameplayInspection")
        if isinstance(world.get("gameplayInspection"), dict)
        else {}
    )
    relationships = inspection.get("possessedByRelationshipsById")
    possession_rows = list(relationships.values()) if isinstance(relationships, dict) else []
    controlled_rows = [
        row
        for row in possession_rows
        if isinstance(row, dict) and row.get("controllerEntityId") == "controller-primary"
    ]
    if len(controlled_rows) != 1:
        raise ValueError("Runtime Snapshot must contain exactly one primary possession binding.")
    controlled_id = str(controlled_rows[0].get("controlledEntityId", ""))

    view = snapshot.get("view") if isinstance(snapshot.get("view"), dict) else {}
    camera = view.get("camera") if isinstance(view.get("camera"), dict) else {}
    if camera.get("mode") != "tracking":
        raise ValueError("Runtime Snapshot entry camera must be tracking the controlled Subject.")

    states = world.get("subjectStatesByEntityId")
    state = states.get(controlled_id) if isinstance(states, dict) else None
    entity_state = state.get("entityState") if isinstance(state, dict) else None
    if not controlled_id or not isinstance(entity_state, dict):
        raise ValueError("Runtime Snapshot is missing the controlled Subject state.")
    camera_position = camera.get("positionMetersXYZ")
    subject_position = entity_state.get("positionMetersXYZ")
    if not all(
        isinstance(vector, list)
        and len(vector) == 3
        and all(isinstance(value, (int, float)) and math.isfinite(value) for value in vector)
        for vector in (camera_position, subject_position)
    ):
        raise ValueError("Runtime camera/Subject positions are missing or invalid.")

    rotation = entity_state.get("rotationQuaternionXYZW")
    if not (
        isinstance(rotation, list)
        and len(rotation) == 4
        and all(isinstance(value, (int, float)) and math.isfinite(value) for value in rotation)
    ):
        raise ValueError("Runtime Subject rotation quaternion is missing or invalid.")
    qx, qy, qz, qw = rotation
    quaternion_length = math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw)
    if quaternion_length <= 1e-9:
        raise ValueError("Runtime Subject rotation quaternion is degenerate.")
    qx, qy, qz, qw = (
        qx / quaternion_length,
        qy / quaternion_length,
        qz / quaternion_length,
        qw / quaternion_length,
    )
    # Snapshot V4 publishes rotation, not a duplicated forward vector. Rotate
    # the Canonical local forward axis (0, 0, -1) by the Subject quaternion.
    subject_forward = (
        -2 * (qw * qy + qx * qz),
        2 * (qw * qx - qy * qz),
        -1 + 2 * (qx * qx + qy * qy),
    )
    camera_to_subject = (
        subject_position[0] - camera_position[0],
        subject_position[2] - camera_position[2],
    )
    forward_xz = (subject_forward[0], subject_forward[2])
    camera_length = math.hypot(*camera_to_subject)
    forward_length = math.hypot(*forward_xz)
    if camera_length <= 1e-6 or forward_length <= 1e-6:
        raise ValueError("Runtime camera/Subject horizontal direction is degenerate.")
    cosine = max(
        -1.0,
        min(
            1.0,
            (
                camera_to_subject[0] * forward_xz[0]
                + camera_to_subject[1] * forward_xz[1]
            ) / (camera_length * forward_length),
        ),
    )
    alignment_degrees = math.degrees(math.acos(cosine))
    yaw_offset = camera.get("viewYawOffsetRadians", 0)
    if not isinstance(yaw_offset, (int, float)) or not math.isfinite(yaw_offset):
        raise ValueError("Runtime camera yaw offset is invalid.")
    return {
        "controlledEntityId": controlled_id,
        "cameraTargetEntityId": str(camera.get("targetEntityId", "")),
        "cameraTargetsControlledSubject": camera.get("targetEntityId") == controlled_id,
        "rearAlignmentDegrees": alignment_degrees,
        "maximumRearAlignmentDegrees": MAXIMUM_REAR_ALIGNMENT_DEGREES,
        "viewYawOffsetRadians": abs(yaw_offset),
        "maximumViewYawOffsetRadians": MAXIMUM_VIEW_YAW_OFFSET_RADIANS,
    }


def validate(image_path: Path, snapshot_path: Path | None = None) -> dict[str, Any]:
    diagnostics: list[dict[str, str]] = []
    try:
        image_measurements = measure_subject_center(image_path)
    except (OSError, ValueError) as error:
        image_measurements = {}
        diagnostics.append({
            "code": "ENTRY_SUBJECT_MASK_INVALID",
            "message": str(error),
        })
    if (
        image_measurements
        and image_measurements["subjectCenterErrorRatio"] > MAXIMUM_CENTER_ERROR_RATIO
    ):
        diagnostics.append({
            "code": "ENTRY_SUBJECT_NOT_CENTERED",
            "message": (
                "The complete primary Subject is not strictly centered on the image vertical "
                f"midline (x={image_measurements['subjectCenterXRatio']:.4f}, required 0.5000±"
                f"{MAXIMUM_CENTER_ERROR_RATIO:.4f})."
            ),
        })
    runtime_measurements: dict[str, float | bool | str] | None = None
    if snapshot_path is not None:
        try:
            runtime_measurements = measure_runtime_rear_alignment(snapshot_path)
        except (OSError, ValueError, json.JSONDecodeError) as error:
            runtime_measurements = None
            diagnostics.append({
                "code": "ENTRY_RUNTIME_CAMERA_INVALID",
                "message": str(error),
            })
        if runtime_measurements is not None:
            if runtime_measurements["cameraTargetsControlledSubject"] is not True:
                diagnostics.append({
                    "code": "ENTRY_CAMERA_TARGET_MISMATCH",
                    "message": "The opening camera must target the startup controlled Subject.",
                })
            if runtime_measurements["rearAlignmentDegrees"] > MAXIMUM_REAR_ALIGNMENT_DEGREES:
                diagnostics.append({
                    "code": "ENTRY_CAMERA_NOT_DIRECTLY_BEHIND",
                    "message": (
                        "The opening camera is diagonally behind the Subject instead of directly "
                        f"behind it ({runtime_measurements['rearAlignmentDegrees']:.4f} degrees)."
                    ),
                })
            if runtime_measurements["viewYawOffsetRadians"] > MAXIMUM_VIEW_YAW_OFFSET_RADIANS:
                diagnostics.append({
                    "code": "ENTRY_CAMERA_YAW_OFFSET",
                    "message": "The opening camera must have zero yaw/orbit offset.",
                })
    return {
        "kind": "worldkit-entry-third-person-validation",
        "schemaVersion": 1,
        "status": "passed" if not diagnostics else "failed",
        "imageMeasurements": image_measurements,
        "runtimeMeasurements": runtime_measurements,
        "diagnostics": diagnostics,
    }


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--snapshot")
    parser.add_argument("--output")
    return parser.parse_args()


def main() -> int:
    arguments = _arguments()
    result = validate(
        Path(arguments.image).resolve(),
        Path(arguments.snapshot).resolve() if arguments.snapshot else None,
    )
    serialized = json.dumps(result, ensure_ascii=False, sort_keys=True)
    if arguments.output:
        output_path = Path(arguments.output).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(f"{serialized}\n", encoding="utf-8")
    print(serialized)
    return 0 if result["status"] == "passed" else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2)
