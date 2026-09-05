import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import {
  type FormalWorldBoundsMetersV1,
  inspectWhiteboxTriviewPixelsV1,
  WHITEBOX_TRIVIEW_BACKGROUND_COLOR_V1,
} from "@whitebox-world/runtime-contracts";

import {
  fitOrthographicBoundsToWorldExtentsV1,
  orientCameraAtExactPose,
} from "./formal-world-camera.js";

// Preserve the old capture's active animation dependencies without visible pixels.
const TRIVIEW_NON_TARGET_VISIBILITY = 1e-6;
const TRIVIEW_MAXIMUM_RENDER_ATTEMPTS_PER_VIEW = 8;
const REVIEW_TRIVIEW_ELEVATION_RADIANS_V1 = 10 * Math.PI / 180;

function panelHasRenderableForeground(
  context: CanvasRenderingContext2D,
  outputWidthPixels: number,
  heightPixels: number,
  panelIndex: number,
): boolean {
  return inspectWhiteboxTriviewPixelsV1(
    context.getImageData(0, 0, outputWidthPixels, heightPixels).data,
    outputWidthPixels,
    heightPixels,
  ).viewInspections[panelIndex]!.isRenderable;
}

export interface BabylonTriviewProjectionV1 {
  readonly halfHeightMeters: number;
  readonly viewDirectionsWorldXYZ: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
}

export function deriveBabylonTriviewProjectionV1(options: Readonly<{
  sizeMetersXYZ: readonly [number, number, number];
  panelAspectRatio: number;
  frontDirectionWorldXZ: readonly [number, number];
}>): BabylonTriviewProjectionV1 {
  const [frontX, frontZ] = options.frontDirectionWorldXZ;
  const front = new Vector3(frontX, 0, frontZ);
  if (!Number.isFinite(options.panelAspectRatio) || options.panelAspectRatio <= 0 ||
      ![options.sizeMetersXYZ[0], options.sizeMetersXYZ[1], options.sizeMetersXYZ[2]]
        .every((value) => Number.isFinite(value) && value >= 0) ||
      Math.abs(front.lengthSquared() - 1) > 1e-9) {
    throw new Error("BABYLON_ARTIFACT_TRIVIEW_PROJECTION_INVALID");
  }
  // Runtime scenes are right-handed. Looking from the target's local right
  // keeps its semantic front pointing toward the right edge of the center panel.
  const right = Vector3.Cross(front, Vector3.UpReadOnly).normalize();
  const horizontalSpanMeters = (axis: Vector3): number =>
    Math.abs(axis.x) * options.sizeMetersXYZ[0] +
    Math.abs(axis.z) * options.sizeMetersXYZ[2];
  const maximumHorizontalSpanMeters = Math.max(
    horizontalSpanMeters(right),
    horizontalSpanMeters(front),
  );
  const halfHeightMeters = Math.max(
    options.sizeMetersXYZ[1] * 0.58,
    (maximumHorizontalSpanMeters * 0.58) / options.panelAspectRatio,
    0.5,
  );
  const stable = (value: number): number => Object.is(value, -0) ? 0 : value;
  return {
    halfHeightMeters,
    viewDirectionsWorldXYZ: [
      [stable(front.x), 0, stable(front.z)],
      [stable(right.x), 0, stable(right.z)],
      [stable(-front.x), 0, stable(-front.z)],
    ],
  };
}

export interface BabylonArtifactProjectedBoundsV1 {
  readonly centerRatioXY: readonly [number, number];
  readonly sizeRatioXY: readonly [number, number];
}

export interface BabylonArtifactCapturedPixelsV1 {
  readonly dataUrl: string;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly pixelsRgba: Uint8ClampedArray;
}

export interface BabylonArtifactCaptureResultV1 extends BabylonArtifactCapturedPixelsV1 {
  /** @internal Optional requested identity pass, never a replacement display image. */
  readonly identityMask?: BabylonArtifactCapturedPixelsV1;
  readonly projectedBoundsByEntityId: Readonly<
    Record<string, BabylonArtifactProjectedBoundsV1>
  >;
  /** @internal Measured inside the exact rendered Camera transaction. */
  readonly measurement?: unknown;
}

