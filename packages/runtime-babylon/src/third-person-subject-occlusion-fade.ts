import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";

const OCCLUSION_OPACITY_ATTRIBUTE = "worldkitOcclusionOpacity";
const OCCLUSION_SELECTION_INTERVAL_SECONDS = 1 / 15;
const OCCLUSION_STRONG_OPACITY_RATIO = 0.3;
const OCCLUSION_LIGHT_OPACITY_RATIO = 0.5;
const OCCLUSION_FADE_IN_SECONDS = 0.15;
const OCCLUSION_FADE_OUT_SECONDS = 0.25;
const OCCLUSION_HORIZONTAL_MARGIN_METERS = 0.45;
const OCCLUSION_VERTICAL_MARGIN_METERS = 0.55;
const OCCLUSION_SAMPLE_RATIOS = Object.freeze([-1, 0, 1]);
const OPACITY_EPSILON = 1e-4;

export interface BlockWorldOcclusionTransformV1 {
  readonly positionMetersXYZ: readonly [number, number, number];
  readonly scaleXYZ: readonly [number, number, number];
}

export interface SubjectOcclusionInstanceBoundsV1 {
  readonly centerMetersXYZ: readonly [number, number, number];
  readonly halfExtentsMetersXYZ: readonly [number, number, number];
}

export interface SubjectOcclusionBatchBoundsV1 {
  readonly id: string;
  readonly instances: readonly SubjectOcclusionInstanceBoundsV1[];
}

export interface SubjectOcclusionSelectionInputV1 {
  readonly cameraPositionMetersXYZ: readonly [number, number, number];
  readonly subjectOriginPositionMetersXYZ: readonly [number, number, number];
  readonly colliderCenterOffsetMetersXYZ: readonly [number, number, number];
  readonly colliderHeightMeters: number;
  readonly colliderRadiusMeters: number;
  readonly batches: readonly SubjectOcclusionBatchBoundsV1[];
}

interface RegisteredBlockWorldOcclusionBatchV1 {
  readonly mesh: Mesh;
  readonly id: string;
  readonly semanticClassId: string;
  readonly instances: readonly SubjectOcclusionInstanceBoundsV1[];
  readonly minimumMetersXYZ: readonly [number, number, number];
  readonly maximumMetersXYZ: readonly [number, number, number];
}

interface ActiveBlockWorldOcclusionBatchV1 {
  readonly registration: RegisteredBlockWorldOcclusionBatchV1;
  readonly originalMaterial: StandardMaterial;
  readonly opacityRatios: Float32Array;
  readonly activeInstanceIndices: Set<number>;
}

export interface ThirdPersonSubjectOcclusionFadeInstanceSnapshotV1 {
  readonly batchId: string;
  readonly instanceIndex: number;
  readonly opacityRatio: number;
  readonly targetOpacityRatio: number;
}

export interface ThirdPersonSubjectOcclusionFadeSnapshotV1 {
  readonly enabled: boolean;
  readonly selectedInstanceCount: number;
  readonly fadedInstanceCount: number;
  readonly instances: readonly ThirdPersonSubjectOcclusionFadeInstanceSnapshotV1[];
}

const registrationByMesh = new WeakMap<
  Mesh,
  RegisteredBlockWorldOcclusionBatchV1
>();

function finiteVector3Tuple(
  value: readonly [number, number, number],
): boolean {
  return value.every(Number.isFinite);
}

function isOccludableBlockSemanticClassId(semanticClassId: string): boolean {
  return semanticClassId === "block.obstacle" ||
    semanticClassId.startsWith("block.obstacle.") ||
    semanticClassId === "block.interactive-solid" ||
    semanticClassId.startsWith("block.interactive-solid.") ||
    semanticClassId === "block.visual-only" ||
    semanticClassId.startsWith("block.visual-only.") ||
    semanticClassId.startsWith("block.landmark-");
}

function instanceKey(batchId: string, instanceIndex: number): string {
  return `${batchId}:${instanceIndex}`;
}

