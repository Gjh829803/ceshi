import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { ContributorSourceFbxAssetInventoryEntryV1 } from "@whitebox-world/subject-registry";
import type { StaticSubjectBakeConfigV1 } from "../../packages/subject-registry/src/xier120-static-subject-config";
import {
  Box3,
  BufferGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export type { StaticSubjectBakeConfigV1 };

export interface StaticSubjectBakeArtifactV1 {
  readonly bytes: Uint8Array;
  readonly byteLength: number;
  readonly contentHash: `sha256:${string}`;
  readonly mediaType: "model/gltf-binary";
  readonly format: "glb";
}

export interface StaticSubjectBakeBoundsV1 {
  readonly minimumMetersXYZ: readonly [number, number, number];
  readonly maximumMetersXYZ: readonly [number, number, number];
  readonly sizeMetersXYZ: readonly [number, number, number];
}

export interface StaticSubjectBakeInventoryV1 {
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly skeletonCount: 0;
  readonly boneCount: 0;
  readonly animationClipNames: readonly [];
  readonly cameraCount: 0;
  readonly lightCount: 0;
}

export interface StaticSubjectBakeResultV1 {
  readonly artifact: StaticSubjectBakeArtifactV1;
  readonly bounds: StaticSubjectBakeBoundsV1;
  readonly inventory: StaticSubjectBakeInventoryV1;
}

export interface StaticSubjectBakeRequestV1 {
  readonly sourceEntry: ContributorSourceFbxAssetInventoryEntryV1;
  readonly config: StaticSubjectBakeConfigV1;
  readonly repositoryRootPath: string;
}

const POSITION_COMPONENTS = 3;
const TRIANGLE_VERTEX_COUNT = 3;
const MINIMUM_TRIANGLE_CROSS_LENGTH_SQUARED = 1e-20;
const MERGE_TOLERANCE = 1e-6;

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function assertConfig(
  sourceEntry: ContributorSourceFbxAssetInventoryEntryV1,
  config: StaticSubjectBakeConfigV1,
): void {
  if (config.sourceId !== sourceEntry.sourceId) {
    throw new Error(
      `Static bake source/config mismatch: ${sourceEntry.sourceId} != ${config.sourceId}`,
    );
  }
  if (!Number.isFinite(config.scaleToMeters) || config.scaleToMeters <= 0) {
    throw new Error(`Static bake scaleToMeters must be positive for ${config.sourceId}`);
  }
  if (!config.rotateXYZRadians.every(Number.isFinite)) {
    throw new Error(`Static bake rotation must be finite for ${config.sourceId}`);
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(config.displayColorHex)) {
    throw new Error(`Static bake display color must be six-digit hex for ${config.sourceId}`);
  }
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function isWorldVisible(mesh: Mesh): boolean {
  let current: Mesh["parent"] | Mesh = mesh;
  while (current !== null) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function flattenMeshGeometry(mesh: Mesh, worldToBakeMatrix: Matrix4): BufferGeometry | null {
  const sourcePosition = mesh.geometry.getAttribute("position");
  if (sourcePosition === undefined || sourcePosition.count === 0) return null;
  const sourceIndex = mesh.geometry.getIndex();
  const sourceVertexSequence = sourceIndex?.array ??
    Uint32Array.from({ length: sourcePosition.count }, (_, index) => index);
  if (sourceVertexSequence.length % TRIANGLE_VERTEX_COUNT !== 0) {
    throw new Error(`Static bake mesh is not triangular: ${mesh.name || "unnamed"}`);
  }

  const bakedPositions: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const edgeAB = new Vector3();
  const edgeAC = new Vector3();
  for (let offset = 0; offset < sourceVertexSequence.length; offset += 3) {
    const aIndex = sourceVertexSequence[offset];
    const bIndex = sourceVertexSequence[offset + 1];
    const cIndex = sourceVertexSequence[offset + 2];
    if (aIndex === undefined || bIndex === undefined || cIndex === undefined) {
      throw new Error(`Static bake triangle index is incomplete: ${mesh.name || "unnamed"}`);
    }
    mesh.getVertexPosition(aIndex, a).applyMatrix4(worldToBakeMatrix);
    mesh.getVertexPosition(bIndex, b).applyMatrix4(worldToBakeMatrix);
    mesh.getVertexPosition(cIndex, c).applyMatrix4(worldToBakeMatrix);
    if (![...a, ...b, ...c].every(Number.isFinite)) {
      throw new Error(`Static bake mesh contains non-finite positions: ${mesh.name || "unnamed"}`);
    }
    edgeAB.subVectors(b, a);
    edgeAC.subVectors(c, a);
    if (edgeAB.cross(edgeAC).lengthSq() <= MINIMUM_TRIANGLE_CROSS_LENGTH_SQUARED) {
      continue;
    }
    bakedPositions.push(...a, ...b, ...c);
  }
  if (bakedPositions.length === 0) return null;

  const triangleGeometry = new BufferGeometry();
  triangleGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(bakedPositions, POSITION_COMPONENTS),
  );
  triangleGeometry.computeVertexNormals();
  const indexedGeometry = mergeVertices(triangleGeometry, MERGE_TOLERANCE);
  triangleGeometry.dispose();
  indexedGeometry.computeBoundingBox();
  indexedGeometry.computeBoundingSphere();
  return indexedGeometry;
}

function supportCenterGeometries(geometries: readonly BufferGeometry[]): StaticSubjectBakeBoundsV1 {
  const combinedBounds = new Box3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    if (geometry.boundingBox !== null) combinedBounds.union(geometry.boundingBox);
  }
  if (combinedBounds.isEmpty()) {
    throw new Error("Static bake produced no renderable triangle geometry");
  }
  const center = combinedBounds.getCenter(new Vector3());
  const translation = new Vector3(-center.x, -combinedBounds.min.y, -center.z);
  const supportedBounds = new Box3();
  for (const geometry of geometries) {
    geometry.translate(translation.x, translation.y, translation.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    if (geometry.boundingBox !== null) supportedBounds.union(geometry.boundingBox);
  }
  const size = supportedBounds.getSize(new Vector3());
  return Object.freeze({
    minimumMetersXYZ: Object.freeze(supportedBounds.min.toArray()),
    maximumMetersXYZ: Object.freeze(supportedBounds.max.toArray()),
    sizeMetersXYZ: Object.freeze(size.toArray()),
  });
}

class NodeBlobFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.({ target: this } as unknown as ProgressEvent<FileReader>);
    });
  }

  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
      this.onloadend?.({ target: this } as unknown as ProgressEvent<FileReader>);
    });
  }
}

