import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";

import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { isEqual } from "lodash-es";
import type { SubjectResourceRegistryV3 } from "@whitebox-world/subject-registry";
import type { RuntimeSubjectVisualPartV1, WorldRuntimeBootstrapV1 } from "@whitebox-world/runtime-contracts";
import { compileNativeSubjectProjectionV1 } from "./native-subject-host-closure.js";

function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function subjectVisualPartBoundsV1(
  part: RuntimeSubjectVisualPartV1,
  registry: SubjectResourceRegistryV3,
): Readonly<{
  minimumMetersXYZ: NativeBlockSubjectVisualReviewVec3V1;
  maximumMetersXYZ: NativeBlockSubjectVisualReviewVec3V1;
  scaleXYZ: NativeBlockSubjectVisualReviewVec3V1;
}> {
  if (part.kind === "asset") {
    const assetManifest = registry.resolveSubjectAsset(
      part.subjectAssetRef,
    );
    if (assetManifest === undefined) {
      throw new TypeError(
        `NATIVE_BLOCK_SUBJECT_VISUAL_REVIEW_PROXY_INVALID: unresolved Subject Asset '${part.subjectAssetRef}'.`,
      );
    }
    return Object.freeze({
      minimumMetersXYZ: assetManifest.bounds.minimumMetersXYZ,
      maximumMetersXYZ: assetManifest.bounds.maximumMetersXYZ,
      scaleXYZ: part.localTransform.scaleXYZ,
    });
  }
  const shape = part.shape;
  const sizeMetersXYZ: NativeBlockSubjectVisualReviewVec3V1 =
    shape.kind === "box"
      ? shape.sizeMetersXYZ
      : shape.kind === "sphere"
        ? [
            shape.radiusMeters * 2,
            shape.radiusMeters * 2,
            shape.radiusMeters * 2,
          ]
        : [
            shape.radiusMeters * 2,
            shape.heightMeters,
            shape.radiusMeters * 2,
          ];
  return Object.freeze({
    minimumMetersXYZ: Object.freeze(sizeMetersXYZ.map((value) =>
      -value / 2)) as NativeBlockSubjectVisualReviewVec3V1,
    maximumMetersXYZ: Object.freeze(sizeMetersXYZ.map((value) =>
      value / 2)) as NativeBlockSubjectVisualReviewVec3V1,
    scaleXYZ: Object.freeze([1, 1, 1]) as NativeBlockSubjectVisualReviewVec3V1,
  });
}

function transformedSubjectVisualPartBoundsV1(
  part: RuntimeSubjectVisualPartV1,
  registry: SubjectResourceRegistryV3,
  isRegisteredSubject: boolean,
): NativeBlockSubjectVisualReviewProxyCuboidV1 {
  const bounds = subjectVisualPartBoundsV1(part, registry);
  const transform = Matrix.Compose(
    new Vector3(...bounds.scaleXYZ),
    Quaternion.FromEulerAngles(...part.localTransform.rotationEulerRadiansXYZ),
    new Vector3(...part.localTransform.positionMetersXYZ),
  );
  const transformedCorners: Vector3[] = [];
  const sourceCenter = Vector3.Center(new Vector3(...bounds.minimumMetersXYZ), new Vector3(...bounds.maximumMetersXYZ));
  const registeredCenter = sourceCenter.multiply(new Vector3(...bounds.scaleXYZ))
    .add(new Vector3(...part.localTransform.positionMetersXYZ));
  // Pinned old visualProxy is an advisory approximation: rotate the centered
  // extents in XYZ order, but only scale/translate the source bounds' center.
  // Do not turn this into the actual Runtime visual-part transform (YXZ).
  const [rotationX, rotationY, rotationZ] = part.localTransform.rotationEulerRadiansXYZ;
  const registeredRotations = isRegisteredSubject ? [
    Quaternion.RotationAxis(Vector3.Right(), rotationX),
    Quaternion.RotationAxis(Vector3.Up(), rotationY),
    Quaternion.RotationAxis(new Vector3(0, 0, 1), rotationZ),
  ] : [];
  for (const x of [bounds.minimumMetersXYZ[0], bounds.maximumMetersXYZ[0]]) {
    for (const y of [bounds.minimumMetersXYZ[1], bounds.maximumMetersXYZ[1]]) {
      for (const z of [bounds.minimumMetersXYZ[2], bounds.maximumMetersXYZ[2]]) {
        if (isRegisteredSubject) {
          const offset = new Vector3(x, y, z).subtract(sourceCenter).multiply(new Vector3(...bounds.scaleXYZ));
          for (const rotation of registeredRotations) offset.applyRotationQuaternionInPlace(rotation);
          transformedCorners.push(offset.add(registeredCenter));
        } else {
          transformedCorners.push(Vector3.TransformCoordinates(new Vector3(x, y, z), transform));
        }
      }
    }
  }
  const finiteCoordinate = (value: number): number => {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "NATIVE_BLOCK_SUBJECT_VISUAL_REVIEW_PROXY_INVALID: transformed Subject bounds are not finite.",
      );
    }
    return Object.is(value, -0) ? 0 : value;
  };
  return Object.freeze({
    id: part.id,
    minimumMetersXYZ: Object.freeze([
      finiteCoordinate(Math.min(...transformedCorners.map(({ x }) => x))),
      finiteCoordinate(Math.min(...transformedCorners.map(({ y }) => y))),
      finiteCoordinate(Math.min(...transformedCorners.map(({ z }) => z))),
    ]) as NativeBlockSubjectVisualReviewVec3V1,
    maximumMetersXYZ: Object.freeze([
      finiteCoordinate(Math.max(...transformedCorners.map(({ x }) => x))),
      finiteCoordinate(Math.max(...transformedCorners.map(({ y }) => y))),
      finiteCoordinate(Math.max(...transformedCorners.map(({ z }) => z))),
    ]) as NativeBlockSubjectVisualReviewVec3V1,
  });
}