function segmentIntersectsAxisAlignedBox(
  start: Vector3,
  end: Vector3,
  minimum: readonly [number, number, number],
  maximum: readonly [number, number, number],
): boolean {
  const direction = end.subtract(start);
  let minimumT = 0;
  let maximumT = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const startValue = axis === 0 ? start.x : axis === 1 ? start.y : start.z;
    const directionValue = axis === 0
      ? direction.x
      : axis === 1
      ? direction.y
      : direction.z;
    const minimumValue = minimum[axis]!;
    const maximumValue = maximum[axis]!;
    if (Math.abs(directionValue) <= 1e-9) {
      if (startValue < minimumValue || startValue > maximumValue) return false;
      continue;
    }
    let firstT = (minimumValue - startValue) / directionValue;
    let secondT = (maximumValue - startValue) / directionValue;
    if (firstT > secondT) [firstT, secondT] = [secondT, firstT];
    minimumT = Math.max(minimumT, firstT);
    maximumT = Math.min(maximumT, secondT);
    if (minimumT > maximumT) return false;
  }
  return maximumT >= 0 && minimumT <= 1;
}

function subjectOcclusionSamplePositions(
  input: Pick<
    SubjectOcclusionSelectionInputV1,
    | "cameraPositionMetersXYZ"
    | "subjectOriginPositionMetersXYZ"
    | "colliderCenterOffsetMetersXYZ"
    | "colliderHeightMeters"
    | "colliderRadiusMeters"
  >,
): readonly Vector3[] {
  const center = new Vector3(
    input.subjectOriginPositionMetersXYZ[0] +
      input.colliderCenterOffsetMetersXYZ[0],
    input.subjectOriginPositionMetersXYZ[1] +
      input.colliderCenterOffsetMetersXYZ[1],
    input.subjectOriginPositionMetersXYZ[2] +
      input.colliderCenterOffsetMetersXYZ[2],
  );
  const camera = new Vector3(...input.cameraPositionMetersXYZ);
  const cameraToSubject = center.subtract(camera);
  const horizontalDirection = new Vector3(
    cameraToSubject.x,
    0,
    cameraToSubject.z,
  );
  const right = horizontalDirection.lengthSquared() > 1e-8
    ? Vector3.Cross(horizontalDirection.normalize(), Vector3.Up()).normalize()
    : Vector3.Right();
  const verticalExtent = input.colliderHeightMeters / 2 +
    OCCLUSION_VERTICAL_MARGIN_METERS;
  const horizontalExtent = input.colliderRadiusMeters +
    OCCLUSION_HORIZONTAL_MARGIN_METERS;
  const samples: Vector3[] = [];
  for (const verticalRatio of OCCLUSION_SAMPLE_RATIOS) {
    for (const horizontalRatio of OCCLUSION_SAMPLE_RATIOS) {
      samples.push(
        center
          .add(right.scale(horizontalExtent * horizontalRatio))
          .add(new Vector3(0, verticalExtent * verticalRatio, 0)),
      );
    }
  }
  return Object.freeze(samples);
}

function assertSelectionInput(input: SubjectOcclusionSelectionInputV1): void {
  if (
    !finiteVector3Tuple(input.cameraPositionMetersXYZ) ||
    !finiteVector3Tuple(input.subjectOriginPositionMetersXYZ) ||
    !finiteVector3Tuple(input.colliderCenterOffsetMetersXYZ) ||
    !Number.isFinite(input.colliderHeightMeters) ||
    input.colliderHeightMeters <= 0 ||
    !Number.isFinite(input.colliderRadiusMeters) ||
    input.colliderRadiusMeters <= 0 ||
    input.colliderHeightMeters < input.colliderRadiusMeters * 2
  ) throw new RangeError("WORLDKIT_SUBJECT_OCCLUSION_INPUT_INVALID");
}

