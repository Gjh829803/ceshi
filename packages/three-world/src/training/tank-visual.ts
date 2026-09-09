import type {Object3D} from 'three';
import {TANK_GEOMETRY,type TankState} from './tank';

/** Sample distance around the belt. Bottom, front arc, top, rear arc. */
export function tankTrackPoint(distance:number):{y:number;z:number;angle:number}{
  const r=TANK_GEOMETRY.trackRadius,l=TANK_GEOMETRY.trackStraightLength,p=2*l+2*Math.PI*r;
  let d=((distance%p)+p)%p;
  if(d<l)return {y:.85-r,z:-l/2+d,angle:0};d-=l;
  if(d<Math.PI*r){const a=d/r;return {y:.85-r*Math.cos(a),z:l/2+r*Math.sin(a),angle:-a};}d-=Math.PI*r;
  if(d<l)return {y:.85+r,z:l/2-d,angle:-Math.PI};d-=l;
  const a=d/r;return {y:.85+r*Math.cos(a),z:-l/2-r*Math.sin(a),angle:-Math.PI-a};
}
/** Idempotent projection of fixed/interpolated state; captures do not roll tracks. */
export function sampleTankVisual(root:Object3D,state:TankState):void {
  const turret=root.getObjectByName('tank.turret'),gun=root.getObjectByName('tank.gun');
  if(turret)turret.rotation.y=state.turretYaw;if(gun)gun.rotation.x=-state.gunElevation;
  const length=2*TANK_GEOMETRY.trackStraightLength+2*Math.PI*TANK_GEOMETRY.trackRadius;
  for(const [side,travel] of [['left',state.leftTravel],['right',state.rightTravel]] as const){
    root.getObjectByName(`tank.track.${side}`)?.children.forEach((link,i,links)=>{
      const p=tankTrackPoint(i*length/links.length-travel);link.position.set(0,p.y,p.z);link.rotation.set(p.angle,0,0);
    });
    for(let i=0;i<7;i++){const wheel=root.getObjectByName(`tank.roller.${side}.${i}`);if(wheel)wheel.rotation.x=travel/.6;}
  }
}
