import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createWorld,type ThreeWorld,type WorldOptions} from '@worldkit/three';
import {ResourceObserver} from './resource-observer';
import './style.css';

type Definition=NonNullable<WorldOptions['assetDefinitions']>[string];
type Instance={id:string;assetId:string;name:string;actor?:boolean;actions?:readonly string[];phase:'active'|'removed'|'destroyed'|'disposed'};
type Session={id:number;world:ThreeWorld;observer:ResourceObserver;records:Instance[];objects:Map<string,THREE.Object3D>;disposed:boolean;pending:number;errors:string[];environment:THREE.Mesh[]};
function element<T extends HTMLElement>(id:string){const node=document.getElementById(id);if(!node)throw Error(`Missing lab element: ${id}`);return node as T;}
const viewport=element('viewport'),select=element<HTMLSelectElement>('asset'),loadButton=element<HTMLButtonElement>('load'),destroyButton=element<HTMLButtonElement>('destroy'),createButton=element<HTMLButtonElement>('create');
const scene=new THREE.Scene();scene.background=new THREE.Color('#cedfd7');
const camera=new THREE.PerspectiveCamera(42,1,.05,2000);camera.position.set(6,4,7);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));viewport.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1,0);controls.update();
scene.add(new THREE.HemisphereLight(0xffffff,0x536c5c,2));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(8,12,6);scene.add(sun);
const grid=new THREE.GridHelper(80,80,0x6d9080,0xa7c1b1);grid.position.y=.015;scene.add(grid);
let current:Session|undefined,worldSerial=0,instanceSerial=0,creating=false,closed=false,lastRefresh=0;
let definitions:Record<string,Definition>={};const events:string[]=[];
const actorButton=element<HTMLButtonElement>('create-actor');
const stateLabel=()=>creating?'准备中':!current||current.disposed?'已销毁':current.pending?'加载中':'运行中';
function record(message:string){events.unshift(message);events.length=Math.min(events.length,40);element('events').replaceChildren(...events.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));}
function message(text:string,error=false){element('message').textContent=text;document.body.dataset.error=String(error);}
function snapshot(){
 const s=current;
 return {worldId:s?.id??0,state:stateLabel(),pending:s?.pending??0,instances:s?.records.map(r=>({...r}))??[],
  world:s&&!s.disposed?s.world.snapshot():null,
  visibleInstances:s?[...s.objects.values()].filter(o=>o.parent===scene).length:0,
  ...s?.observer.snapshot(),renderer:{...renderer.info.memory},errors:s?[...s.errors]:[],events:[...events]};
}
function refresh(){
 const s=current,state=snapshot();document.body.dataset.labState=state.state;element('world-state').textContent=`世界 ${state.worldId} · ${state.state}`;
 loadButton.disabled=creating||!s||s.disposed||s.pending>0||s.records.filter(row=>row.phase!=='destroyed').length>=6;select.disabled=loadButton.disabled;
 actorButton.disabled=loadButton.disabled;
 destroyButton.disabled=creating||!s||s.disposed;createButton.disabled=creating||!!s&&!s.disposed;
 element('active-count').textContent=String(state.visibleInstances);element('removed-count').textContent=String(s?.records.filter(r=>r.phase==='removed').length??0);
 element('shared-count').textContent=String(state.shared??0);element('empty').hidden=state.visibleInstances>0;
 for(const row of s?.records??[]){const node=document.getElementById(`state-${row.id}`),body=state.world?.entities.find(e=>e.id===row.id);if(node&&body)node.textContent=`${row.id} · ${body.isActive?'运行中':'已停用（保留画面）'} · ${body.animation?.actionId??'静态'} · ${body.motion?.isGrounded?'已着地':body.motion?'离地':'无人物物理'} · Z ${body.positionWorldMetersXYZ[2].toFixed(2)} m`; }
 element('runtime-state').textContent=state.world?`世界步数 ${state.world.simulationTick} · 当前操控 ${state.world.controlledEntityId??'无'} · 错误 ${state.world.errors.length}`:'世界已销毁';
 element('renderer-info').textContent=`渲染器资源：几何 ${state.renderer.geometries} / 纹理 ${state.renderer.textures}（包含网格及内部资源）`;
 element('resources').replaceChildren(...(['geometry','material','texture'] as const).map(kind=>{
  const row=document.createElement('tr'),count=state.counts?.[kind]??{total:0,released:0,pending:0};
  for(const value of [{geometry:'几何',material:'材质',texture:'纹理'}[kind],count.total,count.released,count.pending]){const td=document.createElement('td');td.textContent=String(value);row.append(td);}return row;
 }));
 // Instance controls only change after user operations, so frame observations do not steal focus.
}
function refreshInstances(){
 element('instances').replaceChildren(...(current?.records??[]).map(row=>{
  const li=document.createElement('li'),label=document.createElement('span'),detail=document.createElement('small');label.className='label';label.textContent=row.name;
  detail.id=`state-${row.id}`;detail.textContent=`${row.id} · ${{active:'场景中',removed:'已移除，世界仍持有',destroyed:'实例已销毁',disposed:'世界已销毁'}[row.phase]}`;label.append(detail);li.append(label);
  if(row.phase==='active'&&row.actor){
   const bar=document.createElement('div');bar.className='actor-actions';
   const control=document.createElement('button');control.textContent='操控';control.setAttribute('aria-label',`操控 ${row.id}`);control.onclick=()=>{if(!current||current.disposed)return;current.world.setControlledEntity(row.id);renderer.domElement.focus();message('WASD 移动，Shift 跑步，空格跳跃；可撞向前方障碍检查碰撞。');};bar.append(control);
   for(const [title,isActive] of [['停用',false],['恢复',true]] as const){const button=document.createElement('button');button.textContent=title;button.setAttribute('aria-label',`${title} ${row.id}`);button.onclick=()=>{void command({type:'entity.set-active',entityId:row.id,isActive},isActive?'已恢复；点击画面后重新按移动键。':'已停用该人物的输入、动作和碰撞；模型保留在画面中便于核对。');};bar.append(button);}
   const action=document.createElement('select');action.setAttribute('aria-label',`动作 ${row.id}`);for(const id of row.actions??[]){const option=document.createElement('option');option.value=id;option.textContent=id;action.append(option);}if(row.actions?.includes('walk'))action.value='walk';bar.append(action);
   const play=document.createElement('button');play.textContent='原地演示动作';play.setAttribute('aria-label',`播放动作 ${row.id}`);play.onclick=()=>{void command({type:'entity.play-action',entityId:row.id,actionId:action.value,playback:'loop'},'演示动作正在播放；恢复自动动作后，走跑跳由实际运动状态驱动。');};bar.append(play);
   const automatic=document.createElement('button');automatic.textContent='自动动作';automatic.onclick=()=>{void command({type:'entity.stop-action',entityId:row.id},'恢复由真实运动驱动动作。');};bar.append(automatic);li.append(bar);
  }
  if(row.phase==='active'){const button=document.createElement('button');button.textContent='移除';button.setAttribute('aria-label',`移除 ${row.id}`);button.onclick=()=>{void remove(row.id,button);};li.append(button);const destroyInstance=document.createElement('button');destroyInstance.textContent='销毁实例';destroyInstance.setAttribute('aria-label',`销毁 ${row.id}`);destroyInstance.onclick=()=>{void remove(row.id,destroyInstance,true);};li.append(destroyInstance);}return li;
 }));refresh();
}
function frame(){
 const box=new THREE.Box3();for(const object of current?.objects.values()??[])box.expandByObject(object);
 if(current?.records.some(row=>row.actor&&row.phase==='active')){controls.target.set(0,1,0);camera.position.set(0,10,15);}
 else if(box.isEmpty()){controls.target.set(0,1,0);camera.position.set(6,4,7);}else{const center=box.getCenter(new THREE.Vector3()),radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,1);
  controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(1,.65,1.25).normalize().multiplyScalar(radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.2));camera.far=Math.max(2000,radius*20);camera.updateProjectionMatrix();}
 controls.update();if(!current||current.disposed)renderer.render(scene,camera);
}
async function newWorld(){
 if(creating||closed||current&&!current.disposed)return;
 creating=true;current?.observer.disconnect();refresh();
 try{
  const world=await createWorld({scene,camera,renderer,navigation:false,assetDefinitions:definitions});
  if(closed){world.dispose();return;}
  const session:Session={id:++worldSerial,world,observer:new ResourceObserver(),records:[],objects:new Map(),disposed:false,pending:0,errors:[],environment:[]};current=session;
  world.onRender(()=>{for(const [id,object] of session.objects)session.observer.observe(id,object);if(performance.now()-lastRefresh>200){lastRefresh=performance.now();refresh();}});
  await world.start();record(`世界 ${session.id} 已就绪，尚未加载任何模型。`);message('选择资产并点击加载。移除后可销毁世界，核对最终释放。');frame();
 }catch(error){message(String(error),true);current?.errors.push(String(error));}finally{creating=false;refreshInstances();}
}
async function load(actor=false){
 const s=current;if(!s||s.disposed||s.pending||s.records.filter(row=>row.phase!=='destroyed').length>=6)return;
 const assetId=actor?'humanoid.uefn-mannequin':select.value,definition=definitions[assetId];if(!definition)return;
 s.pending++;message('正在加载真实模型…');record(`世界 ${s.id} 请求 ${definition.displayName}`);refresh();
 try{
  // WorldAssets owns this handle. A destroyed world rejects and releases late loads.
  // The runtime specimen uses the existing character controller and animation owner.
  const asset=await s.world.assets.load(assetId,{loadTextures:true});
  if(s!==current||s.disposed)return;
  const id=`asset-${++instanceSerial}`;s.observer.observe(id,asset.object);
  const bounds=new THREE.Box3().setFromObject(asset.object),width=Math.max(bounds.getSize(new THREE.Vector3()).x,2);
  const occupied=new THREE.Box3();for(const object of s.objects.values())occupied.expandByObject(object);
  asset.object.position.x+=(occupied.isEmpty()?0:occupied.max.x+width*.6+1)-bounds.getCenter(new THREE.Vector3()).x;
  asset.object.position.y-=bounds.min.y;
  if(actor){ensureEnvironment(s);asset.object.position.copy(actorSpawn(s));s.world.addCharacter({id,name:definition.displayName,asset});if(!s.world.snapshot().controlledEntityId)s.world.setControlledEntity(id);}
  else s.world.addEntity({id,name:definition.displayName,object:asset.object,role:'decoration'});
  s.objects.set(id,asset.object);s.records.push({id,assetId,name:definition.displayName,...(actor?{actor:true,actions:asset.actionIds}:{}),phase:'active'});
  record(`${id} 已放置。`);message(s.records.filter(row=>row.phase!=='destroyed').length>=6?'本轮最多观察 6 个实例，请销毁后新建世界继续。':'已加载。可再次加载同一资产，对照共享资源。');frame();
 }catch(error){if(s.disposed){record(`世界 ${s.id} 的迟到加载已失效：${String(error)}`);}else{s.errors.push(String(error));record(`加载失败：${String(error)}`);if(s===current)message(String(error),true);}}
 finally{s.pending--;if(s===current)refreshInstances();}
}
async function command(value:Parameters<ThreeWorld['execute']>[0],success:string){
 const s=current;if(!s||s.disposed)return;
 try{const receipt=await s.world.execute(value);if(receipt.status==='rejected')throw Error(receipt.error.code+': '+receipt.error.message);if(s!==current||s.disposed)return;message(success);record(success);refresh();}
 catch(error){if(s===current&&!s.disposed){message(String(error),true);s.errors.push(String(error));}}
}
function actorSpawn(s:Session):THREE.Vector3{
 const positions=s.world.snapshot().entities.filter(e=>e.role==='actor').map(e=>new THREE.Vector3(...e.positionWorldMetersXYZ));
 for(const z of [4,7,10])for(const x of [-2,1,4,7,-5,-8]){const candidate=new THREE.Vector3(x,.05,z);if(positions.every(p=>Math.hypot(p.x-x,p.z-z)>1.5))return candidate;}
 throw Error('没有空闲人物出生点，请先移除一个实例。');
}
function ensureEnvironment(s:Session){
 if(s.environment.length)return;
 for(const [id,size,at,color] of [
  ['lab-floor',[28,1,28],[0,-.5,0],0xb3c7bf],
  ['lab-wall',[12,2,.8],[0,1,-3],0x527269],
 ] as const){const object=new THREE.Mesh(new THREE.BoxGeometry(size[0],size[1],size[2]),new THREE.MeshStandardMaterial({color,roughness:1}));object.position.set(at[0],at[1],at[2]);s.world.addEntity({id,object,role:'obstacle',physics:{kind:'fixed',shape:'box'}});s.environment.push(object);}
}
async function remove(id:string,button:HTMLButtonElement,destroyInstance=false){
 const s=current;if(!s||s.disposed)return;button.disabled=true;
 if(s.world.snapshot().controlledEntityId===id)s.world.clearControlledEntity();
 try{const receipt=await s.world.execute({type:destroyInstance?'entity.destroy':'entity.despawn',entityId:id});if(receipt.status==='rejected')throw receipt.error;if(receipt.status==='accepted'&&s.world.operations.get(receipt.operationId)?.status==='failed')throw Error('实例销毁清理失败，请检查世界错误');
  if(s!==current||s.disposed)return;
  if(s.world.snapshot().entities.some(e=>e.id===id))throw Error('实例尚未从世界移除');
  s.objects.delete(id);if(destroyInstance)s.observer.releaseOwner(id);s.records.find(r=>r.id===id)!.phase=destroyInstance?'destroyed':'removed';record(destroyInstance?`${id} 实例已销毁；其他实例继续运行。`:`${id} 已移除；资产仍由世界持有。`);message(destroyInstance?'实例已销毁。共享几何和纹理会等最后一个使用者释放后清理。':'模型已离开场景。点击“销毁测试世界”验证最终清理。');
 }catch(error){if(!s.disposed){s.errors.push(String(error));message(String(error),true);}}finally{refreshInstances();}
}
function destroy(){
 const s=current;if(!s||s.disposed)return;s.disposed=true;let disposalFailed=false;
 try{s.world.dispose();record(`世界 ${s.id} 已执行销毁。`);}catch(error){disposalFailed=true;s.errors.push(String(error));record(`销毁错误：${String(error)}`);}
 finally{for(const mesh of s.environment){mesh.removeFromParent();mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}s.environment=[];s.objects.clear();for(const row of s.records)row.phase='disposed';renderer.renderLists.dispose();renderer.render(scene,camera);refreshInstances();
  const remaining=Object.values(s.observer.snapshot().counts).reduce((sum,c)=>sum+c.pending,0);
  message(disposalFailed?'销毁存在错误，请查看操作记录。':remaining?`仍有 ${remaining} 个已观察资源未收到释放事件，需要检查。`:s.pending?'世界已销毁，正在等待在途加载返回并自行清理。':'本轮已观察资源均收到释放事件。可以新建空世界再次加载。',disposalFailed||remaining>0);}
}
loadButton.onclick=()=>{void load();};actorButton.onclick=()=>{void load(true);};destroyButton.onclick=destroy;createButton.onclick=()=>{void newWorld();};element('frame').onclick=frame;
controls.addEventListener('change',()=>{if(!current||current.disposed)renderer.render(scene,camera);});
const resize=new ResizeObserver(()=>{const width=viewport.clientWidth,height=viewport.clientHeight;if(width&&height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(!current||current.disposed)renderer.render(scene,camera);}});resize.observe(viewport);
function close(){if(closed)return;closed=true;destroy();current?.observer.disconnect();resize.disconnect();controls.dispose();grid.geometry.dispose();for(const m of Array.isArray(grid.material)?grid.material:[grid.material])m.dispose();renderer.dispose();}
window.addEventListener('pagehide',close,{once:true});import.meta.hot?.dispose(close);
Object.defineProperty(window,'assetLifecycleLab',{value:{snapshot},configurable:true});
try{const response=await fetch('/asset-definitions.json');if(!response.ok)throw Error(`资产目录读取失败：${response.status}`);const catalog=await response.json() as {schemaVersion:number;assets:Definition[]};
 if(catalog.schemaVersion!==1||!Array.isArray(catalog.assets))throw Error('资产目录格式不正确');
 definitions=Object.fromEntries(catalog.assets.map(a=>[a.id,a]));
 select.replaceChildren(...catalog.assets.map(a=>{const option=document.createElement('option');option.value=a.id;option.textContent=a.displayName;return option;}));
 if(definitions['humanoid.uefn-mannequin'])select.value='humanoid.uefn-mannequin';await newWorld();
}catch(error){message(String(error),true);record(String(error));}
