import {readSubjectSpec} from '../assets/subject-data';

function powertrain(id: string) {
  const spec = readSubjectSpec(id);
  const value = spec.wheelPhysics?.powertrain ?? spec.bodyPhysics?.powertrain;
  if (!value) throw new Error(`Missing preset powertrain: ${id}`);
  return value;
}
export const ATV_POWERTRAIN = powertrain('atv');
const busPowertrain = powertrain('bus');
const busBoost = busPowertrain.boostTorqueMultiplier;
if (typeof busBoost !== 'number' || !Number.isFinite(busBoost)) throw new Error('Missing bus boost torque multiplier');
export const BUS_POWERTRAIN = {...busPowertrain, boostTorqueMultiplier: busBoost};
export const TANK_POWERTRAIN = powertrain('tank');
export const JET_POWERTRAIN = powertrain('jetski');
export const SUB_POWERTRAIN = powertrain('observation-submarine');