export function selectSubjectOccludingBlockInstancesV1(
  input: SubjectOcclusionSelectionInputV1,
): ReadonlyMap<string, number> {
  assertSelectionInput(input);
  const camera = new Vector3(...input.cameraPositionMetersXYZ);
  const samplePositions = subjectOcclusionSamplePositions(input);
  const hitCountsByInstanceKey = new Map<string, number>();
  for (const batch of input.batches) {
    for (const [instanceIndex, instance] of batch.instances.entries()) {
      const minimum = instance.centerMetersXYZ.map((value, axis) =>
        value - instance.halfExtentsMetersXYZ[axis]!) as [number, number, number];
      const maximum = instance.centerMetersXYZ.map((value, axis) =>
        value + instance.halfExtentsMetersXYZ[axis]!) as [number, number, number];
      let hitCount = 0;
      for (const sample of samplePositions) {
        if (segmentIntersectsAxisAlignedBox(camera, sample, minimum, maximum)) {
          hitCount += 1;
        }
      }
      if (hitCount > 0) {
        hitCountsByInstanceKey.set(
          instanceKey(batch.id, instanceIndex),
          hitCount / samplePositions.length,
        );
      }
    }
  }
  return hitCountsByInstanceKey;
}

export function registerBlockWorldOcclusionBatchV1(
  mesh: Mesh,
  semanticClassId: string,
  transforms: readonly BlockWorldOcclusionTransformV1[],
): void {
  if (!isOccludableBlockSemanticClassId(semanticClassId)) return;
  if (transforms.length === 0) {
    throw new RangeError("WORLDKIT_SUBJECT_OCCLUSION_BATCH_EMPTY");
  }
  const instances = transforms.map((transform) => {
    if (
      !finiteVector3Tuple(transform.positionMetersXYZ) ||
      !finiteVector3Tuple(transform.scaleXYZ) ||
      transform.scaleXYZ.some((value) => value <= 0)
    ) throw new RangeError("WORLDKIT_SUBJECT_OCCLUSION_BATCH_INVALID");
    return Object.freeze({
      centerMetersXYZ: Object.freeze([...transform.positionMetersXYZ]) as
        readonly [number, number, number],
      halfExtentsMetersXYZ: Object.freeze(
        transform.scaleXYZ.map((value) => value / 2),
      ) as readonly [number, number, number],
    });
  });
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const instance of instances) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(
        minimum[axis]!,
        instance.centerMetersXYZ[axis]! - instance.halfExtentsMetersXYZ[axis]!,
      );
      maximum[axis] = Math.max(
        maximum[axis]!,
        instance.centerMetersXYZ[axis]! + instance.halfExtentsMetersXYZ[axis]!,
      );
    }
  }
  registrationByMesh.set(mesh, Object.freeze({
    mesh,
    id: String(mesh.metadata?.worldkitEntityId ?? mesh.name),
    semanticClassId,
    instances: Object.freeze(instances),
    minimumMetersXYZ: Object.freeze(minimum) as readonly [number, number, number],
    maximumMetersXYZ: Object.freeze(maximum) as readonly [number, number, number],
  }));
}

function glslCustomCode(shaderType: string) {
  if (shaderType === "vertex") {
    return {
      CUSTOM_VERTEX_DEFINITIONS: `
        attribute float ${OCCLUSION_OPACITY_ATTRIBUTE};
        varying float vWorldkitOcclusionOpacity;
      `,
      CUSTOM_VERTEX_MAIN_END: `
        vWorldkitOcclusionOpacity = ${OCCLUSION_OPACITY_ATTRIBUTE};
      `,
    };
  }
  if (shaderType !== "fragment") return null;
  return {
    CUSTOM_FRAGMENT_DEFINITIONS: `
      varying float vWorldkitOcclusionOpacity;
      float worldkitOcclusionDither(vec2 fragmentPosition) {
        return fract(52.9829189 * fract(dot(
          floor(fragmentPosition),
          vec2(0.06711056, 0.00583715)
        )));
      }
    `,
    CUSTOM_FRAGMENT_MAIN_BEGIN: `
      if (vWorldkitOcclusionOpacity < 0.999 &&
          vWorldkitOcclusionOpacity < worldkitOcclusionDither(gl_FragCoord.xy)) {
        discard;
      }
    `,
  };
}

