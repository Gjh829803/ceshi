import type { Vec2Tuple } from "@whitebox-world/contracts";

export type FalloffCurve = "linear" | "smooth" | "smoother";

export type SerializedShape2D =
  | { kind: "circle"; center: Vec2Tuple; radius: number }
  | { kind: "ellipse"; center: Vec2Tuple; radius: Vec2Tuple }
  | { kind: "polygon"; points: readonly Vec2Tuple[] };

export interface Shape2D {
  readonly kind: SerializedShape2D["kind"];
  contains(point: Vec2Tuple): boolean;
  /** Negative inside, zero on the boundary, positive outside. */
  signedDistance(point: Vec2Tuple): number;
  distanceToBoundary(point: Vec2Tuple): number;
  /** 1 in the interior, fading to 0 across the inner edge. */
  influence(point: Vec2Tuple, falloffWidth?: number, curve?: FalloffCurve): number;
  toJSON(): SerializedShape2D;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function applyCurve(value: number, curve: FalloffCurve): number {
  const amount = clamp01(value);
  if (curve === "linear") return amount;
  if (curve === "smooth") return amount * amount * (3 - 2 * amount);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

abstract class BaseShape implements Shape2D {
  abstract readonly kind: SerializedShape2D["kind"];
  abstract signedDistance(point: Vec2Tuple): number;
  abstract toJSON(): SerializedShape2D;

  contains(point: Vec2Tuple): boolean {
    return this.signedDistance(point) <= 0;
  }

  distanceToBoundary(point: Vec2Tuple): number {
    return Math.abs(this.signedDistance(point));
  }

  influence(point: Vec2Tuple, falloffWidth = 0, curve: FalloffCurve = "smooth"): number {
    const distance = this.signedDistance(point);
    if (distance > 0) return 0;
    if (falloffWidth <= 0) return 1;
    return applyCurve(-distance / falloffWidth, curve);
  }
}

export class CircleShape extends BaseShape {
  readonly kind = "circle" as const;

  constructor(
    readonly center: Vec2Tuple,
    readonly radius: number,
  ) {
    super();
    if (!(radius > 0)) throw new RangeError("Circle radius must be greater than zero.");
  }

  signedDistance(point: Vec2Tuple): number {
    return Math.hypot(point[0] - this.center[0], point[1] - this.center[1]) - this.radius;
  }

  toJSON(): SerializedShape2D {
    return { kind: this.kind, center: [...this.center], radius: this.radius };
  }
}

function ellipseBoundaryDistance(x: number, z: number, radiusX: number, radiusZ: number): number {
  const absoluteX = Math.abs(x);
  const absoluteZ = Math.abs(z);
  if (absoluteX === 0 && absoluteZ === 0) return Math.min(radiusX, radiusZ);

  let angle = Math.atan2(absoluteZ * radiusX, absoluteX * radiusZ);
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const sine = Math.sin(angle);
    const cosine = Math.cos(angle);
    const derivative =
      (radiusZ * radiusZ - radiusX * radiusX) * sine * cosine +
      radiusX * absoluteX * sine -
      radiusZ * absoluteZ * cosine;
    const secondDerivative =
      (radiusZ * radiusZ - radiusX * radiusX) * (cosine * cosine - sine * sine) +
      radiusX * absoluteX * cosine +
      radiusZ * absoluteZ * sine;
    if (Math.abs(secondDerivative) < 1e-9) break;
    angle = Math.max(0, Math.min(Math.PI / 2, angle - derivative / secondDerivative));
  }

  const nearestX = radiusX * Math.cos(angle);
  const nearestZ = radiusZ * Math.sin(angle);
  return Math.hypot(absoluteX - nearestX, absoluteZ - nearestZ);
}

export class EllipseShape extends BaseShape {
  readonly kind = "ellipse" as const;

  constructor(
    readonly center: Vec2Tuple,
    readonly radius: Vec2Tuple,
  ) {
    super();
    if (!(radius[0] > 0 && radius[1] > 0)) {
      throw new RangeError("Ellipse radii must be greater than zero.");
    }
  }

  signedDistance(point: Vec2Tuple): number {
    const x = point[0] - this.center[0];
    const z = point[1] - this.center[1];
    const normalized = (x * x) / (this.radius[0] ** 2) + (z * z) / (this.radius[1] ** 2);
    const distance = ellipseBoundaryDistance(x, z, this.radius[0], this.radius[1]);
    return normalized <= 1 ? -distance : distance;
  }

  toJSON(): SerializedShape2D {
    return { kind: this.kind, center: [...this.center], radius: [...this.radius] };
  }
}

function segmentDistanceSquared(point: Vec2Tuple, from: Vec2Tuple, to: Vec2Tuple): number {
  const edgeX = to[0] - from[0];
  const edgeZ = to[1] - from[1];
  const pointX = point[0] - from[0];
  const pointZ = point[1] - from[1];
  const denominator = edgeX * edgeX + edgeZ * edgeZ;
  const amount = denominator === 0 ? 0 : clamp01((pointX * edgeX + pointZ * edgeZ) / denominator);
  const dx = pointX - edgeX * amount;
  const dz = pointZ - edgeZ * amount;
  return dx * dx + dz * dz;
}

export class PolygonShape extends BaseShape {
  readonly kind = "polygon" as const;
  readonly points: readonly Vec2Tuple[];

  constructor(points: readonly Vec2Tuple[]) {
    super();
    if (points.length < 3) throw new RangeError("Polygon requires at least three points.");
    this.points = points.map((point) => [point[0], point[1]] as const);
  }

  signedDistance(point: Vec2Tuple): number {
    let inside = false;
    let minimumDistanceSquared = Number.POSITIVE_INFINITY;

    for (let index = 0, previous = this.points.length - 1; index < this.points.length; previous = index, index += 1) {
      const currentPoint = this.points[index];
      const previousPoint = this.points[previous];
      if (!currentPoint || !previousPoint) continue;
      minimumDistanceSquared = Math.min(
        minimumDistanceSquared,
        segmentDistanceSquared(point, previousPoint, currentPoint),
      );
      const crosses =
        (currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]) &&
        point[0] <
          ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
            (previousPoint[1] - currentPoint[1]) +
            currentPoint[0];
      if (crosses) inside = !inside;
    }

    const distance = Math.sqrt(minimumDistanceSquared);
    return inside ? -distance : distance;
  }

  toJSON(): SerializedShape2D {
    return { kind: this.kind, points: this.points.map((point) => [...point] as const) };
  }
}

export const shape = {
  circle(center: Vec2Tuple, radius: number): CircleShape {
    return new CircleShape(center, radius);
  },
  ellipse(center: Vec2Tuple, radius: Vec2Tuple): EllipseShape {
    return new EllipseShape(center, radius);
  },
  polygon(points: readonly Vec2Tuple[]): PolygonShape {
    return new PolygonShape(points);
  },
  fromJSON(serialized: SerializedShape2D): Shape2D {
    switch (serialized.kind) {
      case "circle":
        return new CircleShape(serialized.center, serialized.radius);
      case "ellipse":
        return new EllipseShape(serialized.center, serialized.radius);
      case "polygon":
        return new PolygonShape(serialized.points);
    }
  },
};
