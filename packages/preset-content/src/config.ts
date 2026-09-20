import type {humanoid} from '@worldkit/three';
import {readSubjectSpec, SUBJECT_IDS} from './assets/subject-data';

export type Mode = humanoid.VehicleSpec['mode'];
export type VehicleArchetype = humanoid.VehicleSpec['archetype'];
export type CollisionEnvelope = humanoid.VehicleSpec['envelope'];
export type VehicleSpec = humanoid.VehicleSpec;

/** Specialized controller families share movement modes but have distinct tuning. */
export function vehicleControlFamily(spec: Pick<VehicleSpec, 'mode' | 'archetype' | 'flyingCreature' | 'aircraftSubtype'> | undefined): string {
  if (spec?.flyingCreature) return 'flying-creature';
  if (spec?.aircraftSubtype === 'glider') return 'glider';
  const archetype = spec?.archetype;
  return archetype && ['unicycle', 'raft', 'jetski', 'atv'].includes(archetype)
    ? archetype : spec?.mode ?? 'character';
}

/** Generated asset facts combined with the independently owned control profile. */
export const SPECS: VehicleSpec[] = SUBJECT_IDS.map(readSubjectSpec);
export const START: [number, number, number] = [-24, 0, 55];
export const WORLD_LIMIT = 490;
export const WATER = -2;
export const DEPTH = -44;
export const ZONES = [
  {name:'载具整备区',short:'GARAGE',x:-18,z:55},
  {name:'高速环道',short:'CIRCUIT',x:-60,z:220},
  {name:'坡道与高台',short:'ELEVATION',x:-110,z:132},
  {name:'深水测试区',short:'DEEP WATER',x:300,z:20},
  {name:'起降跑道',short:'AIRFIELD',x:-285,z:-90},
  {name:'滑翔发射台',short:'LAUNCH',x:-130,z:-158},
];
