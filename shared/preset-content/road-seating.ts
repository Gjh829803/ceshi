/** Local vehicle geometry, in metres. These are cushion centres, not bones. */
export const ROAD_CUSHIONS = {
  rover: { center: [0, .91, 0], size: [.72, .13, .50] },
  racer: { center: [0, .77, 0], size: [.72, .13, .50] },
  'trail-rover': { center: [0, .91, 0], size: [.72, .13, .50] },
  supercar: { center: [0, .58, -.3], size: [.72, .13, .50] },
  kart: { center: [0, .47, -.32], size: [.72, .13, .50] },
  bike: { center: [0, .89, -.48], size: [.42, .16, .95] },
  'touring-bike': { center: [0, .89, -.48], size: [.42, .16, .95] },
} as const;

/** The UEFN skin uses the Source101 rig. Its drive pose needs
 * 0.133 m clearance over a 0.50 m pan; straddled thighs need 0.165 m above a
 * 0.42 m saddle. Keep motorcycle riders at the existing forward saddle position. */
export function roadSeatAnchor(id: keyof typeof ROAD_CUSHIONS): [number, number, number] {
  const { center, size } = ROAD_CUSHIONS[id];
  const motorcycle=id==='bike'||id==='touring-bike';
  return [center[0], center[1] + size[1] / 2 + (motorcycle?.165:.133), center[2]+(motorcycle?.28:0)];
}
