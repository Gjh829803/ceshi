import type {VehicleSpec} from '../../config';
export type SpaceDriveMode='assisted'|'inertial';
export interface SpaceDockPort {id:string;name:string;positionMetersXYZ:readonly[number,number,number];rotationXYZW:readonly[number,number,number,number];}
export interface SpaceFlightConfig {
 dockingPorts?:readonly SpaceDockPort[];
 massKilograms:number;
 thrustNewtonsXYZ:readonly[number,number,number];reverseThrustNewtons:number;
 torqueNewtonMetersXYZ:readonly[number,number,number];
 driveMode:SpaceDriveMode;hull:'box'|'disc';
 gravity?:{centerMetersXYZ:readonly[number,number,number];muMetersCubedPerSecondSquared:number;radiusMeters:number};
}
export const SPACE_FLIGHT_PRESETS:Readonly<Record<'shuttle'|'saucer',SpaceFlightConfig>>={
 shuttle:{massKilograms:2160,thrustNewtonsXYZ:[12000,16000,28000],reverseThrustNewtons:18000,torqueNewtonMetersXYZ:[14000,24000,10000],driveMode:'assisted',hull:'box'},
 saucer:{massKilograms:8450,thrustNewtonsXYZ:[24000,36000,60000],reverseThrustNewtons:36000,torqueNewtonMetersXYZ:[48000,80000,30000],driveMode:'assisted',hull:'disc'},
};
for(const p of Object.values(SPACE_FLIGHT_PRESETS)){Object.freeze(p.thrustNewtonsXYZ);Object.freeze(p.torqueNewtonMetersXYZ);Object.freeze(p);}Object.freeze(SPACE_FLIGHT_PRESETS);
export function spaceFlightConfig(spec:VehicleSpec):SpaceFlightConfig{
 const c=spec.spaceFlight??SPACE_FLIGHT_PRESETS.shuttle;
 const positive=(n:number)=>Number.isFinite(n)&&n>0;
 if(!['assisted','inertial'].includes(c.driveMode)||!['box','disc'].includes(c.hull)||
 ![c.massKilograms,c.reverseThrustNewtons].every(positive)||
 ![c.thrustNewtonsXYZ,c.torqueNewtonMetersXYZ].every(v=>Array.isArray(v)&&v.length===3&&v.every(positive)))throw Error('SPACE_FLIGHT_CONFIG_INVALID');
 if(c.gravity&&(![c.gravity.muMetersCubedPerSecondSquared,c.gravity.radiusMeters].every(positive)||c.gravity.centerMetersXYZ.length!==3||!c.gravity.centerMetersXYZ.every(Number.isFinite)))throw Error('SPACE_GRAVITY_INVALID');
 if(c.hull==='disc'&&Math.abs(spec.envelope.halfExtents[0]-spec.envelope.halfExtents[2])>1e-6)throw Error('SPACE_DISC_SHAPE_INVALID');
 if(c.dockingPorts){const ids=new Set<string>();for(const p of c.dockingPorts){if(!p.id||ids.has(p.id)||typeof p.name!=='string'||p.positionMetersXYZ?.length!==3||!p.positionMetersXYZ.every(Number.isFinite)||p.rotationXYZW?.length!==4||!p.rotationXYZW.every(Number.isFinite)||Math.abs(Math.hypot(...p.rotationXYZW)-1)>1e-4)throw Error('SPACE_DOCK_PORT_INVALID');ids.add(p.id);}}
 return structuredClone(c);
}
