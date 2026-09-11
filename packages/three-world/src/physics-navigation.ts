import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import {exactBoxHalfExtents} from './physics-box';

export interface NavigationGeometry {readonly positions:Float32Array;readonly indices:Uint32Array}
const boxIndices=[0,3,2,0,2,1,4,5,6,4,6,7,3,7,6,3,6,2,0,1,5,0,5,4,1,2,6,1,6,5,0,4,7,0,7,3];

/** Read committed native geometry. Actors and dynamic props are handled by live collision. */
export function readNavigationGeometry(world:RAPIER.World,include:(collider:RAPIER.Collider)=>boolean):NavigationGeometry{
  const positions:number[]=[],indices:number[]=[],point=new Vector3(),rotation=new Quaternion();
  let count=0;
  world.colliders.forEach(collider=>{
    const body=collider.parent();
    if(!collider.isEnabled()||collider.isSensor()||body&&(!body.isEnabled()||body.isDynamic())||!include(collider))return;
    if(++count>4096)throw new Error('NAVIGATION_SOURCE_BUDGET_EXCEEDED');
    let vertices:readonly number[]|Float32Array,faces:readonly number[]|Uint32Array;
    const box=exactBoxHalfExtents(collider.shape);
    if(collider.shapeType()===RAPIER.ShapeType.Cuboid||box){
      const {x,y,z}=box?{x:box[0],y:box[1],z:box[2]}:collider.halfExtents()!;vertices=[-x,-y,-z,x,-y,-z,x,y,-z,-x,y,-z,-x,-y,z,x,-y,z,x,y,z,-x,y,z];faces=boxIndices;
    }else if(collider.shapeType()===RAPIER.ShapeType.TriMesh||collider.shapeType()===RAPIER.ShapeType.ConvexPolyhedron){
      vertices=collider.vertices();const triangles=collider.indices();if(!triangles)throw new Error('NAVIGATION_COLLIDER_TRIANGLES_UNAVAILABLE');faces=triangles;
    }else throw new Error(`NAVIGATION_COLLIDER_UNSUPPORTED: ${collider.shapeType()}`);
    if((indices.length+faces.length)/3>250_000)throw new Error('NAVIGATION_TRIANGLE_BUDGET_EXCEEDED');
    const offset=positions.length/3,translation=collider.translation();rotation.copy(collider.rotation());
    for(let n=0;n<vertices.length;n+=3){point.fromArray(vertices,n).applyQuaternion(rotation).add(translation);positions.push(point.x,point.y,point.z);}
    for(const index of faces)indices.push(index+offset);
  });
  return {positions:new Float32Array(positions),indices:new Uint32Array(indices)};
}