export function deriveNativeBlockSubjectVisualReviewProxyV1(input: Readonly<{
  worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  worldRuntimeBootstrapRef: string;
  worldRuntimeBootstrapBytesHash: Sha256HashV1;
}>, registry: SubjectResourceRegistryV3): NativeBlockSubjectVisualReviewProxyV1 {
  const runtime = input.worldRuntimeBootstrap;
  const subjects = runtime.subjectRuntimeDescriptors.filter(({ entityId }) =>
    entityId === runtime.initialControlledEntityId
  );
  if (subjects.length !== 1 || subjects[0]!.visualParts.length === 0) {
    throw new TypeError(
      "NATIVE_BLOCK_SUBJECT_VISUAL_REVIEW_PROXY_INVALID: controlled Subject visual descriptor is missing.",
    );
  }
  const subject = subjects[0]!;
  const definitionLocks = runtime.runtimeResourceLockEntries.filter((entry) =>
    entry.resourceKind === "subject-definition" &&
    entry.resourceRef === subject.subjectDefinitionRef
  );
  const isPackageDefinition = /^package:\/\/subject-definition\/[a-z0-9][a-z0-9.-]*@[1-9][0-9]*$/.test(subject.subjectDefinitionRef);
  let definitionMatches = false;
  if (definitionLocks.length === 1 && isPackageDefinition) {
    // Package Definitions are normalized and compiled by the Host, not global
    // Registry entries. Their lock binds the normalized Definition hash; the
    // parsed WRT and frozen Request bind the exact compiled visual descriptor.
    definitionMatches = definitionLocks[0]!.contentHash === subject.subjectDefinitionHash;
  } else if (definitionLocks.length === 1) {
    const registered = compileNativeSubjectProjectionV1({
      controlledEntityId: subject.entityId,
      subject: { source: "registry", subjectDefinitionRef: subject.subjectDefinitionRef },
    }, registry);
    if (registered.ok) {
      const expectedLock = registered.resources.resourceLock.find((entry) =>
        entry.resourceKind === "subject-definition" && entry.resourceRef === subject.subjectDefinitionRef);
      const expectedSubject = registered.projection.subjects[0]!;
      definitionMatches = expectedLock?.contentHash === definitionLocks[0]!.contentHash &&
        isEqual(expectedSubject.visualParts, subject.visualParts);
    }
  }
  if (!definitionMatches) {
    throw new TypeError(
      "NATIVE_BLOCK_SUBJECT_VISUAL_REVIEW_PROXY_INVALID: Subject definition Registry closure failed.",
    );
  }
  for (const part of subject.visualParts) {
    if (part.kind !== "asset") continue;
    const assetManifest = registry.resolveSubjectAsset(
      part.subjectAssetRef,
    );
    const runtimeAssets = runtime.subjectAssets.filter(({ subjectAssetRef }) =>
      subjectAssetRef === part.subjectAssetRef
    );
    const assetLocks = runtime.runtimeResourceLockEntries.filter((entry) =>
      entry.resourceKind === "subject-asset" &&
      entry.resourceRef === part.subjectAssetRef
    );
    const runtimeAsset = runtimeAssets[0];
    if (
      assetManifest === undefined ||
      runtimeAssets.length !== 1 ||
      runtimeAsset === undefined ||
      assetLocks.length !== 1 ||
      assetLocks[0]!.contentHash !== assetManifest.contentHash ||
      runtimeAsset.artifactContentHash !== assetManifest.artifact.contentHash ||
      runtimeAsset.byteLength !== assetManifest.artifact.byteLength ||
      runtimeAsset.mediaType !== assetManifest.artifact.mediaType ||
      runtimeAsset.format !== assetManifest.format ||
      runtimeAsset.inventory.meshCount !== assetManifest.inventory.meshCount ||
      runtimeAsset.inventory.vertexCount !== assetManifest.inventory.vertexCount ||
      runtimeAsset.inventory.triangleCount !== assetManifest.inventory.triangleCount ||
      runtimeAsset.inventory.skeletonCount !== assetManifest.inventory.skeletonCount ||
      runtimeAsset.inventory.boneCount !== assetManifest.inventory.boneCount ||
      !isEqual(
        runtimeAsset.inventory.animationClipNames,
        assetManifest.inventory.animationClipNames,
      )
    ) {
      throw new TypeError(
        `NATIVE_BLOCK_SUBJECT_VISUAL_REVIEW_PROXY_INVALID: Subject Asset Registry closure failed for '${part.subjectAssetRef}'.`,
      );
    }
  }
  const cuboids = subject.visualParts
    .map((part) => transformedSubjectVisualPartBoundsV1(part, registry, !isPackageDefinition))
    .sort((left, right) => codePointCompare(left.id, right.id));
  return createNativeBlockSubjectVisualReviewProxyV1({
    initialControlledEntityId: runtime.initialControlledEntityId,
    subjectDefinitionRef: subject.subjectDefinitionRef,
    subjectDefinitionHash: subject.subjectDefinitionHash,
    subjectRuntimeDescriptorHash:
      sha256CanonicalJson(subject) as Sha256HashV1,
    worldRuntimeBootstrapRef: input.worldRuntimeBootstrapRef,
    worldRuntimeBootstrapContentHash: runtime.contentHash,
    worldRuntimeBootstrapBytesHash: input.worldRuntimeBootstrapBytesHash,
    cuboids,
  });
}


