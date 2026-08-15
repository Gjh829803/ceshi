import type { AppearanceBinding, TransformSpec, Vec3Tuple } from "@whitebox-world/contracts";

export type LandmarkPrimitiveKind = "box" | "sphere" | "cylinder" | "cone" | "plane";

export interface LandmarkPrimitiveSpec {
  id?: string;
  kind: LandmarkPrimitiveKind;
  transform?: TransformSpec;
  size?: Vec3Tuple;
  radius?: number;
  height?: number;
  collision?: boolean;
  appearance?: AppearanceBinding;
}

export interface LandmarkPrimitiveDescriptor {
  kind: "primitive";
  primitive: LandmarkPrimitiveKind;
  id?: string;
  transform: Required<TransformSpec>;
  size?: Vec3Tuple;
  radius?: number;
  height?: number;
  collision: boolean;
  appearance?: AppearanceBinding;
}

export interface CompoundLandmarkSpec {
  id?: string;
  transform?: TransformSpec;
  children: readonly (LandmarkPrimitiveSpec | CompoundLandmarkSpec)[];
  collision?: boolean;
  appearance?: AppearanceBinding;
}

export interface CompoundLandmarkDescriptor {
  kind: "compound";
  id?: string;
  transform: Required<TransformSpec>;
  children: readonly LandmarkDescriptor[];
  collision: boolean;
  appearance?: AppearanceBinding;
}

export type LandmarkDescriptor = LandmarkPrimitiveDescriptor | CompoundLandmarkDescriptor;

export interface LandmarkMetrics {
  vertices: number;
  triangles: number;
  colliders: number;
}

function transformOrDefault(transform?: TransformSpec): Required<TransformSpec> {
  return {
    position: transform?.position ? [...transform.position] : [0, 0, 0],
    rotation: transform?.rotation ? [...transform.rotation] : [0, 0, 0],
    scale: transform?.scale ? [...transform.scale] : [1, 1, 1],
  };
}

function isPrimitive(spec: LandmarkPrimitiveSpec | CompoundLandmarkSpec): spec is LandmarkPrimitiveSpec {
  return "kind" in spec;
}

export function createPrimitiveLandmark(spec: LandmarkPrimitiveSpec): LandmarkPrimitiveDescriptor {
  const descriptor: LandmarkPrimitiveDescriptor = {
    kind: "primitive",
    primitive: spec.kind,
    transform: transformOrDefault(spec.transform),
    collision: spec.collision ?? true,
  };
  if (spec.id !== undefined) descriptor.id = spec.id;
  if (spec.size !== undefined) descriptor.size = [...spec.size];
  if (spec.radius !== undefined) descriptor.radius = spec.radius;
  if (spec.height !== undefined) descriptor.height = spec.height;
  if (spec.appearance !== undefined) descriptor.appearance = { ...spec.appearance };
  return descriptor;
}

export function createCompoundLandmark(spec: CompoundLandmarkSpec): CompoundLandmarkDescriptor {
  const descriptor: CompoundLandmarkDescriptor = {
    kind: "compound",
    transform: transformOrDefault(spec.transform),
    children: spec.children.map((child) =>
      isPrimitive(child) ? createPrimitiveLandmark(child) : createCompoundLandmark(child),
    ),
    collision: spec.collision ?? true,
  };
  if (spec.id !== undefined) descriptor.id = spec.id;
  if (spec.appearance !== undefined) descriptor.appearance = { ...spec.appearance };
  return descriptor;
}

const primitiveMetrics: Record<LandmarkPrimitiveKind, readonly [vertices: number, triangles: number]> = {
  box: [24, 12],
  sphere: [221, 384],
  cylinder: [100, 128],
  cone: [52, 64],
  plane: [4, 2],
};

export function measureLandmark(descriptor: LandmarkDescriptor): LandmarkMetrics {
  if (descriptor.kind === "primitive") {
    const [vertices, triangles] = primitiveMetrics[descriptor.primitive];
    return { vertices, triangles, colliders: descriptor.collision ? 1 : 0 };
  }
  return descriptor.children.reduce<LandmarkMetrics>(
    (total, child) => {
      const childMetrics = measureLandmark(child);
      total.vertices += childMetrics.vertices;
      total.triangles += childMetrics.triangles;
      total.colliders += childMetrics.colliders;
      return total;
    },
    { vertices: 0, triangles: 0, colliders: 0 },
  );
}