function wgslCustomCode(shaderType: string) {
  if (shaderType === "vertex") {
    return {
      CUSTOM_VERTEX_DEFINITIONS: `
        attribute ${OCCLUSION_OPACITY_ATTRIBUTE}: f32;
        varying vWorldkitOcclusionOpacity: f32;
      `,
      CUSTOM_VERTEX_MAIN_END: `
        vertexOutputs.vWorldkitOcclusionOpacity = input.${OCCLUSION_OPACITY_ATTRIBUTE};
      `,
    };
  }
  if (shaderType !== "fragment") return null;
  return {
    CUSTOM_FRAGMENT_DEFINITIONS: `
      varying vWorldkitOcclusionOpacity: f32;
      fn worldkitOcclusionDither(fragmentPosition: vec2f) -> f32 {
        return fract(52.9829189 * fract(dot(
          floor(fragmentPosition),
          vec2f(0.06711056, 0.00583715)
        )));
      }
    `,
    CUSTOM_FRAGMENT_MAIN_BEGIN: `
      if (fragmentInputs.vWorldkitOcclusionOpacity < 0.999 &&
          fragmentInputs.vWorldkitOcclusionOpacity <
            worldkitOcclusionDither(fragmentInputs.position.xy)) {
        discard;
      }
    `,
  };
}

class SubjectOcclusionFadeMaterialPluginV1 extends MaterialPluginBase {
  constructor(material: StandardMaterial) {
    super(material, "WorldkitThirdPersonSubjectOcclusionFade", 210);
    this._enable(true);
  }

  override getClassName(): string {
    return "SubjectOcclusionFadeMaterialPluginV1";
  }

  override getAttributes(attributes: string[]): void {
    attributes.push(OCCLUSION_OPACITY_ATTRIBUTE);
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage = ShaderLanguage.GLSL,
  ) {
    return shaderLanguage === ShaderLanguage.WGSL
      ? wgslCustomCode(shaderType)
      : glslCustomCode(shaderType);
  }
}