export type NativeBlockSubjectVisualReviewVec3V1 = readonly [
  x: number,
  y: number,
  z: number,
];

export interface NativeBlockSubjectVisualReviewProxyCuboidV1 {
  readonly id: string;
  readonly minimumMetersXYZ: NativeBlockSubjectVisualReviewVec3V1;
  readonly maximumMetersXYZ: NativeBlockSubjectVisualReviewVec3V1;
}

export interface NativeBlockSubjectVisualReviewProxyBodyV1 {
  readonly kind: "native-block-subject-visual-review-proxy";
  readonly schemaVersion: 1;
  readonly initialControlledEntityId: string;
  readonly subjectDefinitionRef: string;
  readonly subjectDefinitionHash: Sha256HashV1;
  readonly subjectRuntimeDescriptorHash: Sha256HashV1;
  readonly worldRuntimeBootstrapRef: string;
  readonly worldRuntimeBootstrapContentHash: Sha256HashV1;
  readonly worldRuntimeBootstrapBytesHash: Sha256HashV1;
  readonly cuboids: readonly NativeBlockSubjectVisualReviewProxyCuboidV1[];
}

export interface NativeBlockSubjectVisualReviewProxyV1 extends
  NativeBlockSubjectVisualReviewProxyBodyV1 {
  readonly contentHash: Sha256HashV1;
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PROXY_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "initialControlledEntityId",
  "subjectDefinitionRef",
  "subjectDefinitionHash",
  "subjectRuntimeDescriptorHash",
  "worldRuntimeBootstrapRef",
  "worldRuntimeBootstrapContentHash",
  "worldRuntimeBootstrapBytesHash",
  "cuboids",
  "contentHash",
] as const);
const CUBOID_FIELDS = Object.freeze([
  "id",
  "minimumMetersXYZ",
  "maximumMetersXYZ",
] as const);

