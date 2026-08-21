import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { DepthRenderer } from "@babylonjs/core/Rendering/depthRenderer.js";
import { GeometryBufferRenderer } from "@babylonjs/core/Rendering/geometryBufferRenderer.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import { sha256Bytes } from "@whitebox-world/protocol";
import type {
  ControlCaptureCameraV1,
  ControlCapturePassPayloadV1,
  RuntimeControlCaptureFrameV1,
  WorldRuntimeSnapshotV3,
} from "@whitebox-world/runtime-contracts";
import { orderBy, uniqBy } from "lodash-es";

interface CaptureClassifiedMeshV1 {
  readonly metadata?: {
    readonly worldkitEntityId?: unknown;
    readonly semanticClassId?: unknown;
  };
}

export interface ControlCaptureSemanticClassEntryV1 {
  readonly numericId: number;
  readonly semanticClassId: string;
}

export interface ControlCaptureInstanceEntryV1 {
  readonly numericId: number;
  readonly entityId: string;
  readonly semanticClassId: string;
}

export interface ControlCaptureTablesV1 {
  readonly semanticClasses: readonly ControlCaptureSemanticClassEntryV1[];
  readonly instances: readonly ControlCaptureInstanceEntryV1[];
}

export interface CaptureBabylonControlFrameOptionsV1 {
  readonly engine: AbstractEngine;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly runtimeSessionId: string;
  readonly captureFrameIndex: number;
  readonly simulationTick: number;
  readonly renderFrameIndex: number;
  readonly renderReadyReceiptId: string;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly cameraEntityId: string;
  readonly cameraRigRef: string;
  readonly snapshot: WorldRuntimeSnapshotV3;
}

const MAX_CAPTURE_TABLE_ID = 0x00ff_ffff;

function assertRgbaLength(
  values: ArrayBufferView,
  widthPixels: number,
  heightPixels: number,
): void {
  if (!Number.isSafeInteger(widthPixels) || widthPixels < 1 ||
    !Number.isSafeInteger(heightPixels) || heightPixels < 1) {
    throw new RangeError("Capture dimensions must be positive safe integers.");
  }
  const elementCount = "length" in values ? values.length as number : values.byteLength;
  if (elementCount !== widthPixels * heightPixels * 4) {
    throw new RangeError("RGBA capture data length does not match its dimensions.");
  }
}

export function flipRgbaRowsToTopLeftV1(
  rgba: Uint8Array,
  widthPixels: number,
  heightPixels: number,
): Uint8Array {
  assertRgbaLength(rgba, widthPixels, heightPixels);
  const output = new Uint8Array(rgba.byteLength);
  const rowByteLength = widthPixels * 4;
  for (let outputRow = 0; outputRow < heightPixels; outputRow += 1) {
    const inputRow = heightPixels - outputRow - 1;
    output.set(
      rgba.subarray(inputRow * rowByteLength, (inputRow + 1) * rowByteLength),
      outputRow * rowByteLength,
    );
  }
  return output;
}

export function encodeUint32LittleEndianV1(values: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}

export function encodeFloat32LittleEndianV1(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytes;
}

export function rgbaBytesToUint32IdsV1(
  rgba: Uint8Array,
  widthPixels: number,
  heightPixels: number,
): Uint32Array {
  const topLeft = flipRgbaRowsToTopLeftV1(rgba, widthPixels, heightPixels);
  const output = new Uint32Array(widthPixels * heightPixels);
  for (let index = 0; index < output.length; index += 1) {
    const byteIndex = index * 4;
    output[index] = topLeft[byteIndex]! |
      (topLeft[byteIndex + 1]! << 8) |
      (topLeft[byteIndex + 2]! << 16);
  }
  return output;
}

export function extractCameraDepthMetersV1(
  rgba: Float32Array,
  widthPixels: number,
  heightPixels: number,
): Float32Array {
  assertRgbaLength(rgba, widthPixels, heightPixels);
  const output = new Float32Array(widthPixels * heightPixels);
  for (let outputRow = 0; outputRow < heightPixels; outputRow += 1) {
    const inputRow = heightPixels - outputRow - 1;
    for (let x = 0; x < widthPixels; x += 1) {
      const inputPixel = inputRow * widthPixels + x;
      const value = rgba[inputPixel * 4]!;
      output[outputRow * widthPixels + x] = Number.isFinite(value) ? Math.abs(value) : 0;
    }
  }
  return output;
}

