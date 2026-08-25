#!/usr/bin/env python3
"""Synthesize visual prompts with Gemini Flash and render all images in parallel.

The implementation is deliberately project-local. It uses Google GenAI directly
and never imports another checkout at runtime.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = PROJECT_ROOT / ".codex-tmp" / "runtime-config" / "gemini.env"
DEFAULT_CREDENTIAL_FILE = (
    PROJECT_ROOT / ".codex-tmp" / "runtime-config" / "google-service-account.json"
)
DEFAULT_PROMPT_MODEL = "gemini-3-flash-preview"
DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image"
PROMPT_BUNDLE_NAME = "visual-generation-prompts.json"
SCENE_ID_PATTERN = __import__("re").compile(r"^[a-z0-9][a-z0-9-]{2,79}$")


@dataclass(frozen=True)
class VisualTarget:
    target_id: str
    plan_element_id: str
    role: str
    semantic_class_id: str
    identity_color: str
    name: str
    description: str
    whitebox_path: Path


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _prepare_vertex_environment() -> tuple[str, str, str, str, str]:
    env_file = Path(os.environ.get("WORLDKIT_GEMINI_ENV_FILE", DEFAULT_ENV_FILE))
    _load_env_file(env_file)
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip():
        if DEFAULT_CREDENTIAL_FILE.is_file():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(DEFAULT_CREDENTIAL_FILE)
    credential_value = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    credential_path = Path(credential_value) if credential_value else None
    if credential_path is not None and not credential_path.is_absolute():
        credential_path = (PROJECT_ROOT / credential_path).resolve()
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credential_path)
    if not os.environ.get("GCLOUD_PROJECT_ID", "").strip() and credential_path is not None:
        try:
            credential_payload = json.loads(credential_path.read_text(encoding="utf-8"))
            project_id = credential_payload.get("project_id")
            if isinstance(project_id, str) and project_id.strip():
                os.environ["GCLOUD_PROJECT_ID"] = project_id.strip()
        except (OSError, json.JSONDecodeError):
            pass
    project_id = os.environ.get("GCLOUD_PROJECT_ID", "").strip()
    if not project_id:
        raise RuntimeError(
            "GCLOUD_PROJECT_ID is required. Configure the project-local "
            ".codex-tmp/runtime-config/gemini.env file."
        )
    if credential_path is None or not credential_path.is_file():
        raise RuntimeError(
            "A project-local Google credential is required at "
            ".codex-tmp/runtime-config/google-service-account.json or via "
            "GOOGLE_APPLICATION_CREDENTIALS."
        )
    base_location = os.environ.get("GCLOUD_LOCATION", "global").strip() or "global"
    prompt_location = (
        os.environ.get("WORLDKIT_GEMINI_PROMPT_LOCATION", base_location).strip()
        or base_location
    )
    image_location = (
        os.environ.get("WORLDKIT_GEMINI_IMAGE_LOCATION", base_location).strip()
        or base_location
    )
    prompt_model = (
        os.environ.get("WORLDKIT_GEMINI_PROMPT_MODEL", DEFAULT_PROMPT_MODEL).strip()
        or DEFAULT_PROMPT_MODEL
    )
    image_model = (
        os.environ.get("WORLDKIT_GEMINI_IMAGE_MODEL", DEFAULT_IMAGE_MODEL).strip()
        or DEFAULT_IMAGE_MODEL
    )
    return project_id, prompt_location, image_location, prompt_model, image_model


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _assert_regular_image(path: Path) -> None:
    if not path.is_file() or path.is_symlink() or path.stat().st_size <= 8:
        raise RuntimeError(f"Required image is invalid: {path}")
    with Image.open(path) as image:
        image.verify()


def _atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except OSError:
            pass
        raise


def _atomic_png(path: Path, image_bytes: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(BytesIO(image_bytes)) as generated:
        generated.load()
        rgb = generated.convert("RGB")
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
        )
        os.close(descriptor)
        try:
            rgb.save(temporary_name, format="PNG", optimize=True)
            if Path(temporary_name).stat().st_size <= 2048:
                raise RuntimeError(f"Generated image is unexpectedly small: {path}")
            os.replace(temporary_name, path)
        except BaseException:
            try:
                os.unlink(temporary_name)
            except OSError:
                pass
            raise


def _load_targets(scene_root: Path) -> list[VisualTarget]:
    capture = _read_json(scene_root / "triviews" / "capture-targets.json")
    palette = _read_json(scene_root / "visual-identity-palette.json")
    palette_by_id = {
        str(item.get("visualTargetId") or item.get("id")): item
        for item in palette.get("targets", [])
        if isinstance(item, dict)
    }
    targets: list[VisualTarget] = []
    for item in capture.get("targets", [])[:5]:
        target_id = str(item.get("id", ""))
        plan_element_id = str(item.get("visualTargetId") or target_id)
        if not SCENE_ID_PATTERN.fullmatch(target_id):
            raise RuntimeError(f"Visual target id is invalid: {target_id}")
        whitebox_path = (scene_root / "triviews" / str(item.get("imagePath", ""))).resolve()
        if scene_root.resolve() not in whitebox_path.parents:
            raise RuntimeError(f"Visual target escaped scene root: {target_id}")
        _assert_regular_image(whitebox_path)
        metadata = palette_by_id.get(plan_element_id, {})
        targets.append(
            VisualTarget(
                target_id=target_id,
                plan_element_id=plan_element_id,
                role=str(item.get("role", "visual-target")),
                semantic_class_id=str(item.get("semanticClassId", "visual.target")),
                identity_color=str(item.get("identityColor", "")),
                name=str(metadata.get("name") or plan_element_id),
                description=str(metadata.get("description") or ""),
                whitebox_path=whitebox_path,
            )
        )
    if not targets:
        raise RuntimeError("At least one captured visual target is required.")
    return targets


def _open_images(paths: Iterable[Path]) -> list[Image.Image]:
    images: list[Image.Image] = []
    try:
        for path in paths:
            with Image.open(path) as source:
                images.append(source.convert("RGB"))
    except BaseException:
        for image in images:
            image.close()
        raise
    return images


def _target_payload(target: VisualTarget) -> dict[str, str]:
    return {
        "target_id": target.target_id,
        "plan_element_id": target.plan_element_id,
        "role": target.role,
        "semantic_class_id": target.semantic_class_id,
        "identity_color": target.identity_color,
        "name": target.name,
        "description": target.description,
    }


def _synthesize_prompts(
    *,
    scene_id: str,
    scene_root: Path,
    user_frame: Path,
    targets: list[VisualTarget],
    project_id: str,
    location: str,
    prompt_model: str,
    image_model: str,
) -> dict[str, Any]:
    from google import genai
    from google.genai import types

    brief = (scene_root / "scene-brief.md").read_text(encoding="utf-8")
    palette = _read_json(scene_root / "visual-identity-palette.json")
    target_metadata = [_target_payload(target) for target in targets]
    system_instruction = """You are WorldKit's visual reconstruction prompt planner.
