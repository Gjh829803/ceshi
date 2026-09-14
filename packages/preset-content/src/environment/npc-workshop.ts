import type {EnvironmentDefinition} from './types';

export const NPC_WORKSHOP_ID = 'npc-workshop';

/** Shared physical anchors; Playground supplies the actors and their demonstration intents. */
export function createNpcWorkshop(): EnvironmentDefinition {
  return {
    id: NPC_WORKSHOP_ID, name: 'NPC 交互试验场',
    description: '双 NPC 自动巡逻 · 切换操控 · 共享物品与双人座位',
    bounds: {min: [-20, -5, -20], max: [20, 20, 20]},
    boxes: [
      {id: 'npc-ground', position: [0, -.5, 0], size: [40, 1, 40]},
      {id: 'pickup-table', position: [0, .4245, 6.65], size: [1.8, .849, .68], rigidGroup: {id: 'pickup-table', massKg: 24}},
      {id: 'place-table', position: [-3.65, .4245, 6], size: [.68, .849, 1.8], rigidGroup: {id: 'place-table', massKg: 24}},
      {id: 'bench-seat', position: [0, .41, 11.51], size: [1.9, .1, .38]},
      ...[-.8, .8].map((x, i) => ({id: `bench-leg-${i}`, position: [x, .18, 11.51] as const, size: [.1, .36, .3] as const})),
    ],
    water: [],
    regions: [{id: 'npc-lab', name: 'NPC 交互区', description: '巡逻、搬运和座位共享', center: [0, 0, 5], size: [30, 26], color: '#91b6aa', modes: ['character']}],
    spawns: [{id: 'prepare-npc-lab', name: '观察起点', position: [0, .04, -3], yaw: 0, regionId: 'npc-lab'}],
    playerSpawn: [0, .04, -3],
    interactions: [
      {id: 'parcel', slotId: 'grip', label: '共享物品', kind: 'pickup', position: [.051, .914, 6.363], approach: [0, .02, 6], yaw: 0, size: [.13, .13, .13], massKg: .3},
      ...[-.6, .6].map((x, i) => ({id: i ? 'bench-right' : 'bench-left', slotId: i ? 'right' : 'left', label: i ? '右座位' : '左座位', kind: 'seat' as const,
        position: [x, .46, 11.51] as [number, number, number], approach: [x, .02, 12] as [number, number, number], yaw: 0,
        colliderIds: ['bench-seat', 'bench-leg-0', 'bench-leg-1']})),
    ],
  };
}