export function extractWorldNormalsV1(
  rgba: Float32Array,
  widthPixels: number,
  heightPixels: number,
  unsigned: boolean,
): Float32Array {
  assertRgbaLength(rgba, widthPixels, heightPixels);
  const output = new Float32Array(widthPixels * heightPixels * 3);
  for (let outputRow = 0; outputRow < heightPixels; outputRow += 1) {
    const inputRow = heightPixels - outputRow - 1;
    for (let x = 0; x < widthPixels; x += 1) {
      const inputPixel = inputRow * widthPixels + x;
      const source = inputPixel * 4;
      let nx = rgba[source]!;
      let ny = rgba[source + 1]!;
      let nz = rgba[source + 2]!;
      if (unsigned) {
        nx = nx * 2 - 1;
        ny = ny * 2 - 1;
        nz = nz * 2 - 1;
      }
      const length = Math.hypot(nx, ny, nz);
      const target = (outputRow * widthPixels + x) * 3;
      if (!Number.isFinite(length) || length < 0.000001) {
        output[target] = 0;
        output[target + 1] = 0;
        output[target + 2] = 0;
      } else {
        output[target] = nx / length;
        output[target + 1] = ny / length;
        output[target + 2] = nz / length;
      }
    }
  }
  return output;
}

export function buildControlCaptureTablesV1(
  meshes: readonly CaptureClassifiedMeshV1[],
): ControlCaptureTablesV1 {
  const classified = meshes.flatMap((mesh) => {
    const entityId = mesh.metadata?.worldkitEntityId;
    const semanticClassId = mesh.metadata?.semanticClassId;
    return typeof entityId === "string" && entityId.length > 0 &&
      typeof semanticClassId === "string" && semanticClassId.length > 0
      ? [{ entityId, semanticClassId }]
      : [];
  });
  const instances = orderBy(uniqBy(classified, ({ entityId }) => entityId), ["entityId"], ["asc"]);
  for (const instance of instances) {
    if (classified.some(({ entityId, semanticClassId }) =>
      entityId === instance.entityId && semanticClassId !== instance.semanticClassId
    )) {
      throw new Error(`CONTROL_CAPTURE_ENTITY_CLASS_CONFLICT: ${instance.entityId}`);
    }
  }
  const semanticClasses = orderBy(
    uniqBy(classified, ({ semanticClassId }) => semanticClassId),
    ["semanticClassId"],
    ["asc"],
  );
  if (instances.length > MAX_CAPTURE_TABLE_ID || semanticClasses.length > MAX_CAPTURE_TABLE_ID) {
    throw new RangeError("CONTROL_CAPTURE_ID_TABLE_EXHAUSTED");
  }
  return {
    semanticClasses: semanticClasses.map(({ semanticClassId }, index) => ({
      numericId: index + 1,
      semanticClassId,
    })),
    instances: instances.map(({ entityId, semanticClassId }, index) => ({
      numericId: index + 1,
      entityId,
      semanticClassId,
    })),
  };
}

