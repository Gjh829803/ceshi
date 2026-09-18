import {testAssetResourceUrl} from '../../test-asset-library';
import {readFile} from 'node:fs/promises';
import {afterEach,beforeAll,expect,it} from 'vitest';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {EnvironmentQueries,initEnvironmentQueries} from '../environment/queries';
import type {EnvironmentBox,EnvironmentDefinition} from '../environment/types';
import {HumanoidController} from './controller';
import {motionSourceFromClip} from './source-character';
import type {MotionSource} from './motion';
const fixtures:{q:EnvironmentQueries;actor:HumanoidController}[]=[];
let sources:MotionSource[];
beforeAll(async()=>{await initEnvironmentQueries();sources=await Promise.all(['mantle-1m','climb-2m5','hurdle-1m'].map(async id=>{
 const bytes=await readFile(new URL(testAssetResourceUrl(`humanoid/source/gasp-research/${id}.experimental.glb`)));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 return motionSourceFromClip({id,clip:gltf.animations[0]!})!;
}));});
afterEach(()=>{for(const {q,actor} of fixtures.splice(0)){actor.dispose();q.dispose();}});
function fixture(side=1,options:{gap?:number;roof?:boolean;extra?:EnvironmentBox[];slide?:boolean;distance?:number}={}){
 const width=options.slide?4.2:3.4,post=options.slide?.14:.25,base=options.slide?1.05:1.35,roofHeight=options.slide?.45:.2,depth=options.slide?1.4:4;
 const boxes:EnvironmentBox[]=[{id:'floor',position:[0,-.5,0],size:[20,1,20]},
 ...[-1,1].map(sign=>({id:`side-${sign}`,position:[sign*(width-post)/2,base/2,0],size:[post,base,depth]} as EnvironmentBox)),
 ...(options.roof===false?[]:[{id:'roof',position:[0,base+roofHeight/2+(options.gap??0),0],size:[width,roofHeight,depth]} as EnvironmentBox]),...options.extra??[]];
 const map:EnvironmentDefinition={id:'composite',name:'Composite ledge',description:'',bounds:{min:[-10,-5,-10],max:[10,10,10]},boxes,water:[],regions:[],spawns:[],playerSpawn:[side*2.4,.03,0]};
 const q=new EnvironmentQueries(map),actor=new HumanoidController(q,'person');fixtures.push({q,actor});actor.resetAt(new Vector3(side*(width/2+(options.distance??.7)),.03,0),-side*Math.PI/2);actor.setAvailableClips(new Set(),sources);
 for(let n=0;n<30;n++){actor.step(new Vector3(),false,false,false);q.stepPhysics(1/60);}
 return {q,actor,direction:new Vector3(-side,0,0)};
}
it.each([-1,1])('climbs a separately colliding wall and roof from side %s with authored motion',side=>{
 const {q,actor,direction}=fixture(side),probe=actor.detect(direction)!;
 expect(probe.kind).not.toBe('blocked');expect(probe.top.y).toBeCloseTo(1.55,4);expect(probe.depth).toBeGreaterThan(3);
 expect(probe.collider.handle).toBe(q.colliderForId(`side-${side}`)!.handle);expect(probe.topCollider?.handle).toBe(q.colliderForId('roof')!.handle);
 expect(actor.begin(probe),actor.lastResult).toBe(true);
 for(let n=0;n<240&&actor.traversal;n++){actor.step(new Vector3(),false,false,false);q.stepPhysics(1/60);}
 expect(actor.snapshot().events.at(-1)).toMatchObject({result:'completed'});expect(actor.position.y).toBeCloseTo(1.59,2);expect(actor.world.intersectionWithShape(actor.body.translation(),{x:0,y:0,z:0,w:1},actor.capsule.shape,undefined,undefined,actor.capsule)).toBeNull();
});
it('still rejects a thin wall without a roof and does not join a disconnected ceiling',()=>{
 for(const options of [{roof:false},{gap:.2}]){const {actor,direction}=fixture(1,options),probe=actor.detect(direction)!;expect(probe.kind).toBe('blocked');expect(probe.depth).toBeLessThan(.55);}
});
it('keeps final headroom checks for a separate obstruction on the landing',()=>{
 const {actor,direction}=fixture(1,{extra:[{id:'ceiling',position:[.85,2.95,0],size:[.5,.2,2]}]});
 const probe=actor.detect(direction)!;expect(probe.kind).toBe('blocked');expect(probe.reason).toBe('落点胶囊空间被占用');
});
it('keeps intermediate sweep checks for unrelated geometry',()=>{
 const {actor,direction}=fixture(1,{extra:[{id:'overhang',position:[2.25,2.55,0],size:[.5,.15,2]}]});
 const probe=actor.detect(direction)!;expect(probe.kind).not.toBe('blocked');expect(actor.begin(probe)).toBe(false);expect(actor.lastResult).toBe('动画路径被其他障碍阻挡');
});

it('interrupts an active traversal when another collider moves into its path',()=>{
 const {q,actor,direction}=fixture(1,{extra:[{id:'moving-blocker',position:[8,3,0],size:[.4,3,2]}]}),probe=actor.detect(direction)!;
 expect(actor.begin(probe),actor.lastResult).toBe(true);
 const blocker=q.colliderForId('moving-blocker')!;blocker.setTranslation({x:probe.end.x,y:2.5,z:0});q.stepPhysics(1/60);
 for(let n=0;n<240&&actor.traversal;n++){actor.step(new Vector3(),false,false,false);q.stepPhysics(1/60);}
 expect(actor.snapshot().events.at(-1)).toMatchObject({result:'interrupted'});
});

it.each([-1,1])('climbs the actual 4.2 m slide beam voxel collider from touching side %s',side=>{
 const {q,actor,direction}=fixture(side,{slide:true,distance:.2951}),probe=actor.detect(direction)!;
 expect(probe.kind,probe.reason).not.toBe('blocked');expect(probe.top.y).toBeCloseTo(1.5,4);
 expect(probe.topCollider?.handle).toBe(q.colliderForId('roof')!.handle);
 expect(actor.begin(probe),actor.lastResult).toBe(true);
 for(let n=0;n<240&&actor.traversal;n++){actor.step(new Vector3(),false,false,false);q.stepPhysics(1/60);}
 expect(actor.snapshot().events.at(-1)).toMatchObject({result:'completed'});
});
