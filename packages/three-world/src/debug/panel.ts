import type {ThreeWorld,WorldPresentation} from '../index.js';
import {createDebugControls,type DebugControlTool} from './debug-controls.js';
import {createDebugRecording} from './recording.js';
import {inspectDebugCamera} from './camera-inspection.js';
import {createCollisionOverlay} from './collision-overlay.js';
import type {DebugArtifactStore} from './storage.js';

export interface DebugPanelOptions {
 readonly world:ThreeWorld;
 readonly presentation:WorldPresentation;
 readonly store:DebugArtifactStore;
 readonly sceneId:string;
 readonly registerTools?:boolean;
 readonly downloadIncident?:(id:string)=>Promise<void>;
 readonly readIncident?:(id:string)=>Promise<unknown>;
}

/** Explicit opt-in UI for an existing SDK world and presentation. No independent clock. */
export function mountDebugPanel(options:DebugPanelOptions){
 const {world,presentation}=options;
 if(!world.renderer)throw Error('DEBUG_PANEL_REQUIRES_RENDERER');
 const document=world.renderer.domElement.ownerDocument,host=document.createElement('div');
 host.dataset.worldkitDebugPanel='';host.style.cssText='position:absolute;top:12px;right:12px;pointer-events:auto;z-index:30;';
 const root=host.attachShadow({mode:'open'});
 root.innerHTML=`<style>
 :host{font:12px/1.5 system-ui,sans-serif;color:#dcebdc}*{box-sizing:border-box}
 details{background:#102c30f5;border:1px solid #526b6a;border-radius:8px;box-shadow:0 4px 20px #0003;max-width:calc(100vw - 24px)}
 summary{padding:7px 10px;cursor:pointer;font-weight:600}section{width:292px;max-width:calc(100vw - 24px);padding:0 10px 10px;max-height:70vh;overflow:auto}
 .row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}button,input{font:inherit;color:inherit;border:1px solid #526b6a;border-radius:4px;background:#16383e;padding:4px 7px;min-height:28px}
 button{cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid #c9e3b4;outline-offset:2px}
 label{display:flex;align-items:center;gap:4px}input[type=number]{width:65px}small{color:#b0c5bd;display:block}output{display:block;overflow-wrap:anywhere;white-space:pre-wrap;margin-top:6px}
 .recording{background:#f6dda0;color:#382805}.saved{background:#cfe7c6;color:#153b2b}.dot{color:#c33135;font-size:15px}
 </style><details><summary>SDK 调试</summary><section>
 <small>开启记录 → 复现异常 → 保存现场，帮助 AI 定位问题。F8 可开启或保存。</small>
 <div class="row"><button data-action="record" aria-keyshortcuts="F8">记录现场 · F8</button><button data-action="pause">暂停 / 继续</button><button data-action="step">单步</button></div>
 <div class="row"><label><input type="checkbox" data-colliders>显示碰撞体</label><button data-action="inspect">相机诊断</button></div>
 <small>人物位置（米，步行状态）</small><div class="row"><label>X<input type="number" data-pose="x" value="0" step="0.1"></label><label>Y<input type="number" data-pose="y" value="0" step="0.1"></label><label>Z<input type="number" data-pose="z" value="0" step="0.1"></label></div>
 <div class="row"><button data-action="readPose">读取当前位置</button><button data-action="place">应用位置</button></div>
 <small>跟随相机角度（度）</small><div class="row"><label>水平<input type="number" data-angle="yaw" value="0"></label><label>俯仰<input type="number" data-angle="pitch" value="15"></label><button data-action="orbit">应用角度</button></div>
 <small>输入重放会重置场景。先准备起点，再点击开始；按「继续」后操作。</small>
 <div class="row"><button data-action="start">从起点记录</button><button data-action="stop">结束记录</button><button data-action="replay">重放</button><button data-action="cancel">取消重放</button></div>
 <div class="row"><button data-action="download" disabled>下载最近现场</button></div>
 <output role="status" aria-live="polite">调试已就绪，记录和碰撞显示默认关闭。</output>
 </section></details>`;
 const output=root.querySelector('output')!,recordButton=root.querySelector<HTMLButtonElement>('[data-action=record]')!,download=root.querySelector<HTMLButtonElement>('[data-action=download]')!;
 let disposed=false,lastSavedId:string|undefined,uiBusy=false,saved=false,lastReplayResult='';const lifetime=new AbortController();
 const clearInput=()=>world.humanoid?.clearInput();
 const controls=createDebugControls({getWorld:()=>world,isReady:()=>!disposed,isPaused:()=>!world.isRunning,clearInput,
  setPaused:async paused=>{if(paused)world.stop();else{await world.start();presentation.focus();saved=false;}},render:()=>world.render(),setCameraOrbit:value=>world.setCameraOrbit(value)});
 const update=()=>{const state=recording.inspect();recordButton.disabled=uiBusy||state.busy;recordButton.className=saved?'saved':state.enabled?'recording':'';recordButton.replaceChildren();
  if(state.enabled&&!saved){const dot=document.createElement('span');dot.className='dot';dot.textContent='●';dot.setAttribute('aria-hidden','true');recordButton.append(dot);}
  recordButton.append(saved?' ✓ 已保存 · F8':state.enabled?' 保存现场 · F8':'记录现场 · F8');download.disabled=!lastSavedId||!options.downloadIncident;
  const replay=state.replayOperation;if(replay&&replay.status!=='running'&&lastReplayResult!==`${replay.id}:${replay.status}`){lastReplayResult=`${replay.id}:${replay.status}`;output.textContent=JSON.stringify(replay.result,null,2);}
 };
 const recording=createDebugRecording({world,canvas:world.renderer.domElement,ready:()=>!disposed,mapId:()=>options.sceneId,
  pause:()=>world.stop(),reset:()=>world.reset(),clearInput,render:alpha=>world.render(alpha),onStateChange:()=>update()},options.store);
 const overlay=createCollisionOverlay(world,presentation.ui);
 const show=(result:unknown)=>{output.textContent=typeof result==='string'?result:JSON.stringify(result,null,2);};
 const remember=(result:unknown)=>{if(result&&typeof result==='object'&&'status' in result){if(['applied','prepared','started'].includes(String(result.status)))saved=false;if(result.status==='saved'&&'id' in result&&typeof result.id==='string'){lastSavedId=result.id;saved=true;}}};
 const run=async(action:()=>unknown|Promise<unknown>,allowDuringReplay=false)=>{if(uiBusy||disposed)return;if(recording.inspect().busy&&!allowDuringReplay){show('操作进行中，请先等待完成或取消重放。');return;}uiBusy=true;update();try{const result=await action();if(disposed)return;remember(result);show(result);}catch(error){if(!disposed)show(String(error));}finally{uiBusy=false;if(!disposed)update();}};
 const setColliders=(value:unknown)=>{const input=value as {enabled?:unknown};if(typeof input?.enabled!=='boolean')throw Error('DEBUG_INPUT_INVALID');overlay.setEnabled(input.enabled);root.querySelector<HTMLInputElement>('[data-colliders]')!.checked=input.enabled;if(!world.isRunning)world.render();return overlay.inspect();};
 const tools:DebugControlTool[]=[...controls.tools,...recording.tools,
  {name:'inspect_camera',description:'Read compact committed camera diagnostics without advancing simulation.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>inspectDebugCamera(world)},
  {name:'set_debug_colliders',description:'Toggle real committed physics lines in a separate overlay. Never changes pure renderer captures or advances physics.',inputSchema:{type:'object',properties:{enabled:{type:'boolean'}},required:['enabled'],additionalProperties:false},annotations:{readOnlyHint:false},execute:setColliders},
  {name:'inspect_debug_colliders',description:'Read collision overlay status and sampling identity without rendering or advancing simulation.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>overlay.inspect()},
  ...(options.readIncident?[{name:'read_debug_incident',description:'Read a saved local incident by its exact ID.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},annotations:{readOnlyHint:true},execute:(input:unknown)=>options.readIncident!((input as {id:string}).id)}]:[]),
 ];
 const record=()=>run(()=>recording.inspect().enabled?recording.capture({pause:true}):recording.setHistory({enabled:true}));
 const readNumber=(selector:string)=>{const input=root.querySelector<HTMLInputElement>(selector)!;if(!input.value.trim()||!Number.isFinite(input.valueAsNumber))throw Error('DEBUG_INPUT_INVALID');return input.valueAsNumber;};
 const actions:Record<string,()=>unknown|Promise<unknown>>={
  pause:()=>controls.setSimulation({paused:world.isRunning}),step:()=>controls.stepSimulation({frames:1}),inspect:()=>inspectDebugCamera(world),
  readPose:()=>{const id=world.snapshot().controlledEntityId;if(!id)throw Error('DEBUG_CONTROLLED_ENTITY_REQUIRED');const position=world.getEntityState(id).positionWorldMetersXYZ;['x','y','z'].forEach((axis,n)=>root.querySelector<HTMLInputElement>(`[data-pose=${axis}]`)!.value=String(position[n]));return {positionWorldMetersXYZ:position};},
  place:()=>{const state=controls.inspect();return controls.setCharacterPose({positionWorldMetersXYZ:['x','y','z'].map(axis=>readNumber(`[data-pose=${axis}]`)),facingYawRadians:'character' in state?state.character?.facingYawRadians??0:0});},
  orbit:()=>controls.setCamera({mode:'orbit',yawRadians:readNumber('[data-angle=yaw]')*Math.PI/180,pitchRadians:readNumber('[data-angle=pitch]')*Math.PI/180}),
  start:()=>recording.start({maximumSeconds:30}),stop:()=>recording.stop(),replay:()=>recording.replay(),cancel:()=>tools.find(tool=>tool.name==='cancel_debug_replay')!.execute({}),
  download:async()=>{if(lastSavedId&&options.downloadIncident){await options.downloadIncident(lastSavedId);return '现场文件已导出。';}return '暂无可下载现场。';},
 };
 for(const button of root.querySelectorAll<HTMLButtonElement>('[data-action]'))button.addEventListener('click',()=>{if(button.dataset.action==='record')void record();else void run(actions[button.dataset.action!]!,['cancel','inspect','readPose','download'].includes(button.dataset.action!));},{signal:lifetime.signal});
 root.querySelector('[data-colliders]')!.addEventListener('change',event=>{void run(()=>setColliders({enabled:(event.target as HTMLInputElement).checked}));},{signal:lifetime.signal});
 document.defaultView?.addEventListener('keydown',event=>{if(event.code!=='F8'||event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.defaultPrevented)return;
  if(event.composedPath().some(target=>target instanceof HTMLElement&&target.matches('input,textarea,select,[contenteditable]:not([contenteditable=false])')))return;
  event.preventDefault();event.stopImmediatePropagation();void record();},{capture:true,signal:lifetime.signal});
 const context=(document as Document&{modelContext?:{registerTool(tool:DebugControlTool,options:{signal:AbortSignal}):void|Promise<void>}}).modelContext;
 if(options.registerTools&&context)for(const tool of tools)try{void Promise.resolve(context.registerTool({...tool,execute:async input=>{if(recording.inspect().busy&&!tool.annotations.readOnlyHint&&tool.name!=='cancel_debug_replay')return {status:'rejected',code:'DEBUG_REPLAY_BUSY'};const result=await tool.execute(input);remember(result);update();return result;}},{signal:lifetime.signal})).catch(error=>show(String(error)));}catch(error){show(String(error));}
 const unmount=presentation.ui.mount(host,{interactive:true});
 const dispose=()=>{if(disposed)return;disposed=true;lifetime.abort();recording.dispose();overlay.dispose();unmount();releaseDispose();};
 const releaseDispose=world.onDispose(dispose);
 return {tools,recording,overlay,dispose};
}