Return JSON only. Write precise English image-edit prompts; do not generate images.

Authority is strict:
- The actual Babylon opening whitebox image fixes the complete visible projection: camera, FOV, framing, terrain silhouette, architecture footprint, route/support geometry, object centers, scale, depth order and occlusion. Appearance may change; geometry may not move.
- The uploaded user image fixes final protagonist identity and final environment materials, palette, atmosphere, weather, lighting direction and style. It never overrides whitebox layout, pose or camera.
- Each Front/Right/Back whitebox sheet fixes one complete target's silhouette, proportions, member count and part relationships. Identity colors are segmentation masks, never final colors.

Create one shared style_bible that gives the opening image and every tri-view identical identities, materials and art direction. The opening prompt must preserve the whitebox's strict centered rear-third-person composition: the playable subject's main body/pilot and complete visual mass are exactly on the 50% image-width vertical centerline in the lower-middle foreground, with no slight lateral bias; the camera is directly behind, never diagonal or three-quarter rear; the full back faces the camera and face/chest/side profile stay hidden. Remove every gray/white model residue, segmentation color, grid, axis, helper, label, UI, text, logo and watermark.

Each tri-view prompt must render only its named complete target as exactly three orthographic panels ordered Front / Right / Back on a neutral background. Never split a building or repeated landmark group into unrelated identities. Do not invent scenery, props, text, labels or extra views. Because all images will be rendered concurrently, each prompt must restate the relevant shared appearance definition completely and must not depend on pixels from another generated output."""
    user_message = (
        f"SCENE ID: {scene_id}\n\n"
        f"SCENE BRIEF:\n{brief}\n\n"
        f"VISUAL IDENTITY PALETTE:\n{json.dumps(palette, ensure_ascii=False)}\n\n"
        f"TARGETS IN WHITEBOX ATTACHMENT ORDER:\n{json.dumps(target_metadata, ensure_ascii=False)}\n\n"
        "Attachment order after this text: uploaded user image; actual Babylon opening whitebox; "
        "then one Front/Right/Back whitebox sheet for each target in TARGETS order."
    )
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["style_bible", "styled_opening_prompt", "triview_prompts"],
        "properties": {
            "style_bible": {"type": "string", "minLength": 200},
            "styled_opening_prompt": {"type": "string", "minLength": 300},
            "triview_prompts": {
                "type": "array",
                "minItems": len(targets),
                "maxItems": len(targets),
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["target_id", "prompt"],
                    "properties": {
                        "target_id": {"type": "string"},
                        "prompt": {"type": "string", "minLength": 250},
                    },
                },
            },
        },
    }
    images = _open_images([user_frame, scene_root / "opening-frame.png", *[t.whitebox_path for t in targets]])
    try:
        client = genai.Client(vertexai=True, project=project_id, location=location)
        response = client.models.generate_content(
            model=prompt_model,
            contents=[user_message, *images],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1,
                max_output_tokens=8192,
                response_mime_type="application/json",
                response_json_schema=schema,
            ),
        )
    finally:
        for image in images:
            image.close()
    response_text = getattr(response, "text", None)
    if not response_text:
        raise RuntimeError("Gemini prompt synthesis returned no JSON text.")
    payload = json.loads(response_text)
    expected_ids = [target.target_id for target in targets]
    prompt_items = payload.get("triview_prompts", [])
    actual_ids = [str(item.get("target_id", "")) for item in prompt_items]
    if actual_ids != expected_ids:
        by_id = {str(item.get("target_id", "")): item for item in prompt_items}
        if set(by_id) != set(expected_ids):
            raise RuntimeError(
                f"Gemini tri-view prompt coverage mismatch: expected {expected_ids}, got {actual_ids}"
            )
        prompt_items = [by_id[target_id] for target_id in expected_ids]
    style_bible = str(payload.get("style_bible", "")).strip()
    opening_prompt = str(payload.get("styled_opening_prompt", "")).strip()
    if len(style_bible) < 200 or len(opening_prompt) < 300:
        raise RuntimeError("Gemini returned an incomplete visual prompt bundle.")
    bundle = {
        "kind": "worldkit-visual-generation-prompts",
        "schemaVersion": 1,
        "sceneId": scene_id,
        "promptModel": prompt_model,
        "imageModel": image_model,
        "parallelImageGeneration": True,
        "styleBible": style_bible,
        "styledOpeningFrame": {
            "prompt": opening_prompt,
            "referenceRoles": ["user-first-frame", "actual-whitebox-opening", "whitebox-triviews"],
        },
        "styledTriviews": [
            {
                **_target_payload(target),
                "prompt": str(prompt_item.get("prompt", "")).strip(),
                "referenceRoles": ["user-first-frame", "actual-whitebox-opening", "target-whitebox-triview"],
            }
            for target, prompt_item in zip(targets, prompt_items, strict=True)
        ],
    }
    if any(len(item["prompt"]) < 250 for item in bundle["styledTriviews"]):
        raise RuntimeError("Gemini returned an incomplete tri-view prompt.")
    return bundle


def _extract_image_bytes(response: Any) -> bytes:
    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", None) or []:
            inline_data = getattr(part, "inline_data", None)
            data = getattr(inline_data, "data", None)
            if data:
                return bytes(data)
    raise RuntimeError("Direct ImageGen returned no image bytes.")


def _generate_one(
    *,
    prompt: str,
    references: list[Path],
    output_path: Path,
    project_id: str,
    location: str,
    image_model: str,
) -> Path:
    from google import genai
    from google.genai import types

    last_error: BaseException | None = None
    for attempt in range(1, 3):
        images = _open_images(references)
        try:
            client = genai.Client(vertexai=True, project=project_id, location=location)
            image_config = types.ImageConfig(aspect_ratio="16:9", image_size="1K")
            config_arguments: dict[str, Any] = {
                "response_modalities": [types.Modality.IMAGE],
                "image_config": image_config,
            }
            if "person_generation" in getattr(types.GenerateContentConfig, "model_fields", {}):
                config_arguments["person_generation"] = types.PersonGeneration("ALLOW_ALL")
            response = client.models.generate_content(
                model=image_model,
                contents=[prompt, *images],
                config=types.GenerateContentConfig(**config_arguments),
            )
            _atomic_png(output_path, _extract_image_bytes(response))
            return output_path
        except BaseException as error:
            last_error = error
            if attempt < 2:
                time.sleep(2 * attempt)
        finally:
            for image in images:
                image.close()
    raise RuntimeError(f"Image generation failed for {output_path.name}: {last_error}")


def _generate_images(
    *,
    scene_root: Path,
    user_frame: Path,
    targets: list[VisualTarget],
    bundle: dict[str, Any],
    project_id: str,
    location: str,
    image_model: str,
    only: str,
) -> list[Path]:
    style_bible = str(bundle["styleBible"])
    jobs: list[dict[str, Any]] = []
    if only in {"all", "opening"}:
        jobs.append(
            {
                "prompt": (
                    f"SHARED FINAL APPEARANCE CONTRACT:\n{style_bible}\n\n"
                    f"OPENING FRAME EDIT:\n{bundle['styledOpeningFrame']['prompt']}"
                ),
                "references": [
                    user_frame,
                    scene_root / "opening-frame.png",
                    *[target.whitebox_path for target in targets],
                ],
                "output_path": scene_root / "styled-opening-frame.png",
            }
        )
    if only in {"all", "triviews"}:
        prompts_by_id = {
            str(item["target_id"]): item for item in bundle.get("styledTriviews", [])
        }
        for target in targets:
            prompt_item = prompts_by_id.get(target.target_id)
            if prompt_item is None:
                raise RuntimeError(f"Prompt bundle is missing target {target.target_id}.")
            jobs.append(
                {
                    "prompt": (
                        f"SHARED FINAL APPEARANCE CONTRACT:\n{style_bible}\n\n"
                        f"TARGET-SPECIFIC TRI-VIEW EDIT:\n{prompt_item['prompt']}"
                    ),
                    "references": [
                        user_frame,
                        scene_root / "opening-frame.png",
                        target.whitebox_path,
                    ],
                    "output_path": scene_root / "triviews" / target.target_id / "styled-triview.png",
                }
            )
    requested_workers = int(os.environ.get("WORLDKIT_IMAGEGEN_CONCURRENCY", "6"))
    worker_count = max(1, min(requested_workers, len(jobs), 6))
    outputs: list[Path] = []
    with ThreadPoolExecutor(max_workers=worker_count, thread_name_prefix="worldkit-imagegen") as executor:
        futures = [
            executor.submit(
                _generate_one,
                **job,
                project_id=project_id,
                location=location,
                image_model=image_model,
            )
            for job in jobs
        ]
        for future in as_completed(futures):
            output = future.result()
            outputs.append(output)
            print(f"WORLDKIT_DIRECT_IMAGEGEN_IMAGE {output.relative_to(scene_root)}", flush=True)
    return outputs


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene-id")
    parser.add_argument("--scene-root")
    parser.add_argument("--user-frame")
    parser.add_argument("--prompt-only", action="store_true")
    parser.add_argument("--generate-only", action="store_true")
    parser.add_argument("--only", choices=("all", "opening", "triviews"), default="all")
    parser.add_argument("--smoke", action="store_true")
    return parser.parse_args()


def main() -> int:
    arguments = _arguments()
    if arguments.smoke:
        print(
            json.dumps(
                {
                    "prompt_model": DEFAULT_PROMPT_MODEL,
                    "image_model": DEFAULT_IMAGE_MODEL,
                    "parallel_imagegen": True,
                    "project_local_runtime": True,
                },
                sort_keys=True,
            )
        )
        return 0
    if arguments.prompt_only and arguments.generate_only:
        raise RuntimeError("--prompt-only and --generate-only are mutually exclusive.")
    scene_id = str(arguments.scene_id or "")
    if not SCENE_ID_PATTERN.fullmatch(scene_id):
        raise RuntimeError("--scene-id is invalid.")
    scene_root = Path(arguments.scene_root or PROJECT_ROOT / "artifacts" / "scenes" / scene_id).resolve()
    user_frame = Path(arguments.user_frame or "").resolve()
    for required in (
        scene_root / "scene-brief.md",
        scene_root / "visual-identity-palette.json",
        scene_root / "opening-frame.png",
        scene_root / "triviews" / "capture-targets.json",
    ):
        if not required.is_file() or required.is_symlink():
            raise RuntimeError(f"Required visual input is missing: {required}")
    _assert_regular_image(user_frame)
    _assert_regular_image(scene_root / "opening-frame.png")
    targets = _load_targets(scene_root)
    project_id, prompt_location, image_location, prompt_model, image_model = _prepare_vertex_environment()
    prompt_path = scene_root / PROMPT_BUNDLE_NAME
    if not arguments.generate_only:
        bundle = _synthesize_prompts(
            scene_id=scene_id,
            scene_root=scene_root,
            user_frame=user_frame,
            targets=targets,
            project_id=project_id,
            location=prompt_location,
            prompt_model=prompt_model,
            image_model=image_model,
        )
        _atomic_json(prompt_path, bundle)
        print(f"WORLDKIT_GEMINI_PROMPTS_READY {PROMPT_BUNDLE_NAME}", flush=True)
    else:
        if not prompt_path.is_file() or prompt_path.is_symlink():
            raise RuntimeError(f"Gemini prompt bundle is missing: {prompt_path}")
        bundle = _read_json(prompt_path)
    if not arguments.prompt_only:
        print("WORLDKIT_STAGE visual-imagegen", flush=True)
        outputs = _generate_images(
            scene_root=scene_root,
            user_frame=user_frame,
            targets=targets,
            bundle=bundle,
            project_id=project_id,
            location=image_location,
            image_model=image_model,
            only=arguments.only,
        )
        print(f"WORLDKIT_DIRECT_IMAGEGEN_READY count={len(outputs)}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2)