export interface BabylonArtifactCaptureMeasurementContextV1 {
  readonly scene: Scene;
  readonly engine: AbstractEngine;
  readonly camera: Camera;
  readonly widthPixels: number;
  readonly heightPixels: number;
}

interface BabylonArtifactMeasuredRequestV1 {
  /** @internal Trusted explicit live-handle projection; no entity/name inference. */
  readonly identityMaskColorsByMesh?: (
    scene: Scene,
  ) => ReadonlyMap<AbstractMesh, string>;
  readonly measureAfterRender?: (
    context: BabylonArtifactCaptureMeasurementContextV1,
  ) => unknown;
}

export interface BabylonArtifactCameraPoseV1 {
  readonly targetPositionMetersXYZ: readonly [number, number, number];
  readonly targetHeightMeters: number;
  readonly facingYawRadians: number;
  readonly pitchRadians: number;
  readonly distanceMeters: number;
  readonly fovDegrees: number;
}

export type BabylonArtifactCaptureRequestV1 = (
  | Readonly<{
      kind: "opening-frame";
      widthPixels: number;
      heightPixels: number;
      cameraPose?: BabylonArtifactCameraPoseV1;
      projectedEntityIds?: readonly string[];
    }>
  | Readonly<{
      kind: "composition-mask";
      widthPixels: number;
      heightPixels: number;
      backgroundColor: string;
      colorByEntityId: Readonly<Record<string, string>>;
      projectedEntityIds: readonly string[];
      cameraPose?: BabylonArtifactCameraPoseV1;
    }>
  | Readonly<{
      kind: "top-down";
      widthPixels: number;
      heightPixels: number;
      centerMetersXZ: readonly [number, number];
      sizeMetersXZ: readonly [number, number];
      maximumHeightMeters: number;
    }>
  | Readonly<{
      kind: "world-side";
      widthPixels: number;
      heightPixels: number;
      worldBoundsMeters: FormalWorldBoundsMetersV1;
      cameraPositionMetersXYZ: readonly [number, number, number];
      targetMetersXYZ: readonly [number, number, number];
    }>
  | Readonly<{
      kind: "formal-world-top-down";
      widthPixels: number;
      heightPixels: number;
      worldBoundsMeters: FormalWorldBoundsMetersV1;
      cameraPositionMetersXYZ: readonly [number, number, number];
      targetMetersXYZ: readonly [number, number, number];
    }>
  | Readonly<{
      kind: "entity-triview";
      widthPixels: number;
      heightPixels: number;
      entityIds: readonly string[];
      identityColor: string;
      frontDirectionWorldXZ: readonly [number, number];
      /** `runtime-lit-review` is the formal human-review whitebox output. */
      renderStyle?: "semantic-mask" | "runtime-lit-review";
    }>
  | Readonly<{
      kind: "explicit-collider-overlay";
      widthPixels: number;
      heightPixels: number;
      colliderMeshes: readonly AbstractMesh[];
      overlayColor: string;
    }>) & BabylonArtifactMeasuredRequestV1;

function fitOrthographicCameraToWorldBounds(
  camera: FreeCamera,
  bounds: FormalWorldBoundsMetersV1,
  aspect: number,
): void {
  const fitted = fitOrthographicBoundsToWorldExtentsV1(
    bounds,
    camera.getViewMatrix(true),
    aspect,
  );
  camera.orthoLeft = fitted.orthoLeft;
  camera.orthoRight = fitted.orthoRight;
  camera.orthoTop = fitted.orthoTop;
  camera.orthoBottom = fitted.orthoBottom;
}

function renderingCanvas(engine: AbstractEngine): HTMLCanvasElement {
  const canvas = engine.getRenderingCanvas();
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("BABYLON_ARTIFACT_CANVAS_UNAVAILABLE");
  }
  return canvas;
}

