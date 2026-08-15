import { createScalarRasterField, type ScalarRasterField } from "@whitebox-world/world";

export const SUNLIT_BAY_RASTER_BOUNDS = {
  center: [0, 0] as const,
  size: [1_200, 1_000] as const,
};

const COLUMNS = 241;
const ROWS = 201;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function ellipse(x: number, z: number, centerX: number, centerZ: number, radiusX: number, radiusZ: number): number {
  const distance = Math.hypot((x - centerX) / radiusX, (z - centerZ) / radiusZ);
  return 1 - smoothstep(0.72, 1, distance);
}

function bayHalfWidth(z: number): number {
  if (z <= -320) return mix(420, 350, (z + 500) / 180);
  if (z <= -120) return mix(350, 275, (z + 320) / 200);
  if (z <= 40) return mix(275, 205, (z + 120) / 160);
  if (z <= 145) return mix(205, 88, (z - 40) / 105);
  if (z <= 260) return mix(88, 120, (z - 145) / 115);
  return 120;
}

function coastHeight(x: number, z: number): number {
  const halfWidth = bayHalfWidth(z);
  const inlandDistance = Math.max(0, Math.abs(x) - halfWidth);
  const southernRise = z > 145 ? (z - 145) * 0.18 : 0;
  const shelf = 4 + Math.min(66, inlandDistance * 0.18);
  const westTerraces = x < 0
    ? 8 * ellipse(x, z, -380, 80, 210, 230) + 6 * ellipse(x, z, -470, -220, 170, 190)
    : 0;
  const eastHeadland = x > 0
    ? 10 * ellipse(x, z, 330, -20, 155, 210) + 4 * ellipse(x, z, 455, 175, 185, 220)
    : 0;
  const broadUndulation =
    Math.sin((x + z * 0.35) * 0.012) * 1.8 +
    Math.sin((z - x * 0.18) * 0.021) * 1.1;
  return shelf + southernRise + westTerraces + eastHeadland + broadUndulation;
}

function islandHeight(x: number, z: number): number {
  const west = ellipse(x, z, -245, -430, 110, 43);
  const east = ellipse(x, z, 215, -445, 142, 38);
  return Math.max(-100, west * 19 - 4, east * 16 - 4);
}

function terrainHeight(x: number, z: number): number {
  const halfWidth = bayHalfWidth(z);
  const signedCoastDistance = Math.abs(x) - halfWidth;
  const coastBlend = smoothstep(-24, 28, signedCoastDistance);
  const seaFloor = -7 - Math.max(0, -signedCoastDistance) * 0.008;
  let height = mix(seaFloor, coastHeight(x, z), coastBlend);

  // The playable foreground is a compact safe shelf feeding a broad visible
  // meadow ramp. This avoids the flat tabletop that used to hide the bay.
  if (z >= 220) {
    const shoulder = 1 - smoothstep(45, 190, Math.abs(x));
    const rampHeight = mix(5, 82, smoothstep(220, 355, z));
    height = mix(height, rampHeight, shoulder);
  }
  const foregroundShelf = ellipse(x, z, 0, 355, 100, 48);
  height = mix(height, 82, foregroundShelf);
  if (z >= 145 && Math.abs(x) < 38) {
    const corridor = 1 - smoothstep(10, 38, Math.abs(x));
    const descent = mix(12, 82, smoothstep(145, 355, z));
    height = mix(height, descent, corridor);
  }

  // A compact level cape keeps the lighthouse grounded and readable.
  height = mix(height, 42, ellipse(x, z, 110, 100, 82, 68));

  // Distant islands are part of the same collision heightfield, not floating boxes.
  height = Math.max(height, islandHeight(x, z));
  height = Math.min(112, height);

  // Route centerlines carry explicit elevation profiles. This preserves the
  // freeform coastline while guaranteeing that gameplay corridors are smooth
  // and stay within the humanoid slope contract.
  const route = nearestRoute(x, z);
  if (route !== undefined) {
    height = mix(height, route.height, 1 - smoothstep(9, 20, route.distance));
  }
  return height;
}

function distanceToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

const PATHS = [
  [[0, 390, 82], [0, 355, 82], [-5, 295, 68], [0, 280, 64], [0, 210, 40], [0, 145, 12]],
  [[0, 280, 64], [45, 260, 61], [75, 210, 55], [100, 150, 48], [110, 100, 42]],
  [[0, 280, 64], [-130, 270, 60], [-205, 210, 54], [-255, 115, 48], [-290, 5, 41], [-345, -95, 34], [-385, -210, 26]],
  [[110, 100, 42], [200, -40, 39], [300, -195, 35], [405, -325, 28]],
  [[0, 355, 82], [-120, 405, 86], [-275, 390, 84], [-410, 310, 72], [-350, 165, 52], [-235, 100, 48]],
  [[0, 355, 82], [135, 415, 86], [290, 390, 84], [420, 300, 70], [350, 170, 52], [230, 100, 48]],
] as const;

function nearestRoute(x: number, z: number): { distance: number; height: number } | undefined {
  let nearest: { distance: number; height: number } | undefined;
  for (const path of PATHS) {
    for (let index = 1; index < path.length; index += 1) {
      const a = path[index - 1] as readonly [number, number, number];
      const b = path[index] as readonly [number, number, number];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared));
      const distance = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
      if (nearest === undefined || distance < nearest.distance) {
        nearest = { distance, height: mix(a[2], b[2], t) };
      }
    }
  }
  return nearest;
}

function pathMask(x: number, z: number): number {
  let distance = Number.POSITIVE_INFINITY;
  for (const path of PATHS) {
    for (let index = 1; index < path.length; index += 1) {
      const a = path[index - 1] as readonly [number, number, number];
      const b = path[index] as readonly [number, number, number];
      distance = Math.min(distance, distanceToSegment(x, z, a[0], a[1], b[0], b[1]));
    }
  }
  return 1 - smoothstep(1.2, 2.5, distance);
}

function cliffMask(x: number, z: number): number {
  if (z > 210) return 0;
  const distance = Math.abs(x) - bayHalfWidth(z);
  const shoreBand = 1 - smoothstep(15, 75, Math.abs(distance - 35));
  const broken = 0.62 + 0.38 * Math.sin(z * 0.043 + x * 0.017);
  return Math.max(0, shoreBand * broken);
}

function field(sample: (x: number, z: number) => number): ScalarRasterField {
  return createScalarRasterField(COLUMNS, ROWS, (u, v) =>
    sample(
      SUNLIT_BAY_RASTER_BOUNDS.center[0] + (u - 0.5) * SUNLIT_BAY_RASTER_BOUNDS.size[0],
      SUNLIT_BAY_RASTER_BOUNDS.center[1] + (v - 0.5) * SUNLIT_BAY_RASTER_BOUNDS.size[1],
    ),
  );
}

export const sunlitBayHeightField = field(terrainHeight);
export const sunlitBayGrassMask = field((x, z) => (terrainHeight(x, z) > 0.4 ? 1 : 0));
export const sunlitBayCliffMask = field(cliffMask);
export const sunlitBayPathMask = field(pathMask);