function fail(): never {
  throw new TypeError("Invalid Native Block Subject visual-review proxy.");
}

function exactPlainRecord(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) return fail();
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== fields.length ||
    keys.some((key) => !fields.includes(key))
  ) return fail();
  return record;
}

function nonEmptyText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return fail();
  return value;
}

function sha256(value: unknown): Sha256HashV1 {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) return fail();
  return value as Sha256HashV1;
}

function vec3(value: unknown): NativeBlockSubjectVisualReviewVec3V1 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) return fail();
  return Object.freeze([value[0], value[1], value[2]]) as
    NativeBlockSubjectVisualReviewVec3V1;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function hashNativeBlockSubjectVisualReviewProxyBodyV1(
  body: NativeBlockSubjectVisualReviewProxyBodyV1,
): Sha256HashV1 {
  return sha256CanonicalJson(body) as Sha256HashV1;
}

export function parseNativeBlockSubjectVisualReviewProxyV1(
  value: unknown,
): NativeBlockSubjectVisualReviewProxyV1 {
  const record = exactPlainRecord(value, PROXY_FIELDS);
  if (
    record.kind !== "native-block-subject-visual-review-proxy" ||
    record.schemaVersion !== 1 ||
    !Array.isArray(record.cuboids) ||
    record.cuboids.length === 0
  ) return fail();
  const cuboids = record.cuboids.map((input) => {
    const cuboid = exactPlainRecord(input, CUBOID_FIELDS);
    const minimumMetersXYZ = vec3(cuboid.minimumMetersXYZ);
    const maximumMetersXYZ = vec3(cuboid.maximumMetersXYZ);
    if (minimumMetersXYZ.some((minimum, axis) =>
      minimum >= maximumMetersXYZ[axis]!)) return fail();
    return Object.freeze({
      id: nonEmptyText(cuboid.id),
      minimumMetersXYZ,
      maximumMetersXYZ,
    });
  });
  const ids = cuboids.map(({ id }) => id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id, index) =>
      index > 0 && compareCodePoints(ids[index - 1]!, id) >= 0)
  ) return fail();
  const body = Object.freeze({
    kind: "native-block-subject-visual-review-proxy" as const,
    schemaVersion: 1 as const,
    initialControlledEntityId: nonEmptyText(record.initialControlledEntityId),
    subjectDefinitionRef: nonEmptyText(record.subjectDefinitionRef),
    subjectDefinitionHash: sha256(record.subjectDefinitionHash),
    subjectRuntimeDescriptorHash: sha256(record.subjectRuntimeDescriptorHash),
    worldRuntimeBootstrapRef: nonEmptyText(record.worldRuntimeBootstrapRef),
    worldRuntimeBootstrapContentHash: sha256(
      record.worldRuntimeBootstrapContentHash,
    ),
    worldRuntimeBootstrapBytesHash: sha256(record.worldRuntimeBootstrapBytesHash),
    cuboids: Object.freeze(cuboids),
  });
  const contentHash = sha256(record.contentHash);
  if (contentHash !== hashNativeBlockSubjectVisualReviewProxyBodyV1(body)) {
    return fail();
  }
  return Object.freeze({ ...body, contentHash });
}

export function createNativeBlockSubjectVisualReviewProxyV1(
  input: Omit<NativeBlockSubjectVisualReviewProxyBodyV1, "kind" | "schemaVersion">,
): NativeBlockSubjectVisualReviewProxyV1 {
  const body = Object.freeze({
    kind: "native-block-subject-visual-review-proxy" as const,
    schemaVersion: 1 as const,
    ...input,
  });
  return parseNativeBlockSubjectVisualReviewProxyV1({
    ...body,
    contentHash: hashNativeBlockSubjectVisualReviewProxyBodyV1(body),
  });
}
