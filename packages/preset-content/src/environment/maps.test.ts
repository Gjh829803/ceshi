import {expect,it} from 'vitest';
import {Box3,Group,Mesh,MeshBasicMaterial,Vector3} from 'three';
import {SPECS,type VehicleSpec} from '../config';
import {buildAircraftShell} from '../vehicles/aircraft/shell';
import {getMap} from './maps';
import type {MapSpawn} from './types';

function aircraftBounds(spec:VehicleSpec,spawn:MapSpawn):Box3 {
 const root=new Group(),paint=new MeshBasicMaterial();
 buildAircraftShell(root,paint,paint,spec.aircraftSubtype);
 root.position.fromArray(spawn.position);root.rotation.y=spawn.yaw;root.updateMatrixWorld(true);
 // Include actual wings as well as the collision envelope; glider wings are
 // wider than the powered-aircraft envelope inherited by the preset.
 const bounds=new Box3().setFromObject(root);
 const half=new Vector3(...spec.envelope.halfExtents),offset=new Vector3(...spec.envelope.offset);
 bounds.union(new Box3(offset.clone().sub(half),offset.clone().add(half)).applyMatrix4(root.matrixWorld));
 root.traverse(node=>{if(node instanceof Mesh){node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();}});
 return bounds;
}

it.each(['campus','aircraft-training'])('parks the glider clear of neighbouring aircraft in %s',mapId=>{
 const map=getMap(mapId),spec=SPECS.find(s=>s.id==='glider')!,spawn=map.spawns.find(s=>s.vehicleId===spec.id)!;
 expect(spec).toMatchObject({mode:'plane',aircraftSubtype:'glider'});
 expect(spawn.position[1]).toBe(0);
 const glider=aircraftBounds(spec,spawn).expandByScalar(1);
 for(const other of SPECS.filter(s=>s.mode==='plane'&&s.id!==spec.id&&!['paraglider','wingsuit','balloon'].includes(s.aircraftSubtype??''))){
  const otherSpawn=map.spawns.find(s=>s.vehicleId===other.id);
  if(otherSpawn)expect(glider.intersectsBox(aircraftBounds(other,otherSpawn)),`${mapId}: glider overlaps ${other.id} or leaves less than 1 m clearance`).toBe(false);
 }
 if(mapId==='campus')expect(spawn.position).toEqual(spec.spawn);
});
