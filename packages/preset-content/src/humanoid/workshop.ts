import { block, ramp } from '../environment/modules';
import type { CharacterTrial, EnvironmentBox, MapClimbSurface, EnvironmentDefinition, MapInteraction, MapRegion, Vec3 } from '../environment/types';

const mint = '#71d6b2', blue = '#74a9ec', amber = '#f5ad67', violet = '#a394ec';
const groundModes = ['character', 'wheeled', 'motorcycle', 'unicycle', 'skateboard', 'hover', 'mount', 'carriage'];
const trial = (id: string, name: string, description: string, position: Vec3, action: string, yaw = Math.PI): CharacterTrial =>
  ({ id, name, description, position, yaw, action });

/** Source workshop translated without rotating or changing any contact anchors. */
function interactionStation(prefix: string, tx: number, tz: number) {
  const boxes: EnvironmentBox[] = [];
  const add = (id: string, x: number, z: number, w: number, h: number, d: number, color = '#829698', base = 0) =>
    boxes.push(block(`${prefix}-${id}`, [tx + x, base + h / 2, tz + z], [w, h, d], color));
  add('pickup-top', -5, -6.71, 1.35, .1, .75, '#c6ae85', .749);
  add('place-top', -8, -6.71, 1.35, .1, .75, '#9cbcb2', .749);
  add('seat-cushion', 5, -5.51, .56, .1, .38, '#d4ad74', .36);
  add('seat-back', 5, -5.275, .56, .55, .075, '#c59462', .43);
  for (const x of [-5, -8]) for (const side of [-1, 1]) for (const depth of [-1, 1])
    add(`table-leg-${x}-${side}-${depth}`, x + side * .53, -6.71 + depth * .27, .07, .749, .07);
  for (const side of [-1, 1]) for (const depth of [-1, 1])
    add(`chair-leg-${side}-${depth}`, 5 + side * .22, -5.51 + depth * .135, .055, .36, .055);
  const interactions: MapInteraction[] = [
    { id: `${prefix}-parcel`, label: '搬运测试方块', kind: 'pickup',slotId:'pickup', position: [tx - 5.051, .914, tz - 6.363],
      approach: [tx - 5, .02, tz - 6], yaw: Math.PI, size: [.13, .13, .13], massKg: .3 },
    { id: `${prefix}-chair`, label: '坐姿测试椅', kind: 'seat',slotId:'seat', position: [tx + 5, .46, tz - 5.51],
      approach: [tx + 5, .02, tz - 6], yaw: Math.PI,
      colliderIds: ['seat-cushion', 'seat-back', 'chair-leg--1--1', 'chair-leg--1-1', 'chair-leg-1--1', 'chair-leg-1-1'].map(id => `${prefix}-${id}`) },
  ];
  for(const box of boxes){
    const id=box.id.slice(prefix.length+1);
    if(id.startsWith('seat-')||id.startsWith('chair-leg-'))box.rigidGroup={id:`${prefix}-chair-body`,massKg:8};
    else if(id==='pickup-top'||id.startsWith('table-leg--5-'))box.rigidGroup={id:`${prefix}-pickup-table`,massKg:24};
    else if(id==='place-top'||id.startsWith('table-leg--8-'))box.rigidGroup={id:`${prefix}-place-table`,massKg:24};
  }
  // Painted anchors are thin visual-only strips; the object is a dynamic target.
  for (const target of interactions) for (const side of [-1, 1])
    boxes.push(block(`${target.id}-anchor-${side}`, [target.approach[0] + side * .29, .008, target.approach[2]], [.025, .008, .5], mint, undefined, false));
  return { boxes, interactions };
}

