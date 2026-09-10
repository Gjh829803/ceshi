import type {humanoid} from '@worldkit/three';
type Powertrain=humanoid.PowertrainConfig;
// Authored engine torque in N·m; the SDK owns gearing, braking and integration.
const engine=(torque:number,finalDrive:number,ratios:readonly number[],dragArea:number):Powertrain=>({
  idleRpm:850,maxRpm:6200,upshiftRpm:5200,downshiftRpm:2100,
  torqueCurve:[[850,torque*.65],[1800,torque*.9],[3200,torque],[4500,torque*.95],[6200,torque*.65]],
  forwardRatios:ratios,reverseRatio:3.3,finalDrive,efficiency:.88,shiftSeconds:.38,engineBrakeTorque:torque*.15,
  dragArea,rollingResistance:.018,boostTorqueMultiplier:1.25,
});
export const ATV_POWERTRAIN=engine(150,4.1,[3.8,2.3,1.55,1.1,.85],.65);
export const BUS_POWERTRAIN={...engine(220,4.5,[3.8,2.3,1.55,1.1,.85],3.5),boostTorqueMultiplier:1};
export const TANK_POWERTRAIN=engine(2400,8,[3.8,2.3,1.55,1.1,.85],8);
export const JET_POWERTRAIN=engine(300,2,[1.5],.6);
export const SUB_POWERTRAIN=engine(130,2,[1.5],2);

