/** Private compatibility guard. Authored terrain is supplied through EnvironmentQueries. */
export interface SweepPoint {x:number;y:number;z:number}
function missing():never{throw new Error('TRAINING_ENVIRONMENT_REQUIRED');}
export function groundHeight(_x:number,_z:number):number{return missing();}
export function surfaceHeight(_x:number,_z:number):number{return missing();}
export function supportHeight(_x:number,_z:number,_radius=0,_afloat=false):number{return missing();}
export function wetHeight(_x:number,_z:number):boolean{return missing();}
export function footprintWet(_x:number,_z:number,_radius:number):boolean{return missing();}
export function recoverTerrainOverlap(_from:SweepPoint,_radius:number,_stepHeight=.45,_bottomOffset=0):{x:number;z:number}{return missing();}
export function sweepTerrainXZ(_from:SweepPoint,_to:SweepPoint,_radius:number,_stepHeight=.45,_afloat=false,_bottomOffset=0):{x:number;z:number;hitX:boolean;hitZ:boolean}{return missing();}
export function validExit(_x:number,_y:number,_z:number,_radius=.55):boolean{return missing();}
