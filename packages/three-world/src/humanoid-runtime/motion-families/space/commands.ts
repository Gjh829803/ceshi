import type {VehicleState} from '../../simulation';
import type {SpaceDriveMode} from './config';
/** 命令只能修改当前正在乘坐的太空载具；不会改变公共输入和其他大类。 */
export function setSpaceDriveMode(v:VehicleState|null|undefined,mode:SpaceDriveMode){
 if(!['assisted','inertial'].includes(mode))throw Error('SPACE_DRIVE_MODE_INVALID');
 if(v?.motion.family!=='space')throw Error('SPACE_VEHICLE_NOT_MOUNTED');
 v.motion.driveMode=mode;
}
export function requestSpaceDock(v:VehicleState|null|undefined,portId:string|null){
 if(v?.motion.family!=='space')throw Error('SPACE_VEHICLE_NOT_MOUNTED');
 if(portId===null){v.motion.docking=null;return;}
 const port=v.spec.spaceFlight!.dockingPorts?.find(p=>p.id===portId);
 if(!port)throw Error('SPACE_DOCK_PORT_UNKNOWN');
 v.motion.docking={portId,status:'approaching',elapsed:0,settled:0};
}
export function spaceTelemetry(v:VehicleState){
 if(v.motion.family!=='space')return null;
 const s=v.motion,c=v.spec.spaceFlight!;
 return {driveMode:s.driveMode,massKilograms:c.massKilograms,angularVelocityRadiansPerSecondXYZ:s.body.angularVelocity.toArray(),thrustNewtonsXYZ:s.appliedForceNewtonsXYZ.toArray(),docking:s.docking?{...s.docking}:null,dockingPorts:c.dockingPorts?.map(p=>({id:p.id,name:p.name}))??[]};
}
