import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import type { CameraDocument, CameraJsonValue } from "./types";
import { validateCameraDocumentData } from "./resolve";
import { cloneCameraData } from "./validation";
export function parseCameraDocument(value: unknown): CameraDocument {
  validateCameraDocumentData(value);
  return cloneCameraData(value);
}
function canonical(value: CameraJsonValue): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            canonical((value as Record<string, CameraJsonValue>)[key]!),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
/** UTF-8 canonical content; unused preset snapshots are not delivery dependencies. */
export function serializeCameraDocument(document: CameraDocument): string {
  const parsed = parseCameraDocument(document);
  const ids = new Set<string>();
  for (const view of Object.values(parsed.views))
    if (view.presetId) ids.add(view.presetId);
  for (const subject of Object.values(parsed.binding.subjectOverrides ?? {}))
    for (const view of Object.values(subject.views))
      if (view.presetId) ids.add(view.presetId);
  const { presets: _, ...rest } = parsed;
  const referenced = Object.fromEntries(
    [...ids].map((id) => [id, parsed.presets![id]!]),
  );
  return canonical({
    ...rest,
    ...(ids.size ? { presets: referenced } : {}),
  } as unknown as CameraJsonValue);
}
/** Computed from actual canonical content, never from sourceIdentity claims. */
export function hashCameraDocument(document: CameraDocument): string {
  return bytesToHex(sha256(utf8ToBytes(serializeCameraDocument(document))));
}
