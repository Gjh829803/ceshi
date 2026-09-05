import path from "node:path";
import sharp from "sharp";
import type { NativeBlockGenerationReferenceInputV1 } from "@whitebox-world/scene-authoring-contracts";

type ReferenceMediaTypeV1 = NativeBlockGenerationReferenceInputV1["mediaType"];

export function nativeWorldReferenceMediaTypeV1(filePath: string): ReferenceMediaTypeV1 {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    default: throw new TypeError("NATIVE_WORLD_REFERENCE_MEDIA_TYPE_INVALID");
  }
}

export function nativeWorldReferenceInputRefV1(index: number, mediaType: ReferenceMediaTypeV1): string {
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType.slice("image/".length);
  return `reference-${index}.${extension}`;
}

export async function validateNativeWorldReferenceImageV1(
  bytes: Uint8Array,
  mediaType: ReferenceMediaTypeV1,
): Promise<void> {
  try {
    const image = sharp(bytes, { failOn: "error" });
    const metadata = await image.metadata();
    if (`image/${metadata.format}` !== mediaType || (metadata.pages ?? 1) !== 1) {
      throw new TypeError("media signature mismatch or animated reference");
    }
    // Force a decode, without replacing the original bytes or their identity.
    await image.stats();
  } catch (cause) {
    throw new TypeError("NATIVE_WORLD_REFERENCE_IMAGE_INVALID", { cause });
  }
}
