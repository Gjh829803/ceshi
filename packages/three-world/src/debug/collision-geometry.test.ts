import {afterEach,expect,it} from 'vitest';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,Vector4} from 'three';
import {createWorld,type ThreeWorld} from '../index';
import {clipCollisionSegment} from './collision-overlay';
const worlds:ThreeWorld[]=[];
afterEach(()=>{for(const world of worlds.splice(0))world.dispose();});
it.each([false,true])('reads detached real collision geometry without ticking (humanoid=%s)',async humanoid=>{
 const world=await createWorld({navigation:false,assetDefinitions:{},...(humanoid?{humanoid:{
  map:{id:'debug',name:'Debug',description:'',bounds:{min:[-20,-5,-20] as const,max:[20,20,20] as const},boxes:[{id:'floor',position:[0,-.5,0] as const,size:[40,1,40] as const}],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0] as const},character:{instanceId:'person',object:new Group()},vehicles:[],
 }}:{})});worlds.push(world);
 world.addEntity({id:'box',role:'obstacle',object:new Mesh(new BoxGeometry(2,2,2),new MeshBasicMaterial()),physics:{kind:'fixed',shape:'box'}});
 const before=world.snapshot(),first=world.inspectCollisionGeometry();
 expect(first.segmentCount).toBeGreaterThan(0);expect(first.verticesWorldMeters.length).toBe(first.segmentCount*6);expect(first.colorsRGBA.length).toBe(first.segmentCount*8);
 expect(world.snapshot()).toEqual(before);
 const original=first.verticesWorldMeters[0];first.verticesWorldMeters[0]=100000;
 expect(world.inspectCollisionGeometry().verticesWorldMeters[0]).toBe(original);
 const bounded=world.inspectCollisionGeometry(1);expect(bounded.segmentCount).toBe(1);expect(bounded.omittedSegments).toBe(first.segmentCount-1);
 expect(()=>world.inspectCollisionGeometry(0)).toThrow('DEBUG_COLLISION_LIMIT_INVALID');
});
it('clips collision lines at screen and near planes rather than drawing across the camera',()=>{
 const clipped=clipCollisionSegment(new Vector4(-2,0,0,1),new Vector4(2,0,0,1))!;
 expect(clipped.map(v=>v.x/v.w)).toEqual([-1,1]);
 const crossing=clipCollisionSegment(new Vector4(0,0,-2,1),new Vector4(0,0,0,1))!;
 expect(crossing[0].z/crossing[0].w).toBe(-1);
 expect(clipCollisionSegment(new Vector4(0,0,0,-1),new Vector4(0,0,1,-1))).toBeNull();
});