function moveTowards(current: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function batchIntersectsAnySubjectRay(
  camera: Vector3,
  samples: readonly Vector3[],
  batch: RegisteredBlockWorldOcclusionBatchV1,
): boolean {
  return samples.some((sample) => segmentIntersectsAxisAlignedBox(
    camera,
    sample,
    batch.minimumMetersXYZ,
    batch.maximumMetersXYZ,
  ));
}

export class ThirdPersonSubjectOcclusionFadeV1 {
  readonly #batches: readonly ActiveBlockWorldOcclusionBatchV1[];
  readonly #pluginAndMaterialByOriginalMaterial = new Map<
    StandardMaterial,
    Readonly<{
      material: StandardMaterial;
      plugin: SubjectOcclusionFadeMaterialPluginV1;
    }>
  >();
  #enabled = true;
  #hasSelectedOnce = false;
  #selectionElapsedSeconds = Number.POSITIVE_INFINITY;
  #selectedOpacityByInstanceKey = new Map<string, number>();
  #disposed = false;

  constructor(meshes: Iterable<AbstractMesh>) {
    const registrations = [...meshes]
      .filter((mesh): mesh is Mesh => mesh instanceof Mesh)
      .map((mesh) => registrationByMesh.get(mesh))
      .filter((batch): batch is RegisteredBlockWorldOcclusionBatchV1 =>
        batch !== undefined)
      .sort((left, right) => left.id.localeCompare(right.id));
    const seenIds = new Set<string>();
    const activeBatches: ActiveBlockWorldOcclusionBatchV1[] = [];
    try {
      for (const registration of registrations) {
        if (seenIds.has(registration.id)) {
          throw new Error("WORLDKIT_SUBJECT_OCCLUSION_BATCH_ID_DUPLICATE");
        }
        seenIds.add(registration.id);
        const originalMaterial = registration.mesh.material;
        if (!(originalMaterial instanceof StandardMaterial)) {
          throw new Error("WORLDKIT_SUBJECT_OCCLUSION_MATERIAL_REQUIRED");
        }
        let owned = this.#pluginAndMaterialByOriginalMaterial.get(originalMaterial);
        if (owned === undefined) {
          const material = originalMaterial.clone(
            `${originalMaterial.name}.subject-occlusion-fade`,
          );
          const plugin = new SubjectOcclusionFadeMaterialPluginV1(material);
          owned = Object.freeze({ material, plugin });
          this.#pluginAndMaterialByOriginalMaterial.set(originalMaterial, owned);
        }
        registration.mesh.material = owned.material;
        const opacityRatios = new Float32Array(registration.instances.length);
        opacityRatios.fill(1);
        registration.mesh.thinInstanceSetBuffer(
          OCCLUSION_OPACITY_ATTRIBUTE,
          opacityRatios,
          1,
          false,
        );
        activeBatches.push({
          registration,
          originalMaterial,
          opacityRatios,
          activeInstanceIndices: new Set(),
        });
      }
    } catch (error) {
      for (const batch of activeBatches) {
        batch.registration.mesh.material = batch.originalMaterial;
        batch.registration.mesh.thinInstanceSetBuffer(
          OCCLUSION_OPACITY_ATTRIBUTE,
          null,
        );
      }
      for (const owned of this.#pluginAndMaterialByOriginalMaterial.values()) {
        owned.plugin.dispose();
        owned.material.dispose();
      }
      this.#pluginAndMaterialByOriginalMaterial.clear();
      throw error;
    }
    this.#batches = Object.freeze(activeBatches);
  }

  update(input: Readonly<{
    cameraPosition: Vector3;
    subjectOriginPositionMetersXYZ: readonly [number, number, number];
    colliderCenterOffsetMetersXYZ: readonly [number, number, number];
    colliderHeightMeters: number;
    colliderRadiusMeters: number;
    deltaSeconds: number;
  }>): void {
    if (this.#disposed) throw new Error("WORLDKIT_SUBJECT_OCCLUSION_DISPOSED");
    const selectionInput: SubjectOcclusionSelectionInputV1 = {
      cameraPositionMetersXYZ: [
        input.cameraPosition.x,
        input.cameraPosition.y,
        input.cameraPosition.z,
      ],
      subjectOriginPositionMetersXYZ: input.subjectOriginPositionMetersXYZ,
      colliderCenterOffsetMetersXYZ: input.colliderCenterOffsetMetersXYZ,
      colliderHeightMeters: input.colliderHeightMeters,
      colliderRadiusMeters: input.colliderRadiusMeters,
      batches: this.#batches.map(({ registration }) => registration),
    };
    assertSelectionInput(selectionInput);
    if (!Number.isFinite(input.deltaSeconds) || input.deltaSeconds < 0) {
      throw new RangeError("WORLDKIT_SUBJECT_OCCLUSION_DELTA_INVALID");
    }
    if (!this.#enabled) return;
    this.#selectionElapsedSeconds += input.deltaSeconds;
    if (
      !this.#hasSelectedOnce ||
      this.#selectionElapsedSeconds >= OCCLUSION_SELECTION_INTERVAL_SECONDS
    ) {
      const camera = input.cameraPosition;
      const samples = subjectOcclusionSamplePositions(selectionInput);
      const candidateBatches = this.#batches.filter(({ registration }) =>
        batchIntersectsAnySubjectRay(camera, samples, registration));
      const coverageByInstanceKey = selectSubjectOccludingBlockInstancesV1({
        ...selectionInput,
        batches: candidateBatches.map(({ registration }) => registration),
      });
      this.#selectedOpacityByInstanceKey = new Map(
        [...coverageByInstanceKey].map(([key, coverage]) => [
          key,
          coverage >= 0.3
            ? OCCLUSION_STRONG_OPACITY_RATIO
            : OCCLUSION_LIGHT_OPACITY_RATIO,
        ]),
      );
      for (const batch of this.#batches) {
        for (let index = 0; index < batch.registration.instances.length; index += 1) {
          if (this.#selectedOpacityByInstanceKey.has(
            instanceKey(batch.registration.id, index),
          )) batch.activeInstanceIndices.add(index);
        }
      }
      this.#hasSelectedOnce = true;
      this.#selectionElapsedSeconds = 0;
    }

    for (const batch of this.#batches) {
      let changed = false;
      for (const index of [...batch.activeInstanceIndices]) {
        const key = instanceKey(batch.registration.id, index);
        const target = this.#selectedOpacityByInstanceKey.get(key) ?? 1;
        const current = batch.opacityRatios[index]!;
        const transitionSeconds = target < current
          ? OCCLUSION_FADE_IN_SECONDS
          : OCCLUSION_FADE_OUT_SECONDS;
        const next = moveTowards(
          current,
          target,
          input.deltaSeconds / transitionSeconds,
        );
        if (next !== current) {
          batch.opacityRatios[index] = next;
          changed = true;
        }
        if (target === 1 && Math.abs(next - 1) <= OPACITY_EPSILON) {
          batch.activeInstanceIndices.delete(index);
        }
      }
      if (changed) {
        batch.registration.mesh.thinInstanceBufferUpdated(
          OCCLUSION_OPACITY_ATTRIBUTE,
        );
      }
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.#disposed) return;
    this.#enabled = enabled;
    this.#hasSelectedOnce = false;
    this.#selectionElapsedSeconds = Number.POSITIVE_INFINITY;
    this.#selectedOpacityByInstanceKey.clear();
    if (enabled) return;
    for (const batch of this.#batches) {
      if (batch.activeInstanceIndices.size === 0) continue;
      batch.opacityRatios.fill(1);
      batch.activeInstanceIndices.clear();
      batch.registration.mesh.thinInstanceBufferUpdated(
        OCCLUSION_OPACITY_ATTRIBUTE,
      );
    }
  }

  snapshot(): ThirdPersonSubjectOcclusionFadeSnapshotV1 {
    const instances: ThirdPersonSubjectOcclusionFadeInstanceSnapshotV1[] = [];
    let fadedInstanceCount = 0;
    for (const batch of this.#batches) {
      for (const index of batch.activeInstanceIndices) {
        const opacityRatio = batch.opacityRatios[index]!;
        if (opacityRatio < 1 - OPACITY_EPSILON) fadedInstanceCount += 1;
        instances.push(Object.freeze({
          batchId: batch.registration.id,
          instanceIndex: index,
          opacityRatio,
          targetOpacityRatio: this.#selectedOpacityByInstanceKey.get(
            instanceKey(batch.registration.id, index),
          ) ?? 1,
        }));
      }
    }
    instances.sort((left, right) =>
      left.batchId.localeCompare(right.batchId) ||
      left.instanceIndex - right.instanceIndex);
    return Object.freeze({
      enabled: this.#enabled,
      selectedInstanceCount: this.#selectedOpacityByInstanceKey.size,
      fadedInstanceCount,
      instances: Object.freeze(instances),
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.setEnabled(false);
    this.#disposed = true;
    for (const batch of this.#batches) {
      if (!batch.registration.mesh.isDisposed()) {
        batch.registration.mesh.material = batch.originalMaterial;
        batch.registration.mesh.thinInstanceSetBuffer(
          OCCLUSION_OPACITY_ATTRIBUTE,
          null,
        );
      }
    }
    for (const owned of this.#pluginAndMaterialByOriginalMaterial.values()) {
      owned.plugin.dispose();
      owned.material.dispose();
    }
    this.#pluginAndMaterialByOriginalMaterial.clear();
  }
}
