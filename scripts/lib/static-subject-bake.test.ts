import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import "@whitebox-world/runtime-babylon";
import { sourceFbxContributorAssetInventory } from "@whitebox-world/subject-registry";
import { describe, expect, test } from "vitest";

import { xier120StaticSubjectBakeConfigs } from "../../packages/subject-registry/src/xier120-static-subject-config";
import {
  bakeXier120StaticSubjects,
  parseXier120StaticSubjectBakeArguments,
} from "../bake-xier120-static-subjects";
import {
  bakeStaticSubjectFbx,
  type StaticSubjectBakeConfigV1,
} from "./static-subject-bake";

const REPOSITORY_ROOT_PATH = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE_ENTRY = sourceFbxContributorAssetInventory.find(
  (entry) => entry.sourceId === "xier120.biped-animal",
);
const CONFIG = Object.freeze({
  sourceId: "xier120.biped-animal",
  scaleToMeters: 0.01,
  rotateXYZRadians: [0, Math.PI / 2, 0],
  expectedForward: "-Z",
  displayColorHex: "#7c9a72",
} as const satisfies StaticSubjectBakeConfigV1);

interface ParsedGlbJsonV2 {
  readonly animations?: readonly unknown[];
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly cameras?: readonly unknown[];
  readonly images?: readonly { readonly uri?: string }[];
  readonly skins?: readonly unknown[];
  readonly extensions?: Readonly<Record<string, unknown>>;
}

function parseGlbJson(bytes: Uint8Array): ParsedGlbJsonV2 {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  const jsonChunkByteLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a);
  return JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + jsonChunkByteLength)).trim(),
  ) as ParsedGlbJsonV2;
}

