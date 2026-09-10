import { CubicBezierCurve3, CurvePath, LineCurve3, Vector3 } from 'three';
import { SPECS } from '../config';
import { block } from './modules';
import type { EnvironmentBox, EnvironmentDefinition, MapRegion, MapSpawn } from './types';

// Original clockwise circuit. Coordinates are metres; tangent joins preserve
// the long straight and avoid a steering discontinuity at the start/finish seam.
const point = (x: number, z: number) => new Vector3(x, 0, z);
const path = new CurvePath<Vector3>();
path.add(new LineCurve3(point(-620, -500), point(-620, 300)));
const bends = [
  [-620, 300, -620, 400, -580, 440, -480, 440],
  [-480, 440, -380, 440, -330, 300, -240, 300],
  [-240, 300, -150, 300, -110, 400, -20, 400],
  [-20, 400, 70, 400, 80, 290, 180, 290],
  [180, 290, 250, 290, 280, 370, 350, 370],
  [350, 370, 440, 370, 500, 330, 500, 240],
] as const;
function bend(v: readonly number[]) {
  path.add(new CubicBezierCurve3(point(v[0]!, v[1]!), point(v[2]!, v[3]!), point(v[4]!, v[5]!), point(v[6]!, v[7]!)));
}
bends.forEach(bend);
path.add(new LineCurve3(point(500, 240), point(500, -160)));
[
  [500, -160, 500, -220, 565, -220, 565, -280],
  [565, -280, 565, -355, 430, -355, 430, -280],
  [430, -280, 430, -190, 310, -80, 220, -80],
  [220, -80, 140, -80, 65, -95, 65, -170],
  [65, -170, 65, -245, 140, -245, 140, -340],
  [140, -340, 140, -540, -40, -600, -250, -600],
  [-250, -600, -470, -600, -620, -660, -620, -500],
].forEach(bend);

const length = path.getLength();
const count = Math.ceil(length / 7);
const startFinishZ = -70;
export const START_FINISH = {
  x: -620, z: startFinishZ,
  grid: Array.from({ length: 10 }, (_, i) => ({ number: i + 1, x: -620 + (i % 2 ? 4 : -4), z: startFinishZ - 12.5 - i * 7 })),
};
export const GRAND_PRIX = {
  lengthMeters: length,
  roadWidthMeters: 18,
  // CurvePath.getPoint already allocates its parameter by subcurve length.
  samples: Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, position = path.getPoint(t), tangent = path.getTangent(t).normalize();
    return { position, tangent, normal: new Vector3(tangent.z, 0, -tangent.x) };
  }),
};

