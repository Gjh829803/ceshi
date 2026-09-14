import {expect,it,vi} from 'vitest';
import {BoxGeometry,Matrix4,MeshBasicMaterial,Vector3} from 'three';
import {createInstancedParts} from './instanced-parts';

it('publishes bounds for every fixed instance without changing the source geometry',()=>{
 const geometry=new BoxGeometry(2,2,2),material=new MeshBasicMaterial();
 const positions=geometry.getAttribute('position').array.slice();
 const instances=createInstancedParts(geometry,material,[new Matrix4().makeTranslation(-5,0,0),new Matrix4().makeTranslation(5,0,0)]);
 try{
  expect(instances.boundingBox!.min.toArray()).toEqual([-6,-1,-1]);
  expect(instances.boundingBox!.max.toArray()).toEqual([6,1,1]);
  expect(instances.boundingSphere!.containsPoint(new Vector3(6,1,1))).toBe(true);
  expect(geometry.getAttribute('position').array).toEqual(positions);
 }finally{geometry.dispose();material.dispose();}
});

it('releases instance buffers once through shared geometry ownership or explicit disposal',()=>{
 const geometry=new BoxGeometry(),material=new MeshBasicMaterial();
 const a=createInstancedParts(geometry,material,[new Matrix4()]),b=createInstancedParts(geometry,material,[new Matrix4()]);
 const releasedA=vi.fn(),releasedB=vi.fn();a.addEventListener('dispose',releasedA);b.addEventListener('dispose',releasedB);
 a.dispose();geometry.dispose();geometry.dispose();
 expect(releasedA).toHaveBeenCalledTimes(1);expect(releasedB).toHaveBeenCalledTimes(1);
 material.dispose();
});
