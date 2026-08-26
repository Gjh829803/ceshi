import { readFile } from "node:fs/promises";

import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import {
  GlbAdmissionErrorV1,
  validateGlbAdmissionV1,
} from "./glb-admission.js";

const GOLDEN_MODEL_PATH =
  "assets/subjects/packages/seedleap/golden-humanoid/v1/model/model.glb";
const RUNTIME_BUNDLE_CASES = [
  [
    "Golden",
    "apps/playground/public/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
    4,
  ],
  [
    "G Bot",
    "apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
    25,
  ],
] as const;

function jsonGlb(json: Record<string, unknown>): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const paddedLength = Math.ceil(encoded.byteLength / 4) * 4;
  const bytes = new Uint8Array(20 + paddedLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20);
  bytes.set(encoded, 20);
  return bytes;
}

async function expectCode(
  promise: Promise<unknown>,
  code: GlbAdmissionErrorV1["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("validateGlbAdmissionV1", () => {
  it("admits a committed rigged Model with a deterministic official-validator receipt", async () => {
    const bytes = new Uint8Array(await readFile(GOLDEN_MODEL_PATH));

    const first = await validateGlbAdmissionV1(bytes, {
      profileId: "subject-rigged-model.v1",
    });
    const second = await validateGlbAdmissionV1(bytes, {
      profileId: "subject-rigged-model.v1",
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      kind: "glb-admission-receipt",
      schemaVersion: 1,
      profileId: "subject-rigged-model.v1",
      validatorName: "Khronos glTF Validator",
      validatorVersion: "2.0.0-dev.3.10",
      byteLengthBytes: bytes.byteLength,
      isSelfContained: true,
      admitted: true,
      inventory: {
        meshCount: 1,
        skinCount: 1,
        animationClipCount: 0,
        cameraCount: 0,
        lightCount: 0,
        totalVertexCount: 360,
        totalTriangleCount: 180,
      },
      issues: {
        errorCount: 0,
      },
    });
    expect(first.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rejects a forged GLB envelope before validator admission", async () => {
    const bytes = jsonGlb({ asset: { version: "2.0" } });
    new DataView(bytes.buffer).setUint32(8, bytes.byteLength + 4, true);

    await expectCode(
      validateGlbAdmissionV1(bytes, { profileId: "subject-source-archive.v1" }),
      "GLB_ADMISSION_ENVELOPE_INVALID",
    );
  });

  it("surfaces Khronos structural and semantic errors without accepting parseability", async () => {
    const bytes = jsonGlb({
      asset: { version: "2.0" },
      nodes: [{ rotation: [0, 0, 0, 2] }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    });

    await expect(new NodeIO().readBinary(bytes)).resolves.toBeDefined();
    await expectCode(
      validateGlbAdmissionV1(bytes, { profileId: "subject-source-archive.v1" }),
      "GLB_ADMISSION_VALIDATOR_ERROR",
    );
  });

  it("never resolves Buffer or Image URIs, including data URIs", async () => {
    const variants = [
      { buffers: [{ byteLength: 4, uri: "external.bin" }] },
      { images: [{ uri: "data:image/png;base64,AAAA" }] },
    ];

    for (const variant of variants) {
      await expectCode(
        validateGlbAdmissionV1(jsonGlb({ asset: { version: "2.0" }, ...variant }), {
          profileId: "subject-source-archive.v1",
        }),
        "GLB_ADMISSION_EXTERNAL_URI_FORBIDDEN",
      );
    }
  });

  it("keeps extension recognition separate from WorldKit profile admission", async () => {
    const bytes = jsonGlb({
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_materials_specular"],
    });

    await expectCode(
      validateGlbAdmissionV1(bytes, { profileId: "subject-source-archive.v1" }),
      "GLB_ADMISSION_EXTENSION_UNSUPPORTED",
    );
    await expect(
      validateGlbAdmissionV1(bytes, {
        profileId: "subject-source-archive.v1",
        allowedExtensions: ["KHR_materials_specular"],
      }),
    ).resolves.toMatchObject({
      extensionsUsed: ["KHR_materials_specular"],
      admitted: true,
    });

    const unknownExtensionBytes = jsonGlb({
      asset: { version: "2.0" },
      extensionsUsed: ["EXT_worldkit_unknown"],
    });
    await expectCode(
      validateGlbAdmissionV1(unknownExtensionBytes, {
        profileId: "subject-source-archive.v1",
        allowedExtensions: ["EXT_worldkit_unknown"],
      }),
      "GLB_ADMISSION_EXTENSION_UNSUPPORTED",
    );
  });

  it("rejects a Khronos-valid Rigged Model under the Static WorldKit profile", async () => {
    const bytes = new Uint8Array(await readFile(GOLDEN_MODEL_PATH));

    await expectCode(
      validateGlbAdmissionV1(bytes, { profileId: "subject-static-ready.v1" }),
      "GLB_ADMISSION_PROFILE_MISMATCH",
    );
  });

  it("rejects a forged locked inventory after independent inspection", async () => {
    const bytes = new Uint8Array(await readFile(GOLDEN_MODEL_PATH));

    await expectCode(
      validateGlbAdmissionV1(bytes, {
        profileId: "subject-rigged-model.v1",
        expectedInventory: { meshCount: 2 },
      }),
      "GLB_ADMISSION_INVENTORY_MISMATCH",
    );
  });

  it.each(RUNTIME_BUNDLE_CASES)(
    "admits the committed %s Runtime Bundle corpus entry",
    async (_name, filePath, animationClipCount) => {
      const receipt = await validateGlbAdmissionV1(
        new Uint8Array(await readFile(filePath)),
        { profileId: "subject-runtime-bundle.v1" },
      );

      expect(receipt.inventory).toMatchObject({
        skinCount: 1,
        animationClipCount,
        cameraCount: 0,
        lightCount: 0,
      });
      expect(receipt.issues.errorCount).toBe(0);
    },
  );
});
