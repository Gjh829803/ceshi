import * as T from 'three';
import {TANK_SPEC,TANK_SOCKETS} from './spec';
import {humanoid} from '@worldkit/three';
const {TANK_GEOMETRY}=humanoid;

/** Hollow hull and oversized enclosed driver compartment. No embedded rider. */
export function buildTankModel():T.Group {
  const root=new T.Group();root.name='tracked-humanoid-tank';
  const armor=new T.MeshStandardMaterial({color:TANK_SPEC.color,roughness:1});
  const edge=new T.MeshStandardMaterial({color:'#989b80',roughness:1});
  const dark=new T.MeshStandardMaterial({color:'#343c3d',roughness:1});
  const metal=new T.MeshStandardMaterial({color:'#737c7b',roughness:1});
  const box=(parent:T.Object3D,name:string,size:[number,number,number],p:[number,number,number],m:T.Material=armor)=>{
    const mesh=new T.Mesh(new T.BoxGeometry(...size),m);mesh.name=name;mesh.position.set(...p);parent.add(mesh);return mesh;
  };
  const cylinder=(parent:T.Object3D,name:string,r:number,h:number,p:[number,number,number],m:T.Material=armor)=>{
    const mesh=new T.Mesh(new T.CylinderGeometry(r,r,h,12),m);mesh.name=name;mesh.position.set(...p);parent.add(mesh);return mesh;
  };
  box(root,'hull.floor',[3.8,.16,8.4],[0,.8,0],dark);
  for(const side of [-1,1]){
    box(root,'hull.side',[.25,1.62,8.6],[side*1.96,1.58,0]);
    box(root,'track.skirt',[.85,.6,8.5],[side*2.39,1.85,0],edge);
    box(root,'track.fender',[1.13,.13,8.9],[side*2.3,2.18,0]);
  }
  box(root,'hull.rear',[3.9,1.65,.25],[0,1.6,-4.3]);
  box(root,'hull.nose',[3.9,1.16,.32],[0,1.39,4.28],edge).rotation.x=-.22;
  box(root,'engine.deck',[3.7,.18,4.8],[0,2.44,-1.8]);
  // Driver lives entirely inside this opening, beneath the roof and behind the visor.
  box(root,'cabin.roof',[3.7,.15,2.5],[0,2.63,2.3]);
  box(root,'cabin.front.lower',[3.7,.28,.18],[0,1.81,3.48]);
  box(root,'cabin.front.upper',[3.7,.25,.18],[0,2.5,3.48]);
  for(const side of [-1,1])box(root,'cabin.visor.side',[1.34,.425,.18],[side*1.18,2.1625,3.48]);
  box(root,'dashboard',[1.4,.13,.23],[0,1.8,3.0],dark);
  box(root,'seat.cushion',[.62,.12,.58],[0,1.27,2.1],dark);
  box(root,'seat.back',[.64,.64,.10],[0,1.64,1.89],dark);
  cylinder(root,'seat.support',.10,.35,[0,1.03,2.1],metal);
  for(const [name,position] of Object.entries(TANK_SOCKETS)){
    const socket=new T.Group();socket.name=name;socket.position.set(...position);root.add(socket);
    if(name.startsWith('control.hand')){
      cylinder(socket,'control.grip',.025,.10,[0,-.01,.02],dark);
      cylinder(socket,'control.stem',.012,.37,[0,-.23,.02],metal);
    }
    if(name.startsWith('control.foot'))box(socket,'pedal',[.16,.035,.24],[0,-.07,-.04],dark);
  }
  const g=TANK_GEOMETRY;
  const turret=new T.Group();turret.name='tank.turret';turret.position.set(0,g.turretY,g.turretZ);root.add(turret);
  cylinder(turret,'turret.ring',1.53,.3,[0,-.29,0],dark);
  const turretMesh=new T.Mesh(new T.CylinderGeometry(1.45,1.94,.96,8),armor);turretMesh.name='turret.armor';turretMesh.position.y=.3;turret.add(turretMesh);
  box(turret,'turret.rear',[2.7,.63,.55],[0,.2,-1.64],edge);
  cylinder(turret,'hatch.cover',.4,.10,[.65,.84,-.18],dark);
  const gun=new T.Group();gun.name='tank.gun';gun.position.set(0,g.gunY,g.gunZ);turret.add(gun);
  box(gun,'gun.mantlet',[.65,.62,.55],[0,0,.07],dark);
  const barrel=cylinder(gun,'gun.barrel',.14,g.barrelLength,[0,0,g.barrelLength/2],edge);barrel.rotation.x=Math.PI/2;
  const muzzle=cylinder(gun,'gun.muzzle',.19,.30,[0,0,g.barrelLength-.15],dark);muzzle.rotation.x=Math.PI/2;
  const muzzleSocket=new T.Group();muzzleSocket.name='socket.muzzle';muzzleSocket.position.z=g.barrelLength;gun.add(muzzleSocket);
  const turretSocket=new T.Group();turretSocket.name='socket.turret';turret.add(turretSocket);
  // Independent rollers and treads, with shared geometry/material resources.
  const linkGeometry=new T.BoxGeometry(.86,.075,.24),rollerGeometry=new T.CylinderGeometry(.60,.60,.62,16);
  for(const [side,suffix] of [[1,'left'],[-1,'right']] as const){
    const track=new T.Group();track.name=`tank.track.${suffix}`;track.position.x=side*g.trackHalfSpacing;root.add(track);
    for(let i=0;i<72;i++){const link=new T.Mesh(linkGeometry,dark);link.name=`link.${i}`;track.add(link);}
    for(let i=0;i<7;i++){const roller=new T.Group();roller.name=`tank.roller.${suffix}.${i}`;roller.position.set(side*g.trackHalfSpacing,.82,-3+i);root.add(roller);
      const wheel=new T.Mesh(rollerGeometry,metal);wheel.rotation.z=Math.PI/2;roller.add(wheel);}
  }
  humanoid.sampleTankVisual(root,humanoid.createTankState());
  return root;
}