const modes = ['character', 'wheeled', 'motorcycle', 'unicycle', 'skateboard', 'hover', 'bus'];
export function createGrandPrix(): EnvironmentDefinition {
  const regions: MapRegion[] = [
    { id: 'gp-pits', name: '01 / 维修准备区', description: '选择赛车、换乘和调参；沿出口接入主直道。', center: [-562, 0, -240], size: [50, 240], color: '#86aaa7', modes },
    { id: 'gp-straight', name: '02 / 800 m 主直道', description: '加速、极速稳定性和重刹；弯前 150 / 100 / 50 m 标牌。', center: [-620, 0, -70], size: [18, 730], color: '#d9ac78', modes },
    { id: 'gp-esses', name: '03 / 连续 S 弯', description: '左右重心切换、转向响应与连续修正。', center: [-130, 0, 350], size: [400, 120], color: '#79afb6', modes },
    { id: 'gp-hairpin', name: '04 / 重刹发卡弯', description: '后直道接低速回头弯，测试入弯制动和出弯加速。', center: [500, 0, -250], size: [195, 240], color: '#d1a085', modes },
    { id: 'gp-technical', name: '05 / 低速技术段', description: '紧凑反向弯，比较低速转向、抓地与手刹。', center: [160, 0, -190], size: [245, 240], color: '#aba2c1', modes },
    { id: 'gp-sweeper', name: '06 / 长弧回场弯', description: '持续转向与油门控制，接回起终点完成闭环。', center: [-225, 0, -560], size: [570, 140], color: '#9eaf8b', modes },
  ];
  const boxes: EnvironmentBox[] = [
    // One level physical surface throughout the track and paved runoff. Road
    // paint and flush kerbs never introduce overlapping road collider seams.
    { ...block('gp-ground', [-20, -2, -70], [1440, 4, 1260], '#cbd1ce'), surface: 'asphalt' },
  ];
  // Posts sit beyond both the road and the diagonal pit entry. The underside
  // of the hanging light enclosure is 7 m above the continuous road surface.
  for (const side of [-1, 1]) {
    const x = START_FINISH.x + side * 27;
    boxes.push(block(`gp-gantry-foot-${side}`, [x, .35, START_FINISH.z], [2.4, .7, 3.2], '#c0c9c8'));
    boxes.push(block(`gp-gantry-post-${side}`, [x, 5, START_FINISH.z], [1.1, 10, 1.1], '#e5e8e5'));
  }
  boxes.push(block('gp-gantry-beam', [START_FINISH.x, 9.7, START_FINISH.z], [55.2, 1.8, 1.4], '#e5e8e5'));
  boxes.push(block('gp-start-light-enclosure', [START_FINISH.x, 7.9, START_FINISH.z], [10.4, 1.8, .65], '#26363c'));
  // Open pit shelters keep the parking area visible from the circuit.
  for (let i = 0; i < 4; i++) {
    const z = -330 + i * 48;
    boxes.push(block(`gp-garage-roof-${i}`, [-533, 6, z], [17, .4, 35], '#e5e8e5'));
    for (const dz of [-17, 17]) boxes.push(block(`gp-garage-post-${i}-${dz}`, [-541, 3, z + dz], [.6, 6, .6], '#bbc5c5'));
  }
  for (const [distance, z] of [[150, 150], [100, 200], [50, 250]]) {
    boxes.push(block(`gp-brake-board-${distance}`, [-636, 1.5, z!], [3.4, 2, .2], '#edf0eb'));
  }
  // Append the new bus so existing vehicles retain their authored pit positions.
  const pitSpecs = [...SPECS.filter(s => modes.includes(s.mode) && s.mode !== 'bus'), ...SPECS.filter(s => s.mode === 'bus')];
  const parkedVehicles = pitSpecs.map((spec, i): MapSpawn => ({
    id: `gp-park-${spec.id}`, vehicleId: spec.id, name: spec.name,
    position: [-564 + (i % 2) * 14, spec.mode === 'hover' ? 1.3 : .03, -330 + Math.floor(i / 2) * 32], yaw: 0, regionId: 'gp-pits',
  }));
  const supercarSpawn = parkedVehicles.find(spawn => spawn.vehicleId === 'supercar')!;
  // Within boarding reach, with room for the character preparation clearance.
  const playerSpawn: MapSpawn['position'] = [supercarSpawn.position[0] + 3, .03, supercarSpawn.position[2]];
  const spawns: MapSpawn[] = [
    { id: 'gp-player', name: '超跑旁', position: playerSpawn, yaw: 0, regionId: 'gp-pits' },
    { id: 'gp-straight-start', name: '主直道起点', position: [START_FINISH.x, .03, START_FINISH.z - 25], yaw: 0, regionId: 'gp-straight' },
    { id: 'gp-esses-start', name: 'S 弯入口', position: [-240, .03, 300], yaw: Math.PI / 2, regionId: 'gp-esses' },
    { id: 'gp-hairpin-start', name: '后直道制动段', position: [500, .03, -80], yaw: Math.PI, regionId: 'gp-hairpin' },
    { id: 'gp-technical-start', name: '技术弯入口', position: [220, .03, -80], yaw: -Math.PI / 2, regionId: 'gp-technical' },
    { id: 'gp-sweeper-start', name: '长弧弯入口', position: [140, .03, -340], yaw: Math.PI, regionId: 'gp-sweeper' },
    ...parkedVehicles,
  ];
  return { id: 'grand-prix', name: '大奖赛 · 驾驶测试赛道', description: `原创 F1 风格 ${(length / 1000).toFixed(2)} km 闭环，18 m 宽赛道、800 m 主直道、S 弯、发卡弯与维修区。平整铺装缓冲区和齐平路肩沿用赛道抓地；按 F 驾驶，右侧调参。`,
    bounds: { min: [-740, -10, -700], max: [700, 120, 560] }, boxes, water: [], regions, spawns, playerSpawn };
}