function readCanvas(canvas: HTMLCanvasElement): BabylonArtifactCapturedPixelsV1 {
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext("2d");
  if (context === null) throw new Error("BABYLON_ARTIFACT_2D_CANVAS_UNAVAILABLE");
  context.drawImage(canvas, 0, 0);
  return {
    dataUrl: output.toDataURL("image/png"),
    widthPixels: output.width,
    heightPixels: output.height,
    pixelsRgba: context.getImageData(0, 0, output.width, output.height).data,
  };
}

function readIdentityTarget(target: RenderTargetTexture): BabylonArtifactCapturedPixelsV1 {
  const { width, height } = target.getSize();
  // Babylon 9.23's synchronous readback keeps this existing capture transaction
  // synchronous and returns framebuffer rows bottom-to-top, unlike a 2D canvas.
  const bytes = target._readPixelsSync();
  if (!(bytes instanceof Uint8Array) || bytes.length !== width * height * 4) {
    throw new Error("BABYLON_ARTIFACT_IDENTITY_PIXELS_UNAVAILABLE");
  }
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (context === null) throw new Error("BABYLON_ARTIFACT_2D_CANVAS_UNAVAILABLE");
  const image = context.getImageData(0, 0, width, height);
  const rowBytes = width * 4;
  for (let y = 0; y < height; y += 1) {
    image.data.set(bytes.subarray((height - y - 1) * rowBytes, (height - y) * rowBytes), y * rowBytes);
  }
  context.putImageData(image, 0, 0);
  return { dataUrl: output.toDataURL("image/png"), widthPixels: width, heightPixels: height,
    pixelsRgba: image.data };
}

function meshesForEntity(scene: Scene, entityId: string): readonly AbstractMesh[] {
  return scene.meshes.filter(
    (mesh) => mesh.isVisible && String(mesh.metadata?.worldkitEntityId) === entityId,
  );
}

interface MaterialColorSnapshotV1 {
  readonly material: Material;
  readonly colors: Readonly<Record<string, Color3>>;
  readonly alpha: number;
}

const MATERIAL_COLOR_FIELDS = [
  "diffuseColor",
  "emissiveColor",
  "albedoColor",
  "ambientColor",
] as const;

function tintMaterial(
  material: Material,
  color: Color3,
  snapshotsByMaterial: Map<Material, MaterialColorSnapshotV1>,
): void {
  const record = material as unknown as Record<string, unknown>;
  if (!snapshotsByMaterial.has(material)) {
    const colors: Record<string, Color3> = {};
    for (const field of MATERIAL_COLOR_FIELDS) {
      const current = record[field];
      if (current instanceof Color3) colors[field] = current.clone();
    }
    snapshotsByMaterial.set(material, { material, colors, alpha: material.alpha });
  }
  for (const field of MATERIAL_COLOR_FIELDS) {
    const current = record[field];
    if (current instanceof Color3) {
      // The default framebuffer presents StandardMaterial emissive values in
      // the same normalized RGB domain used by the composition guide.
      current.copyFrom(field === "emissiveColor" ? color : Color3.Black());
    }
  }
  // Composition and identity captures are semantic masks, not beauty renders.
  // Preserve geometry occlusion while removing source-material transparency so
  // the same semantic surface cannot classify differently over sky and land.
  material.alpha = 1;
}

function restoreMaterialColors(
  snapshotsByMaterial: ReadonlyMap<Material, MaterialColorSnapshotV1>,
): void {
  for (const { material, colors, alpha } of snapshotsByMaterial.values()) {
    const record = material as unknown as Record<string, unknown>;
    for (const [field, color] of Object.entries(colors)) {
      const current = record[field];
      if (current instanceof Color3) current.copyFrom(color);
    }
    material.alpha = alpha;
  }
}

