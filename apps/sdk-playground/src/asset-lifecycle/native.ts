import * as THREE from 'three';
import {createHumanoidWorld,type ThreeWorld,type WorldCommand} from '@worldkit/three';
import {vehicleControlFamily} from '@worldkit/preset-content/config';
import {buildWorld} from '@worldkit/preset-content/world';
import {controlsFor} from '@worldkit/preset-content/ui/shortcuts';
import {updateVehicleWheels} from '@worldkit/preset-content/vehicle-animation';
import {updateSpaceExhaust} from '@worldkit/preset-content/space-model';
import {choices,instanceId,loadVehicle,map,vehicleBinding,type LoadedVehicle} from './native-vehicles';
import './style.css';

const viewport=document.getElementById('viewport')!,renderer=new THREE.WebGLRenderer({antialias:true}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,1,.05,2100);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));viewport.append(renderer.domElement);scene.background=new THREE.Color('#cedfd7');
const environment=buildWorld(scene,map);
camera.position.set(-16,7,77);camera.lookAt(-24,1,64);
const records=new Map<string,LoadedVehicle>(),errors:string[]=[];
let world:ThreeWorld|undefined,disposed=false,closed=false,ready=false,lastRefresh=0,generation=0,creating=false,creatingPeer=false,selectedId='car';
const text=(id:string,value:string)=>{document.getElementById(id)!.textContent=value;};
const button=(id:string)=>document.getElementById(id) as HTMLButtonElement;
const catalog=document.getElementById('vehicle-type') as HTMLSelectElement,instances=document.getElementById('vehicle-instance') as HTMLSelectElement;
for(const choice of choices){const option=new Option(choice.name,choice.id);catalog.add(option);}catalog.value='rover';
text('catalog-state',`${choices.length} 个型号 · 按需加载，已有实例会直接定位。点击画面后使用键盘操控。`);
const live=(id:string)=>!!world&&!disposed&&world.snapshot().entities.some(e=>e.id===id);
const snapshot=()=>({disposed,selectedId,loaded:[...records.values()].map(r=>({id:r.id,type:r.choice.id,name:r.choice.name})),mapId:map.id,bounds:map.bounds,riding:world&&!disposed?{vehicleId:world.humanoid!.simulation.controlledActor.vehicle?.spec.id??null,transitioning:world.humanoid!.simulation.controlledActor.transition>0||!!world.humanoid!.simulation.controlledActor.dragonTransition}:null,world:world&&!disposed?world.snapshot():null,errors:[...errors]});
Object.defineProperty(window,'nativeLifecycleLab',{value:{snapshot},configurable:true});
function refresh(){
 if(!ready||!world||disposed)return;
 const state=world.snapshot(),player=state.entities.find(e=>e.id==='player')!,vehicle=state.entities.find(e=>e.id===selectedId),peer=state.entities.find(e=>e.id==='peer');
 const rows=[...records.values()].filter(r=>state.entities.some(e=>e.id===r.id));
 if(instances.dataset.ids!==rows.map(r=>r.id).join('|')){instances.replaceChildren(...rows.map(r=>new Option(r.choice.name,r.id)));instances.dataset.ids=rows.map(r=>r.id).join('|');}
 instances.value=vehicle?selectedId:'';instances.disabled=rows.length===0;
 catalog.disabled=creating;button('vehicle-create').disabled=creating;
 button('vehicle-create').textContent=creating?'正在加载…':live(instanceId(choices.find(c=>c.id===catalog.value)!))?'定位到已有载具':'创建并定位到载具旁';
 for(const id of ['enter','locate','car-destroy'])button(id).disabled=!vehicle||creating;
 button('car-create').disabled=creating||live(instanceId(choices.find(c=>c.id===catalog.value)!));
 for(const id of ['pause','resume','exit','reset','destroy'])button(id).disabled=creating;
 for(const id of ['peer-pause','peer-resume','peer-destroy'])button(id).disabled=!peer||creatingPeer;
 button('peer-create').disabled=!!peer||creatingPeer;
 const record=records.get(selectedId),sim=world.humanoid!.simulation,dragon=sim.vehicles.find(v=>v.spec.id===selectedId)?.motion.flyingCreature;
 button('summon').hidden=!dragon;document.getElementById('dragon-state')!.hidden=!dragon;
 if(dragon){const riding=sim.controlledActor.vehicle?.spec.id===selectedId,calling=dragon.summon?.phase==='flying'||dragon.summon?.phase==='landing';button('summon').disabled=creating||calling||!!sim.controlledActor.vehicle||sim.controlledActor.transition>0||!vehicle?.isActive||!player.isActive;button('enter').disabled=creating||dragon.groundPhase!=='grounded';text('dragon-state',riding?(dragon.groundPhase==='grounded'?'已骑乘：登乘完成后按空格起飞，按 F 下龙。':'飞行／起降中：按 F 请求着陆，落稳后再按 F 下龙。'):calling?dragon.summon!.message:dragon.groundPhase==='grounded'?'飞龙已落稳：定位到鞍侧后骑乘；登乘完成后按空格起飞。':dragon.summon?.phase==='blocked'?dragon.summon.message:'飞龙在空中：先定位到附近地面、站稳，再点击召唤落地。');}
 text('control-hint',record?controlsFor(vehicleControlFamily(record.spec),world.getKeyBindings()).map(([key,action])=>`${key}：${action}`).join(' · '):'选择型号并创建，然后定位、上车。');
 text('group-state',vehicle?`${record?.choice.name??selectedId}：${vehicle.isActive?'运行':'停用'} · 速度 ${Math.hypot(...vehicle.motion!.velocityWorldMetersPerSecondXYZ).toFixed(2)} m/s · 人物 ${player.isActive?'运行':'停用'}`:'所选载具已销毁／移除，人物可继续步行。');
 text('peer-state',peer?`对照人物 ${peer.isActive?'运行':'停用'} · 动作时间 ${peer.animation?.timeSeconds.toFixed(2)??'—'} s`:'对照人物已销毁／移除，可重新创建。');
 text('world-state',`世界步数 ${state.simulationTick} · 场景载具 ${rows.length} · 错误 ${state.errors.length}`);
}
async function execute(command:WorldCommand){
 if(!world||disposed)return false;
 try{const receipt=await world.execute(command);if(receipt.status==='rejected')throw Error(receipt.error.code+': '+receipt.error.message);
  if(receipt.status==='accepted'){const operation=await world.operations.wait(receipt.operationId);if(operation.status==='failed')throw Error(operation.error?.message??'操作失败');if(operation.status==='cancelled')return false;}
  text('message','已执行。点击画面继续操控。');refresh();return true;
 }catch(error){text('message',String(error));return false;}
}
async function locate(){if(await execute({type:'vehicle.approach',instanceId:selectedId}))text('message','已定位到载具旁，点击“上车／骑乘”或在画面中按 F。');}
button('summon').onclick=()=>{if(!world||disposed)return;try{const runtime=world.humanoid!;if(!runtime.summonDragon(selectedId))throw Error(runtime.simulation.controlledActor.message);text('message','召唤已开始；飞龙会自行飞来并降落，落稳后重新定位到鞍侧。');}catch(error){text('message',String(error));}refresh();};
catalog.onchange=refresh;instances.onchange=()=>{selectedId=instances.value;const entry=records.get(selectedId);if(entry)catalog.value=entry.choice.id;refresh();};
button('locate').onclick=()=>{void locate();};button('enter').onclick=()=>{void execute({type:'vehicle.enter',instanceId:selectedId});};button('exit').onclick=()=>{void execute({type:'vehicle.exit'});};
button('pause').onclick=()=>{void execute({type:'entity.set-active',entityId:live(selectedId)?selectedId:'player',isActive:false});};
button('resume').onclick=()=>{void (async()=>{if(world&&!disposed&&!world.getEntityState('player').isActive)await execute({type:'entity.set-active',entityId:'player',isActive:true});if(live(selectedId))await execute({type:'entity.set-active',entityId:selectedId,isActive:true});})();};
for(const [id,active] of [['peer-pause',false],['peer-resume',true]] as const)button(id).onclick=()=>{void execute({type:'entity.set-active',entityId:'peer',isActive:active});};
function reconcile(){for(const [id,record] of records)if(!live(id)){record.dispose();records.delete(id);}refresh();}
async function createSelected(approach:boolean){
 if(!world||disposed||creating)return;const choice=choices.find(c=>c.id===catalog.value)!;selectedId=instanceId(choice);
 if(live(selectedId)){if(approach)await locate();refresh();return;}
 const epoch=generation;creating=true;refresh();let loaded:LoadedVehicle|undefined;
 try{
  loaded=await loadVehicle(choice);if(disposed||epoch!==generation){loaded.dispose();return;}
  world.addVehicle(vehicleBinding(loaded));loaded.adopt();records.set(loaded.id,loaded);loaded=undefined;
  text('message',`已创建 ${choice.name}。可定位后上车／骑乘。`);
  if(approach)await locate();
 }catch(error){loaded?.dispose();errors.push(String(error));text('message',`创建失败：${String(error)}`);}
 finally{creating=false;refresh();}
}
button('vehicle-create').onclick=()=>{void createSelected(true);};button('car-create').onclick=()=>{void createSelected(false);};
button('car-destroy').onclick=()=>{void execute({type:'entity.destroy',entityId:selectedId}).then(ok=>{if(ok)reconcile();});};
button('peer-destroy').onclick=()=>{void execute({type:'entity.destroy',entityId:'peer'});};
button('peer-create').onclick=()=>{void createPeer();};
async function createPeer(){
 if(!world||disposed||creatingPeer||live('peer'))return;creatingPeer=true;refresh();const epoch=generation;
 let character:Awaited<ReturnType<NonNullable<ThreeWorld['humanoid']>['createCharacter']>>|undefined;
 try{character=await world.humanoid!.createCharacter();if(disposed||epoch!==generation){character.dispose();return;}
  character.root.position.set(map.playerSpawn[0]+4,map.playerSpawn[1]+.04,map.playerSpawn[2]+3);world.addCharacter({id:'peer',humanoid:character});character=undefined;
  text('message','已创建新的对照人物。');
 }catch(error){character?.dispose();errors.push(String(error));text('message',String(error));}finally{creatingPeer=false;refresh();}
}
button('reset').onclick=()=>{if(world&&!disposed){generation++;void world.reset().then(()=>{reconcile();text('message','已重置世界；已销毁对象不会复活，后创建的人物和载具已移除。');}).catch(error=>{errors.push(String(error));text('message',String(error));});}};
function destroy(){if(disposed)return;disposed=true;ready=false;generation++;world?.dispose();for(const record of records.values())record.dispose();records.clear();renderer.clear();text('world-state','世界已销毁。');text('message','刷新页面可重新创建。');for(const control of document.querySelectorAll('button,select'))(control as HTMLButtonElement).disabled=true;}
button('destroy').onclick=destroy;
let resizeFrame:number|undefined;
const resize=new ResizeObserver(()=>{if(resizeFrame!==undefined)return;resizeFrame=requestAnimationFrame(()=>{resizeFrame=undefined;if(disposed)return;const w=viewport.clientWidth,h=viewport.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}});});resize.observe(viewport);
function close(){if(closed)return;closed=true;try{destroy();}finally{resize.disconnect();if(resizeFrame!==undefined)cancelAnimationFrame(resizeFrame);environment.dispose();renderer.dispose();}}
window.addEventListener('pagehide',close,{once:true});import.meta.hot?.dispose(close);
try{
 const initial=await loadVehicle(choices.find(c=>c.id==='rover')!);
 if(disposed)initial.dispose();else{
  records.set(initial.id,initial);
  world=await createHumanoidWorld({scene,camera,renderer,navigation:false,initialMountId:initial.id,map,vehicles:[vehicleBinding(initial)]});initial.adopt();
  if(disposed)world.dispose();else{
   await createPeer();
   world.onReset(()=>{generation++;reconcile();});world.onDispose(()=>{for(const record of records.values())record.dispose();records.clear();});
   world.humanoid!.onVisualUpdate((dt,sample)=>{
    const sim=world!.humanoid!.simulation;
    for(const [id,entry] of records){const index=sim.vehicles.findIndex(v=>v.spec.id===id),state=sim.vehicles[index];if(!state||!sim.isActive(id))continue;const vis=entry.visual,c=state.motion.creature,active=index===sim.controlledActor.vehicleIndex;
     vis.creature?.update({position:state.position,rotation:state.rotation,speed:state.speed,steering:state.steering,grounded:state.grounded,time:sim.entityTime(id),gait:c?.gait??'rest',phase:c?.phase??0,flying:c?.flying??false,...(c?{leadPosition:c.leadPosition,leadYaw:c.leadYaw}:{})},dt);
     updateVehicleWheels(vis,sample.vehicles[index]!,{grounded:state.grounded&&!state.submerged,dt,revision:sim.controlledActor.teleportRevision,active});
     if(state.motion.family==='space')updateSpaceExhaust(vis.engine,state.motion.appliedForceNewtonsXYZ,state.rotation,state.spec.spaceFlight!.thrustNewtonsXYZ[2]);
     if(active)vis.aircraftCockpit?.update({...state,aircraft:state.motion.aircraft},sim.entityTime(id));
     vis.soaringShell?.update({...state,aircraft:state.motion.aircraft},active?world!.humanoid!.options.character.object:undefined);
     if(state.motion.aircraft)vis.aircraftShell?.update(sample.vehicles[index]?.aircraft??state.motion.aircraft);
     if(active&&!state.motion.aircraft)vis.rotors.forEach(rotor=>{rotor.rotation.z+=(state.speed+4)*4*dt;});
    }
    environment.update(sim.time,sim.controlledActor.player.position,sim.controlledActor.player.position.y<-2.2);
   });
   world.onRender(()=>{if(performance.now()-lastRefresh<150)return;lastRefresh=performance.now();refresh();});
   await world.start();if(!disposed){ready=true;document.body.dataset.ready='true';refresh();text('message','已在越野车上。可直接驾驶，或从上方目录创建其他载具。');}
  }
 }
}catch(error){errors.push(String(error));text('message',String(error));world?.dispose();}
