import { createHash } from 'node:crypto';

export const THREE_CREATOR_VERSION = '0.1.0-experimental';
export type CreatorProfile = 'three-raw' | 'three-sdk';
export type Project = { schemaVersion: 1; assetIds: string[] };
export type EpisodeStep = {
  keysDown?: string[];
  keysUp?: string[];
  durationSeconds: number;
  pointerDrag?: { deltaXPixels: number; deltaYPixels: number; button?: 'left' | 'middle' | 'right' };
};
export type Episode = {
  schemaVersion: 1;
  steps: EpisodeStep[];
  targets: { id: string; positionMetersXYZ: [number, number, number]; toleranceMeters: number }[];
};
export const KEY_NAMES = ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift', 'ShiftLeft', 'ShiftRight', 'Space', 'e', 'E', 'r', 'R'];
export const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const number = { type: 'number' };
const keys = { type: 'array', items: { type: 'string', enum: KEY_NAMES }, maxItems: 20 };
export const PROJECT_SCHEMA = objectSchema({ schemaVersion: { const: 1 }, assetIds: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, maxItems: 64 } }, ['schemaVersion', 'assetIds']);
export const EPISODE_SCHEMA = objectSchema({
  schemaVersion: { const: 1 },
  steps: { type: 'array', minItems: 1, maxItems: 1000, items: objectSchema({
    keysDown: keys, keysUp: keys,
    durationSeconds: { type: 'number', minimum: 0, maximum: 300 },
    pointerDrag: objectSchema({ deltaXPixels: number, deltaYPixels: number, button: { enum: ['left', 'middle', 'right'] } }, ['deltaXPixels', 'deltaYPixels']),
  }, ['durationSeconds']) },
  targets: { type: 'array', maxItems: 100, items: objectSchema({
    id: { type: 'string', minLength: 1 },
    positionMetersXYZ: { type: 'array', items: number, minItems: 3, maxItems: 3 },
    toleranceMeters: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
  }, ['id', 'positionMetersXYZ', 'toleranceMeters']) },
}, ['schemaVersion', 'steps', 'targets']);
export function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export function profileFrom(value: unknown): CreatorProfile {
  if (value !== 'three-raw' && value !== 'three-sdk') throw new Error('THREE_PROFILE_INVALID: expected three-raw or three-sdk');
  return value;
}
