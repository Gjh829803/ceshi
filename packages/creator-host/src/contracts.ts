import { createHash } from 'node:crypto';
import {humanoid, type WorldCommand} from '@worldkit/three';
import { WORLD_COMMAND_SCHEMA } from './schema/command-schema.js';
import { objectSchema } from './schema/schema-helpers.js';
export { objectSchema } from './schema/schema-helpers.js';

export const THREE_CREATOR_VERSION = '0.2.0-experimental';
export type CreatorProfile = 'three-raw' | 'three-sdk';
export type Project = { schemaVersion: 1; assetIds: string[] };
export type RoadVehicleDriveTarget = {
  vehicleId:string;
  positionWorldMetersXYZ:[number,number,number];
  maximumSpeedMetersPerSecond?:number;
  arrivalToleranceMeters?:number;
  stopAtTarget?:boolean;
};
export type TimedEpisodeStep = {
  commands?: WorldCommand[];
  lifecycle?: 'start' | 'pause' | 'reset';
  keysDown?: string[];
  keysUp?: string[];
  durationSeconds: number;
  timeoutSeconds?: never;
  driveTo?: never;
  pointerDrag?: { deltaXPixels: number; deltaYPixels: number; button?: 'left' | 'middle' | 'right' };
};
export type RoadEpisodeStep = {
  driveTo:RoadVehicleDriveTarget;
  /** Maximum wall time, not a minimum recording duration. */
  timeoutSeconds:number;
  durationSeconds?:never;
  commands?:never;
  lifecycle?:never;
  keysDown?:never;
  keysUp?:never;
  pointerDrag?:never;
};
export type EpisodeStep=TimedEpisodeStep|RoadEpisodeStep;
export const episodeStepBudget=(step:EpisodeStep):number=>step.driveTo?step.timeoutSeconds!:step.durationSeconds!;
export type Episode = {
  schemaVersion: 1 | 2;
  steps: EpisodeStep[];
  targets: { id: string; positionMetersXYZ: [number, number, number]; toleranceMeters: number }[];
};
export const KEY_NAMES = [...new Set([...humanoid.SUPPORTED_KEY_CODES, 'Escape', ...humanoid.SUPPORTED_KEY_CODES.flatMap(code=>
  /^Key[A-Z]$/.test(code)?[code.slice(3).toLowerCase(),code.slice(3)]:/^Digit[0-9]$/.test(code)?[code.slice(5)]:/^(Shift|Control|Alt)(Left|Right)$/.test(code)?[code.replace(/Left$|Right$/,'')]:[])])];
const number = { type: 'number' };
const keys = { type: 'array', items: { type: 'string', enum: KEY_NAMES }, maxItems: 20 };
export const PROJECT_SCHEMA = objectSchema({ schemaVersion: { const: 1 }, assetIds: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, maxItems: 64 } }, ['schemaVersion', 'assetIds']);
export const EPISODE_SCHEMA = { ...objectSchema({
  schemaVersion: { enum: [1, 2] },
  steps: { type: 'array', minItems: 1, maxItems: 1000, items: {...objectSchema({
    keysDown: keys, keysUp: keys,
    commands: { type: 'array', items: WORLD_COMMAND_SCHEMA, maxItems: 32 },
    lifecycle: { enum: ['start', 'pause', 'reset'] },
    durationSeconds: { type: 'number', minimum: 0, maximum: 300 },
    timeoutSeconds: { type: 'number', exclusiveMinimum: 0, maximum: 300 },
    driveTo: objectSchema({vehicleId:{type:'string',minLength:1},positionWorldMetersXYZ:{type:'array',items:number,minItems:3,maxItems:3},
      maximumSpeedMetersPerSecond:{type:'number',exclusiveMinimum:0,maximum:12},arrivalToleranceMeters:{type:'number',minimum:.25,maximum:5},stopAtTarget:{type:'boolean'}},['vehicleId','positionWorldMetersXYZ']),
    pointerDrag: objectSchema({ deltaXPixels: number, deltaYPixels: number, button: { enum: ['left', 'middle', 'right'] } }, ['deltaXPixels', 'deltaYPixels']),
  }, []), allOf:[{if:{required:['driveTo']},then:{required:['timeoutSeconds'],not:{anyOf:['durationSeconds','keysDown','keysUp','commands','lifecycle','pointerDrag'].map(key=>({required:[key]}))}},else:{required:['durationSeconds'],not:{required:['timeoutSeconds']}}}] } },
  targets: { type: 'array', maxItems: 100, items: objectSchema({
    id: { type: 'string', minLength: 1 },
    positionMetersXYZ: { type: 'array', items: number, minItems: 3, maxItems: 3 },
    toleranceMeters: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
  }, ['id', 'positionMetersXYZ', 'toleranceMeters']) },
}, ['schemaVersion', 'steps', 'targets']), allOf: [{ if: { properties: { schemaVersion: { const: 1 } } }, then: { properties: { steps: { items: { not: { anyOf: [{ required: ['commands'] }, { required: ['lifecycle'] },{required:['driveTo']}] } } } } } }] };
export function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') { try { return JSON.stringify(error); } catch { /* fall through */ } }
  return String(error);
}
export function profileFrom(value: unknown): CreatorProfile {
  if (value !== 'three-raw' && value !== 'three-sdk') throw new Error('THREE_PROFILE_INVALID: expected three-raw or three-sdk');
  return value;
}