describe("bakeStaticSubjectFbx", () => {
  test("produces byte-identical, self-contained static GLB admitted by Babylon", async () => {
    // Catches nondeterministic export metadata/order, leaked rig content, non-indexed
    // output, invalid normals, or failure to support-center the meter-scale artifact.
    expect(SOURCE_ENTRY).toBeDefined();
    const first = await bakeStaticSubjectFbx({
      sourceEntry: SOURCE_ENTRY!,
      config: CONFIG,
      repositoryRootPath: REPOSITORY_ROOT_PATH,
    });
    const second = await bakeStaticSubjectFbx({
      sourceEntry: SOURCE_ENTRY!,
      config: CONFIG,
      repositoryRootPath: REPOSITORY_ROOT_PATH,
    });

    expect(second.artifact.bytes).toEqual(first.artifact.bytes);
    expect(second.artifact.contentHash).toBe(first.artifact.contentHash);
    expect(first.artifact.byteLength).toBe(first.artifact.bytes.byteLength);
    expect(first.artifact.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.bounds.minimumMetersXYZ[1]).toBeCloseTo(0, 5);
    expect(
      (first.bounds.minimumMetersXYZ[0] + first.bounds.maximumMetersXYZ[0]) / 2,
    ).toBeCloseTo(0, 5);
    expect(
      (first.bounds.minimumMetersXYZ[2] + first.bounds.maximumMetersXYZ[2]) / 2,
    ).toBeCloseTo(0, 5);
    expect(first.bounds.sizeMetersXYZ.every((size) => size > 0)).toBe(true);
    expect(first.inventory).toMatchObject({
      skeletonCount: 0,
      boneCount: 0,
      animationClipNames: [],
      cameraCount: 0,
      lightCount: 0,
    });

    const gltf = parseGlbJson(first.artifact.bytes);
    expect(gltf.skins ?? []).toHaveLength(0);
    expect(gltf.animations ?? []).toHaveLength(0);
    expect(gltf.cameras ?? []).toHaveLength(0);
    expect(gltf.images ?? []).toHaveLength(0);
    expect(gltf.buffers?.every((buffer) => buffer.uri === undefined)).toBe(true);
    expect(gltf.extensions?.KHR_lights_punctual).toBeUndefined();

    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const container = await LoadAssetContainerAsync(first.artifact.bytes, scene, {
        pluginExtension: ".glb",
      });
      try {
        const renderableMeshes = container.meshes.filter(
          (mesh) => mesh.geometry !== null && mesh.getTotalVertices() > 0,
        );
        expect(renderableMeshes).toHaveLength(first.inventory.meshCount);
        expect(container.skeletons).toHaveLength(0);
        expect(container.animationGroups).toHaveLength(0);
        expect(container.cameras).toHaveLength(0);
        expect(container.lights).toHaveLength(0);
        for (const mesh of renderableMeshes) {
          const indices = mesh.getIndices();
          const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
          expect(indices).not.toBeNull();
          expect(indices!.length).toBeGreaterThan(0);
          expect(indices!.length % 3).toBe(0);
          expect(normals).not.toBeNull();
          expect(normals).toHaveLength(mesh.getTotalVertices() * 3);
          expect(normals!.every(Number.isFinite)).toBe(true);
        }
      } finally {
        container.dispose();
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});

describe("xier120StaticSubjectBakeConfigs", () => {
  test("provides one explicit correction for each frozen contributor source ID", () => {
    // Catches an omitted source, duplicate correction, or correction published
    // without the required meter/orientation/color admission fields.
    expect(xier120StaticSubjectBakeConfigs.map(({ sourceId }) => sourceId).sort()).toEqual([
      "xier120.aerial-cockpit",
      "xier120.aerial-hanging",
      "xier120.aerial-seated",
      "xier120.aerial-seated-variant",
      "xier120.aerial-standing",
      "xier120.biped-animal",
      "xier120.flat-seated-glider",
      "xier120.four-wheel",
      "xier120.four-wheel-variant",
      "xier120.hoverboard-standing",
      "xier120.prone-glider",
      "xier120.quadruped-animal",
      "xier120.quadruped-reptile",
      "xier120.quadruped-ridable",
      "xier120.snake-animal",
      "xier120.three-wheel",
      "xier120.tracked",
      "xier120.two-wheel-motorcycle",
      "xier120.two-wheel-motorcycle-variant",
    ]);
    expect(new Set(xier120StaticSubjectBakeConfigs.map(({ sourceId }) => sourceId))).toHaveProperty(
      "size",
      19,
    );
    for (const config of xier120StaticSubjectBakeConfigs) {
      expect(config.scaleToMeters).toBeGreaterThan(0);
      expect(config.rotateXYZRadians).toHaveLength(3);
      expect(config.rotateXYZRadians.every(Number.isFinite)).toBe(true);
      expect(config.expectedForward).toBe("-Z");
      expect(config.displayColorHex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("bakeXier120StaticSubjects", () => {
  test("accepts the pnpm-forwarded delimiter before check mode", () => {
    expect(parseXier120StaticSubjectBakeArguments(["--", "--check"])).toEqual({
      check: true,
    });
  });

  test("check mode reports an exact-byte mismatch without overwriting committed output", async () => {
    // Catches check mode writing into its comparison target or comparing only
    // metadata instead of exact regenerated bytes.
    const temporaryRootPath = await mkdtemp(join(tmpdir(), "xier120-bake-test-"));
    const outputRootPath = join(temporaryRootPath, "committed");
    try {
      const written = await bakeXier120StaticSubjects({
        repositoryRootPath: REPOSITORY_ROOT_PATH,
        outputRootPath,
        check: false,
        log: () => undefined,
      });
      expect(written).toHaveLength(19);
      const firstOutputPath = written[0]?.outputPath;
      expect(firstOutputPath).toBeDefined();
      const corruptedBytes = await readFile(firstOutputPath!);
      const finalByteIndex = corruptedBytes.length - 1;
      const finalByte = corruptedBytes[finalByteIndex];
      expect(finalByte).toBeDefined();
      corruptedBytes[finalByteIndex] = finalByte! ^ 0xff;
      await writeFile(firstOutputPath!, corruptedBytes);

      await expect(
        bakeXier120StaticSubjects({
          repositoryRootPath: REPOSITORY_ROOT_PATH,
          outputRootPath,
          check: true,
          log: () => undefined,
        }),
      ).rejects.toThrow(/exact-byte mismatch.*xier120\.aerial-cockpit/i);
      expect(await readFile(firstOutputPath!)).toEqual(corruptedBytes);
    } finally {
      await rm(temporaryRootPath, { recursive: true, force: true });
    }
  }, 120_000);
});
