import type { AppearanceBinding, ResourceId } from "@whitebox-world/contracts";

import type { SerializedShape2D, Shape2D } from "./shapes";

export interface WaterSurfaceSpec {
  area: Shape2D;
  elevation: number;
  minimumDepth?: number;
  shoreWidth?: number;
  traversal?: "blocked" | "swimmable" | "walkable";
  appearance?: AppearanceBinding;
  style?: WaterSurfaceStyle;
}

export interface WaterSurfaceStyle {
  deepColor?: number;
  shallowColor?: number;
  opacity?: number;
  waveAmplitude?: number;
  waveFrequency?: number;
}

export interface WaterSurfaceDescriptor {
  kind: "water";
  area: SerializedShape2D;
  elevation: number;
  minimumDepth: number;
  shoreWidth: number;
  traversal: "blocked" | "swimmable" | "walkable";
  appearance?: AppearanceBinding;
  style: Required<WaterSurfaceStyle>;
}

export interface SemanticBindingDescriptor {
  targetResourceId: ResourceId;
  appearance: AppearanceBinding;
}

export function createWaterSurface(spec: WaterSurfaceSpec): WaterSurfaceDescriptor {
  const result: WaterSurfaceDescriptor = {
    kind: "water",
    area: spec.area.toJSON(),
    elevation: spec.elevation,
    minimumDepth: spec.minimumDepth ?? 2,
    shoreWidth: spec.shoreWidth ?? 6,
    traversal: spec.traversal ?? "blocked",
    style: {
      deepColor: spec.style?.deepColor ?? 0x4e8491,
      shallowColor: spec.style?.shallowColor ?? 0xb5d5d6,
      opacity: spec.style?.opacity ?? 0.76,
      waveAmplitude: spec.style?.waveAmplitude ?? 0.035,
      waveFrequency: spec.style?.waveFrequency ?? 0.14,
    },
  };
  if (spec.appearance) result.appearance = { ...spec.appearance };
  return result;
}