/** One map covers every source action family, with an open vehicle staging yard. */
export function createCharacterWorkshop(): EnvironmentDefinition {
  const boxes: EnvironmentBox[] = [], trials: CharacterTrial[] = [];
  const add = (id: string, x: number, z: number, w: number, h: number, d: number, color = '#b9ccc2', base = 0) =>
    boxes.push(block(id, [x, base + h / 2, z], [w, h, d], color));
  const paint = (id: string, x: number, z: number, w: number, d: number, color: string, y = .012) =>
    boxes.push(block(id, [x, y, z], [w, .012, d], color, undefined, false));

  // Four ground slabs leave a real hole for the 22 × 46 m pool.
  add('cw-ground-west', -29, 0, 82, 4, 160, '#a4afab', -4);
  add('cw-ground-east', 52, 0, 36, 4, 160, '#a4afab', -4);
  add('cw-ground-south', 23, -32, 22, 4, 96, '#a4afab', -4);
  add('cw-ground-north', 23, 71, 22, 4, 18, '#a4afab', -4);
  // No solid props enter z <= -32, including the existing fallback parking grid.
  paint('cw-parking', 0, -57, 78, 37, '#7f959d');
  for (let row = 0; row < 3; row++) for (let column = 0; column < 6; column++) {
    const x = -30 + column * 12, z = -45 - row * 12;
    paint(`cw-parking-${row}-${column}`, x, z + 4.5, 9, .15, '#e4eadd', .028);
    paint(`cw-parking-side-${row}-${column}`, x - 4.5, z, .15, 9, '#e4eadd', .028);
  }
  paint('cw-vehicle-court', 29, -14, 68, 29, '#90a9a2');
  for (let i = 0; i < 5; i++) add(`cw-court-cone-${i}`, 48 + (i % 2) * 5, -23 + i * 4, .35, .5, .35, amber);

  // Exact source workshop contact geometry at translation (-32, +8).
  const station = interactionStation('cw', -32, 8);
  boxes.push(...station.boxes);
  add('cw-workshop-west', -49.5, 8, .3, 3.3, 35);
  add('cw-workshop-east', -14.5, 8, .3, 3.3, 35);
  add('cw-workshop-back', -32, -9.5, 36, 3.3, .3);
  add('cw-roll-stop', -42, 6.3, 4, 2.15, .45, '#9ab7ac');
  add('cw-slide-beam', -32, 11, 4.2, .45, 1.4, '#a8b8cb', 1.05);
  for (const side of [-1, 1]) add(`cw-slide-post-${side}`, -32 + side * 2.03, 11, .14, 1.05, 1.4, '#829698');
  add('cw-prone-ceiling', -43, -3, 3.2, .6, 3, '#adadb8', .85);
  for (const side of [-1, 1]) add(`cw-prone-side-${side}`, -43 + side * 1.54, -3, .12, .85, 3, '#829698');
  add('cw-climb-wall', -22, -6.7, 8, 3, 1.8, '#a8a7b7');
  for (const side of [-1, 1]) boxes.push(block(`cw-ladder-rail-${side}`, [-19 + side * .4, 1.6, -5.6], [.055, 3.2, .055], '#74868b', undefined, false));
  for (let i = 0; i < 10; i++) boxes.push(block(`cw-ladder-rung-${i}`, [-19, .25 + i * .3, -5.6], [.83, .045, .055], '#9fb0ae', undefined, false));
  for (const [x, color] of [[-42, mint], [-32, blue]] as const) {
    paint(`cw-lane-${x}`, x, 12, 4, 11, color);
    for (let i = 0; i < 10; i++) paint(`cw-distance-${x}-${i}`, x, 16 - i, .5, .08, '#e6ece4', .025);
  }
  paint('cw-prone-lane', -43, -2, 2.7, 7.6, '#b3aec9');
  const climbSurfaces: MapClimbSurface[] = [
    { id: 'cw-wall', colliderId: 'cw-climb-wall', kind: 'wall', center: [-23, 0, -5.8], normal: [0, 0, 1], width: 5, minY: 0, maxY: 3 },
    { id: 'cw-ladder', colliderId: 'cw-climb-wall', kind: 'ladder', center: [-19, 0, -5.8], normal: [0, 0, 1], width: .8, minY: 0, maxY: 3 },
  ];
  trials.push(
    trial('roll', '翻滚跑道', '向前翻滚；尽头的实体挡墙检查碰撞截断。', [-42, .03, 15], 'roll'),
    trial('slide', '低梁滑铲', '助跑后滑铲穿过净空 1.05 m 的低梁；出口受阻时保持低姿态。', [-32, .03, 15], 'slide'),
    trial('pickup', '拾取与搬运', '接近桌面方块并拾取，搬运到左侧空桌放下；锚点保留原动作标定。', [-37, .03, 2.35], 'pickup'),
    trial('sit', '坐下与起身', '对齐座椅坐下，观察坐姿待机，再交互或跳跃起身。', [-27, .03, 1.65], 'sit', 0),
    trial('prone', '匍匐通道', '先趴下再进入 0.85 m 通道；顶板下无法强行站起。', [-43, .03, 1.5], 'prone'),
    trial('wall-climb', '壁面移动', '进入墙面攀爬，上下及横向移动，脱手回到物理下落。', [-23, .03, -5.08], 'surface'),
    trial('ladder', '梯子攀爬', '沿 3 m 梯子上下移动；横向移动范围限制在梯子内。', [-19, .03, -5.08], 'ladder'),
  );

  // Independent traversal lanes leave room to approach, land and turn around.
  for (const [id, name, x, height, depth, color] of [
    ['vault', '低栏翻越', -58, .8, .8, mint], ['mantle', '宽台攀上', -48, 1.4, 2.8, blue],
    ['ledge', '高墙攀上', -38, 2.15, 3, amber], ['blocked', '超高墙拒绝', -28, 3.5, 3, violet],
  ] as const) {
    add(`cw-${id}`, x, 43, 4.2, height, depth, color);
    paint(`cw-${id}-runup`, x, 47, 5, 6, color);
    trials.push(trial(id, name, `${height.toFixed(2)} m 实体障碍；${id === 'blocked' ? '超出手部可达高度时应拒绝攀上。' : '靠近后尝试跨越，动作由碰撞几何识别。'}`, [x, .03, 47], 'traverse'));
  }
  add('cw-crouch-roof', -58, 57, 3.4, .2, 4, blue, 1.35);
  for (const side of [-1, 1]) add(`cw-crouch-side-${side}`, -58 + side * 1.575, 57, .25, 1.35, 4, '#84979e');
  // Capsule clearance matches the original 0.85 m corridor and 1.10 m door.
  for (const side of [-1, 1]) {
    add(`cw-narrow-${side}`, -5 + side * .7, 51, .55, 2.7, 8, '#84979e');
    add(`cw-door-${side}`, -5 + side * 1.575, 40, 2.05, 3, .4, '#a1afb0');
  }
  add('cw-door-lintel', -5, 40, 1.1, .95, .4, blue, 2.05);
  trials.push(trial('crouch', '蹲姿净空', '1.35 m 顶板允许原 1.32 m 蹲姿胶囊通过，并阻止站立。', [-58, .03, 61], 'crouch'));
  trials.push(trial('narrow-door', '门洞通行', '穿过净宽 1.10 m、净高 2.05 m 的实体门框。', [-5, .03, 43], 'run'));
  trials.push(trial('narrow-corridor', '窄巷通行', '沿净宽 0.85 m 的走廊移动，检查沿墙滑动和相机避让。', [-5, .03, 57], 'run'));
  add('cw-light-landing', -60, 69, 3.5, .7, 3, mint);
  add('cw-heavy-landing', -53, 69, 3.5, 2.2, 3, amber);
  add('cw-catch-launch', -42, 64, 4, 3, 5, '#a77962');
  add('cw-catch-target', -42, 55.6, 4, 3.4, 4, amber);
  add('cw-far-launch', -29, 66, 4, 3, 4, '#a77962');
  add('cw-far-target', -29, 54, 4, 3.4, 4, '#b98480');
  // Source 22 cm steps stay below the tuned 27 cm automatic step limit.
  for (let i = 0; i < 10; i++) add(`cw-stair-${i}`, -18, 58 + (i + .5) * .6, 3.5, (i + 1) * .22, .6, '#a9bab2');
  add('cw-stair-landing', -18, 66, 4, 2.2, 4, '#9bacb1');
  boxes.push(ramp('cw-ramp', -9, 65, 4, 8.2, 2.2));
  add('cw-ramp-landing', -9, 71.1, 4, 2.2, 4, '#9bacb1');
  trials.push(
    trial('light-landing', '轻落地', '从 0.70 m 低台走落，比较移动落地与原地站稳。', [-60, .73, 68.8], 'drop'),
    trial('heavy-landing', '重落地', '从 2.20 m 高台走落，冲击速度决定落地缓冲。', [-53, 2.23, 68.8], 'drop'),
    trial('air-catch', '空中抓沿', '从 3 m 平台跑跳到前方可达边缘，检查空中抓沿与爬上。', [-42, 3.03, 64.5], 'jump'),
    trial('far-gap', '远距拒绝', '前方 8 m 间隙超出抓沿范围；落入恢复地面后可自由返回。', [-29, 3.03, 66], 'jump'),
    trial('stairs', '连续台阶', '十级 0.22 m 台阶连接 2.20 m 平台，可直接行走登顶。', [-18, .03, 56.5], 'stair', 0),
    trial('ramp', '连续坡道', '沿实体坡面登上 2.20 m 平台，检查贴地与下坡。', [-9, .03, 59.5], 'run', 0),
    trial('movement', '起停与掉头', '在开放长道练习起步、急停、慢走、跑动和方向反转。', [-7, .03, -25], 'turn', 0),
    trial('jump', '原地跳与跑跳', '原地起跳或移动中起跳；下落与落地由物理接地触发。', [8, .03, -15], 'jump', 0),
    trial('push', '动态货箱', '走入六个动态货箱，检查推动、碰撞与堆叠。', [35, .03, -2], 'push', 0),
  );

  // Source aquatic module: only X/Z translation (+31, +43); heights unchanged.
  const aq = (id: string, x: number, z: number, w: number, h: number, d: number, color: string, y = 0) => add(`cw-aq-${id}`, x + 31, z + 43, w, h, d, color, y);
  aq('west-deck', -25.5, -4, 13, 4.2, 46, '#bfc9c0', -4);
  aq('east-deck', 17.5, -4, 29, 4.2, 46, '#bfc9c0', -4);
  aq('south-deck', 0, 26, 64, 4.2, 14, '#bfc9c0', -4);
  aq('north-deck', 0, -30, 64, 4.2, 6, '#bfc9c0', -4);
  aq('pool-bottom', -8, -4, 22, .4, 46, '#8ab7b5', -4);
  aq('shallow-shelf', -8, 15.5, 22, 3.5, 7, '#a4cecb', -4);
  aq('entry-step-1', -8, 18.75, 5, 3.95, .5, '#c2ded4', -4);
  aq('entry-step-2', -8, 18.25, 5, 3.7, .5, '#b4d4c9', -4);
  const slope = Math.atan2(3.1, 12);
  boxes.push(block('cw-aq-depth-ramp', [23, -2.05 - .09 * Math.cos(slope), 49], [22, .18, Math.hypot(12, 3.1)], '#8ab7b5', [-slope, 0, 0]));
  aq('low-island', -1, -12, 4, 4.2, 6, '#b9d2c7', -4);
  aq('island-return', 2, -12, 2, .28, 2, '#b9d2c7', -.08);
  aq('unreachable-bank', -.5, -22, 7, 7.8, 4, '#6b878c', -4);
  aq('dry-climb', 17, -15, 5, 2.2, 4, amber, .2);
  aq('water-drop-deck', -16.5, -24, 21, .35, 3.5, '#d4d3bf', 5.85);
  aq('water-drop-support', -25, -24, 3, 5.65, 3, '#79949b', .2);
  aq('water-drop-stair-landing', -25, -22, 3, .35, 2, '#a8babc', 5.85);
  for (let i = 0; i < 28; i++) aq(`water-stair-${i}`, -25, -9.8 - (i + .5) * .4, 2.6, 6 * (i + 1) / 28, .4, '#a7bfc0', .2);
  for (const [index, height] of [3, 6, 10].entries()) {
    const x = 9 + index * 9, count = Math.ceil(height / .22);
    aq(`dry-drop-${height}`, x, 10, 4, height, 4, [mint, amber, violet][index]!, .2);
    for (let i = 0; i < count; i++) aq(`dry-stair-${height}-${i}`, x, 12 + (count - i - .5) * .36, 2.4, height * (i + 1) / count, .36, '#a9bab2', .2);
    paint(`cw-drop-lane-${height}`, x + 31, 47.3, 5.5, 6.2, [mint, amber, violet][index]!, .215);
    trials.push(trial(`drop-${height}`, `${height} 米落台`, `净落差 ${height} m；从前缘走落，背后原 0.22 m 级距楼梯可返回。`, [x + 31, height + .23, 52.1], 'drop'));
  }
  for (const x of [16, 21, 26]) paint(`cw-swim-lane-${x}`, x, 30, .1, 25.6, '#377e89', -3.585);
  trials.push(
    trial('wade', '涉水到游泳', '沿原 12 m 实体缓坡从 0.50 m 浅水走入 3.60 m 深水，返回时恢复行走。', [23, .23, 63.7], 'swim'),
    trial('swim', '深水游泳', '按相机方向游动，松键保持水中待机；可切换游泳风格。', [21, -1.12, 40], 'swim'),
    trial('swim-exit', '游泳上岸', '游向高出水面 0.20 m 的低岸，尝试攀上；右侧步桥连接陆地。', [30, -1.12, 37.3], 'swim'),
    trial('high-bank', '高岸拒绝', '3.80 m 高岸超出可达高度，应保持在水中。', [30.5, -1.12, 26.8], 'swim'),
    trial('water-drop', '高处入水', '从水面上 6.20 m 跳台走落进入深水，检查水花、阻尼和游泳恢复。', [20, 6.23, 19.7], 'drop', 0),
    {...trial('tall-stairs', '高台连续楼梯', '46 级原尺寸窄台阶通往 10 m 高台；慢走检查连续上阶。', [57.9, .23, 72], 'stair'),completion:{minY:10,maxZ:54}},
    trial('shore-climb', '岸边陆地攀爬', '在岸上 2.20 m 高墙对照陆地和游泳上岸动作。', [48, .23, 33.2], 'traverse'),
  );
  const regions: MapRegion[] = [
    { id: 'cw-staging', name: '01 / 车辆准备区', description: '宽阔停车与地面车辆换乘', center: [0, 0, -56], size: [82, 38], color: '#ddb573', modes: groundModes },
    { id: 'cw-court', name: '02 / 驾驶与移动', description: '起停、掉头、跳跃、绕桩与动态货箱', center: [23, 0, -13], size: [80, 29], color: mint, modes: groundModes },
    { id: 'cw-actions', name: '03 / 动作与交互工坊', description: '翻滚 · 滑铲 · 匍匐 · 拾取搬运 · 坐姿 · 壁面与梯子', center: [-32, 0, 8], size: [36, 36], color: amber, modes: ['character'] },
    { id: 'cw-traversal', name: '04 / 人物越障与落地', description: '四档障碍、净空、窄巷、抓沿、坡道与楼梯', center: [-33, 0, 53], size: [62, 43], color: blue, modes: ['character'] },
    { id: 'cw-aquatic', name: '05 / 涉水与游泳', description: '浅滩、深水泳道、低岸上岸、高岸拒绝与入水跳台', center: [23, .2, 39], size: [22, 46], color: '#62d6d1', modes: ['character'] },
    { id: 'cw-drops', name: '06 / 高台下落', description: '3 / 6 / 10 m 高台与原尺寸返回楼梯', center: [49, .2, 54], size: [27, 43], color: violet, modes: ['character'] },
  ];
  return {
    id: 'character-workshop', name: '人物 · 综合动作工坊', description: '完整人物 3C、真实动作交互、越障、攀爬、游泳与落地实验；南侧保留地面车辆换乘场。',
    bounds: { min: [-70, -12, -80], max: [70, 60, 80] }, boxes,
    water: [{ id: 'cw-pool', min: [12, -3.6, 16], max: [34, 0, 62], surface: 0 }],
    regions, interactions: station.interactions, climbSurfaces, characterTrials: trials,
    looseCrates: Array.from({ length: 6 }, (_, i) => ({ id: `cw-crate-${i}`, position: [34.3 + i % 3 * .75, .325 + Math.floor(i / 3) * .67, 3] as Vec3, size: .65 })),
    playerSpawn: [-32, .03, 23],
    spawns: [
      { id: 'prepare-cw-actions', name: '动作工坊入口', position: [-32, .03, 23], yaw: Math.PI, regionId: 'cw-actions' },
      { id: 'prepare-cw-staging', name: '地面车辆换乘', position: [-40, .03, -36], yaw: 0, regionId: 'cw-staging' },
      { id: 'prepare-cw-court', name: '驾驶与起停空地', position: [8, .03, -25], yaw: 0, regionId: 'cw-court' },
      { id: 'prepare-cw-traversal', name: '越障测试入口', position: [-58, .03, 47], yaw: Math.PI, regionId: 'cw-traversal' },
      { id: 'prepare-cw-aquatic', name: '浅滩入水入口', position: [23, .23, 63.7], yaw: Math.PI, regionId: 'cw-aquatic' },
      { id: 'prepare-cw-drops', name: '高台实验入口', position: [40, .23, 46], yaw: 0, regionId: 'cw-drops' },
    ],
  };
}