function projectedBounds(
  scene: Scene,
  camera: Camera,
  entityIds: readonly string[],
  widthPixels: number,
  heightPixels: number,
): Readonly<Record<string, BabylonArtifactProjectedBoundsV1>> {
  const viewport = camera.viewport.toGlobal(widthPixels, heightPixels);
  const transform = scene.getTransformMatrix();
  const output: Record<string, BabylonArtifactProjectedBoundsV1> = {};
  for (const entityId of entityIds) {
    const meshes = meshesForEntity(scene, entityId);
    if (meshes.length === 0) continue;
    const minimum = new Vector3(
      Math.min(...meshes.map((mesh) => mesh.getHierarchyBoundingVectors(true).min.x)),
      Math.min(...meshes.map((mesh) => mesh.getHierarchyBoundingVectors(true).min.y)),
      Math.min(...meshes.map((mesh) => mesh.getHierarchyBoundingVectors(true).min.z)),
    );
    const maximum = new Vector3(
      Math.max(...meshes.map((mesh) => mesh.getHierarchyBoundingVectors(true).max.x)),
      Math.max(...meshes.map((mesh) => mesh.getHierarchyBoundingVectors(true).max.y)),
      Math.max(...meshes.map((mesh) => mesh.getHierarchyBoundingVectors(true).max.z)),
    );
    const corners = [
      [minimum.x, minimum.y, minimum.z],
      [maximum.x, minimum.y, minimum.z],
      [minimum.x, maximum.y, minimum.z],
      [maximum.x, maximum.y, minimum.z],
      [minimum.x, minimum.y, maximum.z],
      [maximum.x, minimum.y, maximum.z],
      [minimum.x, maximum.y, maximum.z],
      [maximum.x, maximum.y, maximum.z],
    ].map(([x, y, z]) => Vector3.Project(
      new Vector3(x!, y!, z!),
      Matrix.IdentityReadOnly,
      transform,
      viewport,
    ));
    const minimumX = Math.min(...corners.map((point) => point.x)) / widthPixels;
    const maximumX = Math.max(...corners.map((point) => point.x)) / widthPixels;
    const minimumY = Math.min(...corners.map((point) => point.y)) / heightPixels;
    const maximumY = Math.max(...corners.map((point) => point.y)) / heightPixels;
    output[entityId] = {
      centerRatioXY: [(minimumX + maximumX) / 2, (minimumY + maximumY) / 2],
      sizeRatioXY: [maximumX - minimumX, maximumY - minimumY],
    };
  }
  return output;
}

