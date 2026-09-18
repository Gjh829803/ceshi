import type {humanoid} from '@worldkit/three';
import subjects from '../../config/generated/subjects.json';
import modelRecords from '../../config/generated/models.json';
import placements from '../../config/scene-placements.json';

type Placement = Pick<humanoid.VehicleSpec, 'spawn' | 'yaw' | 'color'> & {
  dockingPorts?: NonNullable<humanoid.VehicleSpec['spaceFlight']>['dockingPorts'];
};
type ModelFacts = {roadCushion?: {center: [number, number, number]; size: [number, number, number]}; sockets?: Record<string, [number, number, number]>};
type ModelSockets = {
  [Id in keyof typeof modelRecords as typeof modelRecords[Id] extends {sockets: object} ? Id : never]:
    typeof modelRecords[Id] extends {sockets: infer Sockets}
      ? {[Socket in keyof Sockets]: [number, number, number]} : never;
};

/** Library parameters plus the calibration scene's instance placement. */
export function readSubjectSpec(id: string): humanoid.VehicleSpec {
  const parameters = (subjects as unknown as Record<string, humanoid.VehicleSpec>)[id];
  const placement = (placements as unknown as Record<string, Placement>)[id];
  if (!parameters || !placement) throw new Error(`Unknown preset subject: ${id}`);
  const {dockingPorts, ...scene} = structuredClone(placement);
  const spec = {...structuredClone(parameters), ...scene};
  if (dockingPorts && spec.spaceFlight) spec.spaceFlight.dockingPorts = dockingPorts;
  return spec;
}

export const SUBJECT_IDS = Object.keys(subjects);
export function readModelFacts(id: string): ModelFacts {
  const model = (modelRecords as unknown as Record<string, ModelFacts>)[id];
  if (!model) throw new Error(`Missing preset model facts: ${id}`);
  return structuredClone(model);
}
export function readModelSockets<Id extends keyof ModelSockets>(id: Id): ModelSockets[Id] {
  const sockets = readModelFacts(id).sockets;
  if (!sockets) throw new Error(`Missing preset model sockets: ${id}`);
  for (const [name, position] of Object.entries(sockets)) {
    if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite))
      throw new Error(`Invalid preset model socket: ${id}/${name}`);
  }
  return sockets as ModelSockets[Id];
}
