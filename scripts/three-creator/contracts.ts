import { createHash } from 'node:crypto';
import type { WorldCommand } from '@worldkit/three';
import { WORLD_COMMAND_SCHEMA } from './command-schema.js';
import { objectSchema } from './schema-helpers.js';
export { objectSchema } from './schema-helpers.js';

export const THREE_CREATOR_VERSION = '0.3.0-experimental';
export type CreatorProfile = 'three-raw' | 'three-sdk';
export type Project = { schemaVersion: 1; assetIds: string[] };
export type EpisodeStep = {
  commands?: WorldCommand[];
  lifecycle?: 'start' | 'pause' | 'reset';
  keysDown?: string[];
  keysUp?: string[];
  durationSeconds: number;
  pointerDrag?: { deltaXPixels: number; deltaYPixels: number; button?: 'left' | 'middle' | 'right' };
};
export type Episode = {
  schemaVersion: 1 | 2;
  steps: EpisodeStep[];
  targets: { id: string; positionMetersXYZ: [number, number, number]; toleranceMeters: number }[];
};
export const KEY_NAMES = ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift', 'ShiftLeft', 'ShiftRight', 'Space', 'e', 'E', 'r', 'R'];
const number = { type: 'number' };
const keys = { type: 'array', items: { type: 'string', enum: KEY_NAMES }, maxItems: 20 };
export const PROJECT_SCHEMA = objectSchema({ schemaVersion: { const: 1 }, assetIds: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, maxItems: 64 } }, ['schemaVersion', 'assetIds']);
export const EPISODE_SCHEMA = { ...objectSchema({
  schemaVersion: { enum: [1, 2] },
  steps: { type: 'array', minItems: 1, maxItems: 1000, items: objectSchema({
    keysDown: keys, keysUp: keys,
    commands: { type: 'array', items: WORLD_COMMAND_SCHEMA, maxItems: 32 },
    lifecycle: { enum: ['start', 'pause', 'reset'] },
    durationSeconds: { type: 'number', minimum: 0, maximum: 300 },
    pointerDrag: objectSchema({ deltaXPixels: number, deltaYPixels: number, button: { enum: ['left', 'middle', 'right'] } }, ['deltaXPixels', 'deltaYPixels']),
  }, ['durationSeconds']) },
  targets: { type: 'array', maxItems: 100, items: objectSchema({
    id: { type: 'string', minLength: 1 },
    positionMetersXYZ: { type: 'array', items: number, minItems: 3, maxItems: 3 },
    toleranceMeters: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
  }, ['id', 'positionMetersXYZ', 'toleranceMeters']) },
}, ['schemaVersion', 'steps', 'targets']), allOf: [{ if: { properties: { schemaVersion: { const: 1 } } }, then: { properties: { steps: { items: { not: { anyOf: [{ required: ['commands'] }, { required: ['lifecycle'] }] } } } } } }] };
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

export type PreviewInput = {
  keys?: string[];
  durationSeconds?: number;
  click?: { xPixels: number; yPixels: number };
  pointerDrag?: { deltaXPixels: number; deltaYPixels: number; button?: 'left' | 'middle' | 'right' };
  wheel?: { deltaXPixels: number; deltaYPixels: number };
};
const pixels = { type: 'number', minimum: -8192, maximum: 8192 };
export const PREVIEW_INPUT_SCHEMA = objectSchema({
  keys: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 40 }, uniqueItems: true, maxItems: 20 },
  durationSeconds: { type: 'number', minimum: 0, maximum: 15 },
  click: objectSchema({ xPixels: { type: 'number', minimum: 0, maximum: 959 }, yPixels: { type: 'number', minimum: 0, maximum: 539 } }, ['xPixels', 'yPixels']),
  pointerDrag: objectSchema({ deltaXPixels: pixels, deltaYPixels: pixels, button: { enum: ['left', 'middle', 'right'] } }, ['deltaXPixels', 'deltaYPixels']),
  wheel: objectSchema({ deltaXPixels: pixels, deltaYPixels: pixels }, ['deltaXPixels', 'deltaYPixels']),
});
