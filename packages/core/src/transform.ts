import type { TransformSpec, Vec3Tuple } from "@whitebox-world/contracts";
import { Object3D } from "three";

export interface TransformSnapshot {
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: Vec3Tuple;
}

/** A live transform view backed by a Three.js Object3D. */
export class Object3DTransform {
  public constructor(public readonly object: Object3D) {}

  public get position(): Vec3Tuple {
    const { x, y, z } = this.object.position;
    return [x, y, z];
  }

  public set position(value: Vec3Tuple) {
    this.object.position.set(...value);
  }

  public get rotation(): Vec3Tuple {
    const { x, y, z } = this.object.rotation;
    return [x, y, z];
  }

  public set rotation(value: Vec3Tuple) {
    this.object.rotation.set(...value);
  }

  public get scale(): Vec3Tuple {
    const { x, y, z } = this.object.scale;
    return [x, y, z];
  }

  public set scale(value: Vec3Tuple) {
    this.object.scale.set(...value);
  }

  public apply(spec: TransformSpec): this {
    if (spec.position !== undefined) this.position = spec.position;
    if (spec.rotation !== undefined) this.rotation = spec.rotation;
    if (spec.scale !== undefined) this.scale = spec.scale;
    return this;
  }

  public snapshot(): TransformSnapshot {
    return {
      position: this.position,
      rotation: this.rotation,
      scale: this.scale,
    };
  }
}