async function exportBinary(root: Group): Promise<Uint8Array> {
  const previousFileReader = globalThis.FileReader;
  if (previousFileReader === undefined) {
    globalThis.FileReader = NodeBlobFileReader as unknown as typeof FileReader;
  }
  try {
    const output = await new GLTFExporter().parseAsync(root, {
      animations: [],
      binary: true,
      includeCustomExtensions: false,
      onlyVisible: true,
      trs: false,
    });
    if (!(output instanceof ArrayBuffer)) {
      throw new Error("Static bake GLTFExporter did not produce binary output");
    }
    return new Uint8Array(output);
  } finally {
    if (previousFileReader === undefined) {
      delete (globalThis as { FileReader?: typeof FileReader }).FileReader;
    } else {
      globalThis.FileReader = previousFileReader;
    }
  }
}

export async function bakeStaticSubjectFbx(
  request: StaticSubjectBakeRequestV1,
): Promise<StaticSubjectBakeResultV1> {
  const { sourceEntry, config, repositoryRootPath } = request;
  assertConfig(sourceEntry, config);
  const sourcePath = resolve(repositoryRootPath, sourceEntry.repositoryRelativePath);
  const sourceBytes = await readFile(sourcePath);
  if (sourceBytes.byteLength !== sourceEntry.byteLength) {
    throw new Error(
      `Static bake source length mismatch for ${sourceEntry.sourceId}: ` +
        `${sourceBytes.byteLength} != ${sourceEntry.byteLength}`,
    );
  }
  const sourceContentHash = sha256(sourceBytes);
  if (sourceContentHash !== sourceEntry.contentHash) {
    throw new Error(
      `Static bake source hash mismatch for ${sourceEntry.sourceId}: ` +
        `${sourceContentHash} != ${sourceEntry.contentHash}`,
    );
  }

  const sourceRoot = new FBXLoader().parse(
    exactArrayBuffer(sourceBytes),
    `${dirname(sourcePath)}/`,
  );
  sourceRoot.updateMatrixWorld(true);
  const [rotateX, rotateY, rotateZ] = config.rotateXYZRadians;
  const configMatrix = new Matrix4().makeRotationFromEuler(
    new Euler(rotateX, rotateY, rotateZ, "XYZ"),
  );
  configMatrix.scale(
    new Vector3(config.scaleToMeters, config.scaleToMeters, config.scaleToMeters),
  );

  const outputRoot = new Group();
  outputRoot.name = `${config.sourceId}.static`;
  const material = new MeshStandardMaterial({
    color: config.displayColorHex,
    metalness: 0,
    roughness: 1,
  });
  material.name = `${config.sourceId}.whitebox-material`;
  const outputGeometries: BufferGeometry[] = [];
  sourceRoot.traverse((node) => {
    if (!(node instanceof Mesh) || !isWorldVisible(node)) return;
    const geometry = flattenMeshGeometry(
      node,
      new Matrix4().multiplyMatrices(configMatrix, node.matrixWorld),
    );
    if (geometry === null) return;
    const meshIndex = outputGeometries.length;
    geometry.name = `${config.sourceId}.geometry.${meshIndex.toString().padStart(3, "0")}`;
    outputGeometries.push(geometry);
    const outputMesh = new Mesh(geometry, material);
    outputMesh.name = `${config.sourceId}.mesh.${meshIndex.toString().padStart(3, "0")}`;
    outputRoot.add(outputMesh);
  });

  const bounds = supportCenterGeometries(outputGeometries);
  const artifactBytes = await exportBinary(outputRoot);
  const inventory = Object.freeze({
    meshCount: outputGeometries.length,
    vertexCount: outputGeometries.reduce(
      (sum, geometry) => sum + (geometry.getAttribute("position")?.count ?? 0),
      0,
    ),
    triangleCount: outputGeometries.reduce(
      (sum, geometry) => sum + (geometry.getIndex()?.count ?? 0) / 3,
      0,
    ),
    skeletonCount: 0,
    boneCount: 0,
    animationClipNames: Object.freeze([]),
    cameraCount: 0,
    lightCount: 0,
  } as const satisfies StaticSubjectBakeInventoryV1);
  return Object.freeze({
    artifact: Object.freeze({
      bytes: artifactBytes,
      byteLength: artifactBytes.byteLength,
      contentHash: sha256(artifactBytes),
      mediaType: "model/gltf-binary",
      format: "glb",
    }),
    bounds,
    inventory,
  });
}