/** Compact representative course in the campus's unused west courtyard. */
export function createCampusCharacterCourse() {
  const boxes: EnvironmentBox[] = [], station = interactionStation('campus-human', -140, 65);
  boxes.push(...station.boxes);
  const add = (id: string, x: number, z: number, w: number, h: number, d: number, color: string, base = 0) =>
    boxes.push(block(`campus-human-${id}`, [x, base + h / 2, z], [w, h, d], color));
  add('vault', -150, 49, 4.2, .8, .8, mint);
  add('mantle', -142, 49, 4.2, 1.4, 2.8, blue);
  add('ledge', -134, 49, 4.2, 2.15, 3, amber);
  add('crouch-roof', -151, 65, 3.4, .2, 4, blue, 1.35);
  add('slide-beam', -141, 71, 4.2, .45, 1.4, blue, 1.05);
  add('climb-wall', -126, 49, 7, 3, 1.8, violet);
  for (let i = 0; i < 7; i++) add(`stair-${i}`, -126, 60 + (i + .5) * .6, 3, (i + 1) * .22, .6, '#a9bab2');
  const climbSurfaces: MapClimbSurface[] = [{ id: 'campus-human-wall', colliderId: 'campus-human-climb-wall', kind: 'wall', center: [-127, 0, 49.9], normal: [0, 0, 1], width: 4, minY: 0, maxY: 3 }];
  const characterTrials = [
    trial('campus-vault', '园区低栏翻越', '0.80 m 低栏，体验人物几何越障。', [-150, .03, 52], 'traverse'),
    trial('campus-mantle', '园区宽台攀上', '1.40 m 宽台，体验攀上和落地。', [-142, .03, 52.5], 'traverse'),
    trial('campus-ledge', '园区高墙攀上', '2.15 m 高墙，体验真实高墙动作。', [-134, .03, 52.5], 'traverse'),
    trial('campus-pickup', '园区拾取搬运', '桌面与锚点保留原始人物动作标定。', [-145, .03, 59.35], 'pickup'),
    trial('campus-sit', '园区坐姿交互', '交互坐下，再次交互或跳跃起身。', [-135, .03, 58.65], 'sit', 0),
    trial('campus-crouch', '园区蹲姿净空', '1.35 m 低顶，只允许蹲姿通过。', [-151, .03, 69], 'crouch'),
    trial('campus-slide', '园区低梁滑铲', '助跑穿过 1.05 m 低梁。', [-141, .03, 75], 'slide'),
    trial('campus-wall', '园区壁面攀爬', '上下与横向攀爬 3 m 实体墙面。', [-127, .03, 50.62], 'surface'),
    trial('campus-stairs', '园区连续台阶', '0.22 m 级距保留原人物自动上阶手感。', [-126, .03, 58.5], 'stair', 0),
  ];
  const region: MapRegion = { id: 'character-course', name: '10 / 人物动作场', description: '翻越 · 攀上 · 蹲行 · 滑铲 · 交互 · 壁面 · 台阶', center: [-140, 0, 61], size: [38, 36], color: mint, modes: groundModes };
  return { boxes, interactions: station.interactions, climbSurfaces, characterTrials, region,
    spawn: { id: 'prepare-character-course', name: '人物动作场', position: [-150, .03, 76] as Vec3, yaw: Math.PI, regionId: region.id } };
}