function captureMeshes(scene: Scene): AbstractMesh[] {
  return scene.meshes.filter((mesh) =>
    typeof mesh.metadata?.worldkitEntityId === "string" &&
    typeof mesh.metadata?.semanticClassId === "string" &&
    mesh.getTotalVertices() > 0
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function passPayload(
  passId: ControlCapturePassPayloadV1["passId"],
  mediaType: ControlCapturePassPayloadV1["mediaType"],
  encoding: ControlCapturePassPayloadV1["encoding"],
  bytes: Uint8Array,
): ControlCapturePassPayloadV1 {
  return {
    passId,
    mediaType,
    encoding,
    byteLength: bytes.byteLength,
    contentHash: sha256Bytes(bytes) as ControlCapturePassPayloadV1["contentHash"],
    bytesBase64: bytesToBase64(bytes),
  };
}

function exactColorForId(numericId: number): Color3 {
  return new Color3(
    (numericId & 0xff) / 255,
    ((numericId >>> 8) & 0xff) / 255,
    ((numericId >>> 16) & 0xff) / 255,
  );
}

function createIdMaterial(scene: Scene, name: string, numericId: number): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = exactColorForId(numericId);
  material.specularColor = Color3.Black();
  material.ambientColor = Color3.Black();
  material.alpha = 1;
  material.backFaceCulling = false;
  return material;
}

async function waitForRenderTargetReady(
  target: RenderTargetTexture,
  timeoutMilliseconds = 15_000,
): Promise<void> {
  const startedAt = performance.now();
  while (!target.isReadyForRendering()) {
    if (performance.now() - startedAt >= timeoutMilliseconds) {
      throw new Error(`CONTROL_CAPTURE_RENDER_TARGET_TIMEOUT: ${target.name}`);
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function captureIdPass(
  scene: Scene,
  camera: Camera,
  meshes: readonly AbstractMesh[],
  numericIdByMesh: (mesh: AbstractMesh) => number,
  widthPixels: number,
  heightPixels: number,
  name: string,
): Promise<Uint8Array> {
  const target = new RenderTargetTexture(
    name,
    { width: widthPixels, height: heightPixels },
    scene,
    {
      generateMipMaps: false,
      doNotChangeAspectRatio: false,
      type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
      samplingMode: Texture.NEAREST_SAMPLINGMODE,
      generateDepthBuffer: true,
      generateStencilBuffer: false,
      format: Constants.TEXTUREFORMAT_RGBA,
      samples: 1,
      useSRGBBuffer: false,
      gammaSpace: false,
    },
  );
  const materials = meshes.map((mesh) =>
    createIdMaterial(scene, `${name}.${numericIdByMesh(mesh)}`, numericIdByMesh(mesh))
  );
  try {
    target.activeCamera = camera;
    target.clearColor = new Color4(0, 0, 0, 0);
    target.renderList = [...meshes];
    target.renderParticles = false;
    target.renderSprites = false;
    target.enableOutlineRendering = false;
    target.setMaterialForRendering([...meshes], materials);
    await waitForRenderTargetReady(target);
    target.render(false, false);
    const rgba = new Uint8Array(widthPixels * heightPixels * 4);
    const result = await target.readPixels(0, 0, rgba, true, true);
    if (result === null) throw new Error("CONTROL_CAPTURE_READBACK_FAILED");
    return encodeUint32LittleEndianV1(
      rgbaBytesToUint32IdsV1(rgba, widthPixels, heightPixels),
    );
  } finally {
    target.dispose();
    for (const material of materials) material.dispose(false, false);
  }
}

async function captureNeutralPass(
  scene: Scene,
  camera: Camera,
  meshes: readonly AbstractMesh[],
  widthPixels: number,
  heightPixels: number,
): Promise<Uint8Array> {
  const target = new RenderTargetTexture(
    "worldkit.capture.neutral-color",
    { width: widthPixels, height: heightPixels },
    scene,
    {
      generateMipMaps: false,
      doNotChangeAspectRatio: false,
      type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
      samplingMode: Texture.NEAREST_SAMPLINGMODE,
      generateDepthBuffer: true,
      generateStencilBuffer: false,
      format: Constants.TEXTUREFORMAT_RGBA,
      samples: 1,
      useSRGBBuffer: true,
      gammaSpace: true,
    },
  );
  try {
    target.activeCamera = camera;
    target.clearColor = scene.clearColor;
    target.renderList = [...meshes];
    target.renderParticles = false;
    target.renderSprites = false;
    target.enableOutlineRendering = false;
    await waitForRenderTargetReady(target);
    target.render(false, false);
    const rgba = new Uint8Array(widthPixels * heightPixels * 4);
    const result = await target.readPixels(0, 0, rgba, true, true);
    if (result === null) throw new Error("CONTROL_CAPTURE_READBACK_FAILED");
    const topLeft = flipRgbaRowsToTopLeftV1(rgba, widthPixels, heightPixels);
    const canvas = document.createElement("canvas");
    canvas.width = widthPixels;
    canvas.height = heightPixels;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("CONTROL_CAPTURE_PNG_ENCODER_UNAVAILABLE");
    const imageData = context.createImageData(widthPixels, heightPixels);
    imageData.data.set(topLeft);
    context.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const separatorIndex = dataUrl.indexOf(",");
    if (separatorIndex < 0) throw new Error("CONTROL_CAPTURE_NEUTRAL_ENCODING_FAILED");
    return base64ToBytes(dataUrl.slice(separatorIndex + 1));
  } finally {
    target.dispose();
  }
}

async function captureDepthPass(
  scene: Scene,
  camera: Camera,
  meshes: readonly AbstractMesh[],
  widthPixels: number,
  heightPixels: number,
): Promise<Uint8Array> {
  const target = new RenderTargetTexture(
    "worldkit.capture.linear-depth-meters",
    { width: widthPixels, height: heightPixels },
    scene,
    {
      generateMipMaps: false,
      doNotChangeAspectRatio: false,
      type: Constants.TEXTURETYPE_FLOAT,
      samplingMode: Texture.NEAREST_SAMPLINGMODE,
      generateDepthBuffer: true,
      generateStencilBuffer: false,
      format: Constants.TEXTUREFORMAT_RGBA,
      samples: 1,
    },
  );
  const renderer = new DepthRenderer(
    scene,
    Constants.TEXTURETYPE_FLOAT,
    camera,
    false,
    Texture.NEAREST_SAMPLINGMODE,
    true,
    "worldkit.capture.linear-depth-meters.renderer",
    target,
  );
  try {
    renderer.clearColor = new Color4(0, 0, 0, 0);
    renderer.forceDepthWriteTransparentMeshes = true;
    target.activeCamera = camera;
    target.renderList = [...meshes];
    await waitForRenderTargetReady(target);
    target.render(false, false);
    const rgba = new Float32Array(widthPixels * heightPixels * 4);
    const result = await target.readPixels(0, 0, rgba, true, false);
    if (result === null) throw new Error("CONTROL_CAPTURE_READBACK_FAILED");
    return encodeFloat32LittleEndianV1(
      extractCameraDepthMetersV1(rgba, widthPixels, heightPixels),
    );
  } finally {
    renderer.dispose();
  }
}

async function captureNormalPass(
  scene: Scene,
  meshes: readonly AbstractMesh[],
  widthPixels: number,
  heightPixels: number,
): Promise<Uint8Array> {
  const renderer = new GeometryBufferRenderer(
    scene,
    { width: widthPixels, height: heightPixels },
    Constants.TEXTUREFORMAT_DEPTH16,
    {
      [GeometryBufferRenderer.DEPTH_TEXTURE_TYPE]: {
        textureType: Constants.TEXTURETYPE_FLOAT,
        textureFormat: Constants.TEXTUREFORMAT_RGBA,
        samplingMode: Texture.NEAREST_SAMPLINGMODE,
      },
      [GeometryBufferRenderer.NORMAL_TEXTURE_TYPE]: {
        textureType: Constants.TEXTURETYPE_FLOAT,
        textureFormat: Constants.TEXTUREFORMAT_RGBA,
        samplingMode: Texture.NEAREST_SAMPLINGMODE,
      },
    },
  );
  try {
    if (!renderer.isSupported) throw new Error("CONTROL_CAPTURE_CAPABILITY_UNAVAILABLE");
    renderer.generateNormalsInWorldSpace = true;
    renderer.renderTransparentMeshes = true;
    renderer.renderList = [...meshes];
    const gBuffer = renderer.getGBuffer();
    await waitForRenderTargetReady(gBuffer);
    gBuffer.render(false, false);
    const normalIndex = renderer.getTextureIndex(GeometryBufferRenderer.NORMAL_TEXTURE_TYPE);
    const normalTexture = gBuffer.textures[normalIndex];
    if (normalTexture === undefined) throw new Error("CONTROL_CAPTURE_NORMAL_TARGET_MISSING");
    const rgba = new Float32Array(widthPixels * heightPixels * 4);
    const result = await normalTexture.readPixels(0, 0, rgba, true, false);
    if (result === null) throw new Error("CONTROL_CAPTURE_READBACK_FAILED");
    return encodeFloat32LittleEndianV1(
      extractWorldNormalsV1(rgba, widthPixels, heightPixels, renderer.normalsAreUnsigned),
    );
  } finally {
    renderer.dispose();
  }
}

function captureCamera(
  engine: AbstractEngine,
  camera: Camera,
  cameraEntityId: string,
  cameraRigRef: string,
  widthPixels: number,
  heightPixels: number,
): ControlCaptureCameraV1 {
  const forward = camera.getForwardRay(1).direction.normalize();
  const up = camera.upVector.normalize();
  const projection = Matrix.PerspectiveFovRH(
    camera.fov,
    widthPixels / heightPixels,
    camera.minZ,
    camera.maxZ,
    engine.isNDCHalfZRange,
    0,
    engine.useReverseDepthBuffer,
  );
  return {
    cameraEntityId,
    cameraRigRef,
    positionMetersXYZ: camera.globalPosition.asArray(),
    forwardXYZ: forward.asArray(),
    upXYZ: up.asArray(),
    verticalFovRadians: camera.fov,
    nearClipMeters: camera.minZ,
    farClipMeters: camera.maxZ,
    viewMatrixColumnMajor: Array.from(camera.getViewMatrix(true).asArray()),
    projectionMatrixColumnMajor: Array.from(projection.asArray()),
  };
}

export async function captureBabylonControlFrameV1(
  options: CaptureBabylonControlFrameOptionsV1,
): Promise<RuntimeControlCaptureFrameV1> {
  await options.scene.whenReadyAsync(false);
  const meshes = captureMeshes(options.scene);
  const tables = buildControlCaptureTablesV1(meshes);
  const semanticIdByClass = new Map(
    tables.semanticClasses.map((entry) => [entry.semanticClassId, entry.numericId]),
  );
  const instanceIdByEntity = new Map(
    tables.instances.map((entry) => [entry.entityId, entry.numericId]),
  );
  const idFor = (mesh: AbstractMesh, table: ReadonlyMap<string, number>, field: string): number => {
    const value = mesh.metadata?.[field];
    const numericId = typeof value === "string" ? table.get(value) : undefined;
    if (numericId === undefined) throw new Error("CONTROL_CAPTURE_ID_TABLE_INCOMPLETE");
    return numericId;
  };

  const neutralBytes = await captureNeutralPass(
    options.scene,
    options.camera,
    meshes,
    options.widthPixels,
    options.heightPixels,
  );

  // Babylon render targets share Scene transform and render-pass state. Capture them
  // serially so every pass observes the same ready frame without overlapping GPU work.
  const depthBytes = await captureDepthPass(
    options.scene,
    options.camera,
    meshes,
    options.widthPixels,
    options.heightPixels,
  );
  const semanticBytes = await captureIdPass(
    options.scene,
    options.camera,
    meshes,
    (mesh) => idFor(mesh, semanticIdByClass, "semanticClassId"),
    options.widthPixels,
    options.heightPixels,
    "worldkit.capture.semantic-class-id",
  );
  const instanceBytes = await captureIdPass(
    options.scene,
    options.camera,
    meshes,
    (mesh) => idFor(mesh, instanceIdByEntity, "worldkitEntityId"),
    options.widthPixels,
    options.heightPixels,
    "worldkit.capture.instance-id",
  );
  const normalBytes = await captureNormalPass(
    options.scene,
    meshes,
    options.widthPixels,
    options.heightPixels,
  );

  return {
    kind: "worldkit-control-capture-frame",
    schemaVersion: 1,
    runtimeSessionId: options.runtimeSessionId,
    captureFrameIndex: options.captureFrameIndex,
    simulationTick: options.simulationTick,
    renderFrameIndex: options.renderFrameIndex,
    renderReadyReceiptId: options.renderReadyReceiptId,
    widthPixels: options.widthPixels,
    heightPixels: options.heightPixels,
    camera: captureCamera(
      options.engine,
      options.camera,
      options.cameraEntityId,
      options.cameraRigRef,
      options.widthPixels,
      options.heightPixels,
    ),
    snapshot: options.snapshot,
    semanticClasses: tables.semanticClasses,
    instances: tables.instances,
    passesById: {
      "neutral-color": passPayload(
        "neutral-color",
        "image/png",
        "png-rgba8-srgb",
        neutralBytes,
      ),
      "linear-depth-meters": passPayload(
        "linear-depth-meters",
        "application/octet-stream",
        "float32-le",
        depthBytes,
      ),
      "semantic-class-id": passPayload(
        "semantic-class-id",
        "application/octet-stream",
        "uint32-le",
        semanticBytes,
      ),
      "instance-id": passPayload(
        "instance-id",
        "application/octet-stream",
        "uint32-le",
        instanceBytes,
      ),
      "world-normal": passPayload(
        "world-normal",
        "application/octet-stream",
        "float32x3-le",
        normalBytes,
      ),
    },
  };
}
