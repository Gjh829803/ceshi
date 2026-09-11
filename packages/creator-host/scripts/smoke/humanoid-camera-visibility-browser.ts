import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// Camera-only geometry harness using the exact runtime served by the playground.
const output=path.resolve('outputs/humanoid-camera-visibility/browser');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:640}}),errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(process.argv[2]??'http://127.0.0.1:5178/');
 await page.waitForFunction(()=>Boolean((window as any).playground?.getState().ready),{},{timeout:60000});
 await page.locator('#pauseButton').click();
 await page.evaluate(async()=>{
  const harnessUrl='/scripts/camera-harness-imports.ts';
  const {createWorld,T}=await import(harnessUrl);
  const canvas=document.createElement('canvas');document.body.replaceChildren(canvas);document.body.style.cssText='margin:0';
  const renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,640);
  const scene=new T.Scene();scene.background=new T.Color('#adc6cc');scene.add(new T.HemisphereLight(0xffffff,0x334455,3));
  const camera=new T.PerspectiveCamera(58,1.5,.08,200),person=new T.Group();
  const mesh=new T.Mesh(new T.CapsuleGeometry(.28,1.12,12,24),new T.MeshStandardMaterial({color:0xf79432}));mesh.position.y=.84;person.add(mesh);scene.add(person);
  const floor={id:'floor',position:[0,-.5,0],size:[100,1,100]};
  const map={id:'visibility',name:'Camera visibility',description:'',bounds:{min:[-50,-5,-50],max:[50,30,50]},boxes:[floor],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]};
  const world=await createWorld({scene,renderer,camera,navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:person},vehicles:[]}});
  let visuals:any[]=[];
  (window as any).cameraCase=(spec:any)=>{
   for(const mesh of visuals){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}visuals=[];
   const boxes=[floor,{id:'occluder',position:spec.position,size:spec.size}];
   for(const box of boxes){const m=new T.Mesh(new T.BoxGeometry(...box.size),new T.MeshStandardMaterial({color:box.id==='floor'?0xc6d0cc:0x466e80}));m.position.set(...box.position);scene.add(m);visuals.push(m);}
   world.humanoid.switchMap({...map,id:spec.name,boxes,playerSpawn:spec.walk?[-1,.03,0]:map.playerSpawn});world.step({},30);
   const start=world.humanoid.followCamera.distance;let maxArmChange=0,previous=start;
   for(let n=0;n<120;n++){world.step(spec.walk?{moveXRatio:-1}:{},1);const distance=world.humanoid.followCamera.distance;maxArmChange=Math.max(maxArmChange,Math.abs(distance-previous));previous=distance;}
   renderer.render(scene,camera);
   return {name:spec.name,start,distance:world.humanoid.followCamera.distance,maxArmChange,eye:camera.position.toArray(),subject:world.humanoid.simulation.controlledActor.player.position.toArray()};
  };
 });
 const cases=[
  {name:'thin-pillar',position:[0,2,-2],size:[.06,4,.2],visible:true},
  {name:'head-visible',position:[0,1.125,-2],size:[6,2.25,.2],visible:true},
  {name:'feet-visible',position:[0,3,-2],size:[6,3,.2],visible:true},
  {name:'side-visible',position:[-2.1,2,-2],size:[4.4,4,.2],visible:true},
  {name:'walking-past-pillar',position:[0,2,-2],size:[.06,4,.2],visible:true,walk:true},
  {name:'fully-blocked',position:[0,2,-2],size:[6,4,.2],visible:false},
 ];
 const results=[];
 for(const spec of cases){const result=await page.evaluate(spec=>(window as any).cameraCase(spec),spec);results.push(result);
  if(spec.visible){assert(Math.abs(result.distance-8.8)<.01,spec.name);assert(result.maxArmChange<.01,spec.name+' popped');}
  else assert(result.distance<2,'a completely hidden capsule must still trigger recovery of visibility');
  if(spec.walk)assert(result.subject[0]>1,'the actor must actually cross behind the pillar');
  await page.locator('canvas').screenshot({path:path.join(output,spec.name+'.png')});
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'report.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({output,results,errors}));
}finally{await browser.close();}