function renderTriview(
  scene: Scene,
  engine: AbstractEngine,
  request: Extract<BabylonArtifactCaptureRequestV1, { kind: "entity-triview" }>,
): BabylonArtifactCaptureResultV1 {
  const targets = request.entityIds.flatMap((entityId) => meshesForEntity(scene, entityId));
  if (targets.length === 0) {
    throw new Error(
      `BABYLON_ARTIFACT_ENTITY_NOT_RENDERABLE: ${request.entityIds.join(",")}`,
    );
  }
  const targetSet = new Set(targets);
  const visibility = new Map(scene.meshes.map((mesh) => [mesh, mesh.visibility] as const));
  const activeMeshSelection = new Map(
    targets.map((mesh) => [mesh, mesh.alwaysSelectAsActiveMesh] as const),
  );
  const materialColors = new Map<Material, MaterialColorSnapshotV1>();
  const identityColor = Color3.FromHexString(request.identityColor);
  const isRuntimeLitReview = request.renderStyle === "runtime-lit-review";
  for (const mesh of scene.meshes) {
    mesh.visibility = targetSet.has(mesh) ? 1 : TRIVIEW_NON_TARGET_VISIBILITY;
    if (!isRuntimeLitReview && targetSet.has(mesh) && mesh.material !== null) {
      tintMaterial(mesh.material, identityColor, materialColors);
    }
  }
  for (const mesh of targets) {
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.computeWorldMatrix(true);
  }
  const minimum = new Vector3(
    Math.min(...targets.map((mesh) => mesh.getHierarchyBoundingVectors(true).min.x)),
    Math.min(...targets.map((mesh) => mesh.getHierarchyBoundingVectors(true).min.y)),
    Math.min(...targets.map((mesh) => mesh.getHierarchyBoundingVectors(true).min.z)),
  );
  const maximum = new Vector3(
    Math.max(...targets.map((mesh) => mesh.getHierarchyBoundingVectors(true).max.x)),
    Math.max(...targets.map((mesh) => mesh.getHierarchyBoundingVectors(true).max.y)),
    Math.max(...targets.map((mesh) => mesh.getHierarchyBoundingVectors(true).max.z)),
  );
  const center = minimum.add(maximum).scale(0.5);
  const size = maximum.subtract(minimum);
  const panelWidth = Math.max(1, Math.floor(request.widthPixels / 3));
  const output = document.createElement("canvas");
  output.width = panelWidth * 3;
  output.height = request.heightPixels;
  const context = output.getContext("2d");
  if (context === null) throw new Error("BABYLON_ARTIFACT_2D_CANVAS_UNAVAILABLE");
  const camera = new FreeCamera("worldkit.artifact.triview", Vector3.Zero(), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.01;
  const panelAspect = panelWidth / request.heightPixels;
  const distance = Math.max(size.x, size.y, size.z, 1) * 3;
  const projection = deriveBabylonTriviewProjectionV1({
    sizeMetersXYZ: [size.x, size.y, size.z],
    panelAspectRatio: panelAspect,
    frontDirectionWorldXZ: request.frontDirectionWorldXZ,
  });
  const views = projection.viewDirectionsWorldXYZ.map(
    ([x, y, z]) => new Vector3(x, y, z),
  );
  engine.setSize(panelWidth, request.heightPixels, true);
  const canvas = renderingCanvas(engine);
  scene.clearColor = Color4.FromHexString(`${WHITEBOX_TRIVIEW_BACKGROUND_COLOR_V1}FF`);
  scene.activeCamera = camera;
  try {
    for (let index = 0; index < views.length; index += 1) {
      const canonicalViewDirection = views[index]!;
      // A strict horizontal orthographic view intentionally removes depth.
      // The review-only capture keeps the same Front/Right/Back azimuth while
      // revealing a small amount of the top faces so voxel scale and volume
      // remain legible to a human reviewer.
      const viewDirection = isRuntimeLitReview
        ? new Vector3(
            canonicalViewDirection.x * Math.cos(REVIEW_TRIVIEW_ELEVATION_RADIANS_V1),
            Math.sin(REVIEW_TRIVIEW_ELEVATION_RADIANS_V1),
            canonicalViewDirection.z * Math.cos(REVIEW_TRIVIEW_ELEVATION_RADIANS_V1),
          )
        : canonicalViewDirection;
      const halfHeight = projection.halfHeightMeters;
      camera.orthoLeft = -halfHeight * panelAspect;
      camera.orthoRight = halfHeight * panelAspect;
      camera.orthoTop = halfHeight;
      camera.orthoBottom = -halfHeight;
      camera.position.copyFrom(center.add(viewDirection.scale(distance)));
      camera.upVector.copyFromFloats(0, 1, 0);
      camera.setTarget(center);
      // Rigged assets can require multiple renders to refresh skinning and
      // active-mesh state after the capture camera replaces the gameplay camera.
      // Retry the actual panel, not just the scene call, so a blank first frame
      // can never silently become a successful three-view artifact.
      for (
        let attempt = 0;
        attempt < TRIVIEW_MAXIMUM_RENDER_ATTEMPTS_PER_VIEW;
        attempt += 1
      ) {
        scene.render();
        engine.flushFramebuffer();
        context.drawImage(canvas, index * panelWidth, 0, panelWidth, request.heightPixels);
        if (panelHasRenderableForeground(
          context,
          output.width,
          request.heightPixels,
          index,
        )) break;
      }
    }
    return {
      dataUrl: output.toDataURL("image/png"),
      widthPixels: output.width,
      heightPixels: output.height,
      pixelsRgba: context.getImageData(0, 0, output.width, output.height).data,
      projectedBoundsByEntityId: {},
    };
  } finally {
    camera.dispose();
    restoreMaterialColors(materialColors);
    for (const [mesh, alwaysSelectAsActiveMesh] of activeMeshSelection) {
      mesh.alwaysSelectAsActiveMesh = alwaysSelectAsActiveMesh;
    }
    for (const [mesh, value] of visibility) mesh.visibility = value;
  }
}

export function captureBabylonArtifactViewV1(options: Readonly<{
  scene: Scene;
  engine: AbstractEngine;
  camera: Camera;
  request: BabylonArtifactCaptureRequestV1;
}>): BabylonArtifactCaptureResultV1 {
  const { scene, engine, camera, request } = options;
  const previousCamera = scene.activeCamera;
  const previousClearColor = scene.clearColor.clone();
  const previousPostProcessesEnabled = scene.postProcessesEnabled;
  const previousWidth = engine.getRenderWidth(true);
  const previousHeight = engine.getRenderHeight(true);
  const materialColors = new Map<Material, MaterialColorSnapshotV1>();
  const originalMaterialByMesh = new Map<AbstractMesh, Material | null>();
  const temporaryMaterials = new Set<Material>();
  const temporaryTextures = new Set<BaseTexture>();
  const overlayState = new Map<AbstractMesh, Readonly<{
    isVisible: boolean;
    material: Material | null;
  }>>();
  let temporaryCamera: FreeCamera | undefined;
  let primaryError: unknown;
  try {
    try {
    if (request.identityMaskColorsByMesh !== undefined &&
      request.kind !== "opening-frame" && request.kind !== "world-side" &&
      request.kind !== "formal-world-top-down") {
      throw new Error("BABYLON_ARTIFACT_IDENTITY_VIEW_INVALID");
    }
    if (request.kind === "entity-triview") {
      return renderTriview(scene, engine, request);
    }
    engine.setSize(request.widthPixels, request.heightPixels, true);
    if (
      request.kind === "world-side" ||
      request.kind === "formal-world-top-down"
    ) {
      const cameraPosition = new Vector3(...request.cameraPositionMetersXYZ);
      temporaryCamera = new FreeCamera(
        request.kind === "world-side"
          ? "worldkit.artifact.world-side"
          : "worldkit.artifact.world-top-down",
        cameraPosition.clone(),
        scene,
      );
      temporaryCamera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      temporaryCamera.minZ = 0.01;
      temporaryCamera.upVector.copyFromFloats(
        0,
        request.kind === "world-side" ? 1 : 0,
        request.kind === "world-side" ? 0 : -1,
      );
      // Babylon 9.23 TargetCamera.setTarget nudges position.z by Epsilon when
      // position.z equals target.z. Reapply the exact formal pose through the
      // installed Babylon look-at and quaternion math after it initializes the
      // TargetCamera focal distance.
      orientCameraAtExactPose(
        temporaryCamera,
        cameraPosition,
        new Vector3(...request.targetMetersXYZ),
        scene.useRightHandedSystem,
        temporaryCamera.upVector,
      );
      fitOrthographicCameraToWorldBounds(
        temporaryCamera,
        request.worldBoundsMeters,
        request.widthPixels / request.heightPixels,
      );
      scene.activeCamera = temporaryCamera;
    } else if (request.kind === "top-down") {
      const aspect = request.widthPixels / request.heightPixels;
      const worldAspect = request.sizeMetersXZ[0] / request.sizeMetersXZ[1];
      const halfWidth = worldAspect > aspect
        ? request.sizeMetersXZ[0] / 2
        : request.sizeMetersXZ[1] * aspect / 2;
      const halfHeight = worldAspect > aspect
        ? request.sizeMetersXZ[0] / aspect / 2
        : request.sizeMetersXZ[1] / 2;
      temporaryCamera = new FreeCamera(
        "worldkit.artifact.top-down",
        new Vector3(
          request.centerMetersXZ[0],
          request.maximumHeightMeters + Math.max(...request.sizeMetersXZ),
          request.centerMetersXZ[1],
        ),
        scene,
      );
      temporaryCamera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      temporaryCamera.orthoLeft = -halfWidth;
      temporaryCamera.orthoRight = halfWidth;
      temporaryCamera.orthoTop = halfHeight;
      temporaryCamera.orthoBottom = -halfHeight;
      temporaryCamera.upVector.copyFromFloats(0, 0, -1);
      temporaryCamera.setTarget(new Vector3(
        request.centerMetersXZ[0],
        0,
        request.centerMetersXZ[1],
      ));
      scene.activeCamera = temporaryCamera;
    } else if (
      (request.kind === "opening-frame" || request.kind === "composition-mask") &&
      request.cameraPose !== undefined
    ) {
      const pose = request.cameraPose;
      const focus = new Vector3(
        pose.targetPositionMetersXYZ[0],
        pose.targetPositionMetersXYZ[1] + pose.targetHeightMeters,
        pose.targetPositionMetersXYZ[2],
      );
      const cosinePitch = Math.cos(pose.pitchRadians);
      temporaryCamera = new FreeCamera(
        "worldkit.artifact.opening",
        new Vector3(
          Math.sin(pose.facingYawRadians) * cosinePitch,
          Math.sin(pose.pitchRadians),
          Math.cos(pose.facingYawRadians) * cosinePitch,
        ).scale(pose.distanceMeters).add(focus),
        scene,
      );
      temporaryCamera.fov = pose.fovDegrees * Math.PI / 180;
      temporaryCamera.minZ = 0.05;
      temporaryCamera.setTarget(focus);
      scene.activeCamera = temporaryCamera;
    } else {
      scene.activeCamera = camera;
    }
    if (request.kind === "explicit-collider-overlay") {
      const overlayColor = Color3.FromHexString(request.overlayColor);
      for (const [index, mesh] of request.colliderMeshes.entries()) {
        if (mesh.isDisposed() || mesh.getScene() !== scene) {
          throw new Error("BABYLON_ARTIFACT_COLLIDER_HANDLE_INVALID");
        }
        overlayState.set(mesh, {
          isVisible: mesh.isVisible,
          material: mesh.material,
        });
        const material = new StandardMaterial(
          `worldkit.artifact.collider-overlay.${index}`,
          scene,
        );
        material.disableLighting = true;
        material.emissiveColor.copyFrom(overlayColor);
        material.diffuseColor.copyFrom(Color3.Black());
        material.alpha = 1;
        temporaryMaterials.add(material);
        mesh.material = material;
        mesh.isVisible = true;
      }
    } else if (request.kind === "composition-mask") {
      scene.clearColor = Color4.FromHexString(`${request.backgroundColor}FF`);
      for (const mesh of scene.meshes) {
        if (!mesh.isVisible || mesh.material === null) continue;
        const entityId = String(mesh.metadata?.worldkitEntityId ?? "");
        const originalMaterial = mesh.material;
        const texturesBeforeClone = new Set(scene.textures);
        let semanticMaterial: Material | null;
        try {
          semanticMaterial = originalMaterial.clone(
            `${originalMaterial.name}.worldkit-mask.${entityId}`,
          );
        } finally {
          for (const texture of scene.textures) {
            if (!texturesBeforeClone.has(texture)) temporaryTextures.add(texture);
          }
        }
        if (semanticMaterial === null) {
          throw new Error(`BABYLON_ARTIFACT_MATERIAL_NOT_CLONEABLE: ${mesh.name}`);
        }
        originalMaterialByMesh.set(mesh, originalMaterial);
        temporaryMaterials.add(semanticMaterial);
        mesh.material = semanticMaterial;
        tintMaterial(
          semanticMaterial,
          Color3.FromHexString(request.colorByEntityId[entityId] ?? "#FFFFFF"),
          materialColors,
        );
      }
    }
    // The first pass compiles any temporary artifact material; the second is
    // the deterministic capture pass.
    scene.render();
    scene.render();
    const captured = readCanvas(renderingCanvas(engine));
    const projectedEntityIds = request.kind === "opening-frame"
      ? request.projectedEntityIds ?? []
      : request.kind === "composition-mask"
        ? request.projectedEntityIds
        : [];
    const measurement = request.measureAfterRender?.({
      scene,
      engine,
      camera: scene.activeCamera!,
      widthPixels: request.widthPixels,
      heightPixels: request.heightPixels,
    });
    let identityMask: BabylonArtifactCapturedPixelsV1 | undefined;
    if (request.identityMaskColorsByMesh !== undefined) {
      const colorsByMesh = request.identityMaskColorsByMesh(scene);
      for (const [mesh, color] of colorsByMesh) {
        if (mesh.isDisposed() || mesh.getScene() !== scene || !/^#[0-9A-F]{6}$/.test(color)) {
          throw new Error("BABYLON_ARTIFACT_IDENTITY_HANDLE_INVALID");
        }
      }
      scene.clearColor = Color4.FromHexString("#000000FF");
      scene.postProcessesEnabled = false;
      const imageProcessing = new ImageProcessingConfiguration();
      imageProcessing.isEnabled = false;
      for (const mesh of scene.meshes) {
        if (!mesh.isVisible) continue;
        const originalMaterial = mesh.material;
        if (!originalMaterialByMesh.has(mesh)) originalMaterialByMesh.set(mesh, originalMaterial);
        const material = new StandardMaterial("worldkit.artifact.identity", scene);
        temporaryMaterials.add(material);
        material.disableLighting = true;
        material.fogEnabled = false;
        material.imageProcessingConfiguration = imageProcessing;
        material.diffuseColor = Color3.Black();
        material.specularColor = Color3.Black();
        material.emissiveColor = Color3.FromHexString(colorsByMesh.get(mesh) ?? "#000000");
        if (originalMaterial !== null) {
          material.backFaceCulling = originalMaterial.backFaceCulling;
          material.sideOrientation = originalMaterial.sideOrientation;
        }
        mesh.material = material;
      }
      // The display framebuffer has MSAA: averaging adjacent identities can
      // invent a third *valid* identity color. Render the same camera into an
      // exact single-sample byte target, without changing the display context.
      const identityCamera = scene.activeCamera!;
      const previousOutputTarget = identityCamera.outputRenderTarget;
      const identityTarget = new RenderTargetTexture("worldkit.artifact.identity-pixels",
        { width: request.widthPixels, height: request.heightPixels }, scene, {
          generateMipMaps: false, doNotChangeAspectRatio: true,
          type: Constants.TEXTURETYPE_UNSIGNED_BYTE, format: Constants.TEXTUREFORMAT_RGBA,
          samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE, samples: 1,
          generateDepthBuffer: true, generateStencilBuffer: true, useSRGBBuffer: false,
        });
      temporaryTextures.add(identityTarget);
      try {
        identityCamera.outputRenderTarget = identityTarget;
        // Babylon 9.23 skips camera input and animation advances here.
        scene.render(false, true);
        scene.render(false, true);
        identityMask = readIdentityTarget(identityTarget);
      } finally {
        identityCamera.outputRenderTarget = previousOutputTarget;
      }
    }
    return {
      ...captured,
      ...(identityMask === undefined ? {} : { identityMask }),
      projectedBoundsByEntityId: projectedBounds(
        scene,
        scene.activeCamera!,
        projectedEntityIds,
        request.widthPixels,
        request.heightPixels,
      ),
      ...(measurement === undefined ? {} : { measurement }),
    };
    } catch (error) {
      primaryError = error;
      throw error;
    }
  } finally {
    const cleanupErrors: unknown[] = [];
    const cleanup = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        cleanupErrors.push(error);
      }
    };
    cleanup(() => temporaryCamera?.dispose());
    for (const [mesh, state] of overlayState) cleanup(() => {
      mesh.material = state.material;
      mesh.isVisible = state.isVisible;
    });
    for (const [mesh, material] of originalMaterialByMesh) {
      cleanup(() => { mesh.material = material; });
    }
    cleanup(() => restoreMaterialColors(materialColors));
    for (const material of temporaryMaterials) cleanup(() => material.dispose());
    for (const texture of temporaryTextures) cleanup(() => texture.dispose());
    cleanup(() => { scene.activeCamera = previousCamera; });
    cleanup(() => { scene.clearColor = previousClearColor; });
    cleanup(() => { scene.postProcessesEnabled = previousPostProcessesEnabled; });
    cleanup(() => engine.setSize(previousWidth, previousHeight, true));
    if (previousCamera !== null) cleanup(() => scene.render());
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        primaryError === undefined
          ? cleanupErrors
          : [primaryError, ...cleanupErrors],
        "BABYLON_ARTIFACT_CAPTURE_CLEANUP_FAILED",
      );
    }
  }
}
