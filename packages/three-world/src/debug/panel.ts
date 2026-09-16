import type {ThreeWorld,WorldPresentation} from '../index.js';
import {createDebugControls,type DebugControlTool} from './debug-controls.js';
import {createDebugRecording} from './recording.js';
import {inspectDebugCamera} from './camera-inspection.js';
import {createCollisionOverlay} from './collision-overlay.js';
import type {DebugArtifactStore,DebugBundleFiles} from './storage.js';
import {parseDebugIncident,MAX_DEBUG_INCIDENT_BYTES,type DebugIncidentSummary} from './incident.js';

export interface DebugPanelOptions {
 readonly world:ThreeWorld;
 readonly presentation:WorldPresentation;
 readonly store:DebugArtifactStore;
 readonly sceneId:string;
 readonly registerTools?:boolean;
 readonly downloadIncident?:(id:string)=>Promise<void>;
 readonly readIncident?:(id:string)=>Promise<unknown>;
 readonly listIncidents?:(sceneId:string)=>Promise<DebugIncidentSummary[]>;
 readonly importIncident?:(text:string)=>Promise<DebugBundleFiles>;
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
 .row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}button,input,select{font:inherit;color:inherit;border:1px solid #526b6a;border-radius:4px;background:#16383e;padding:4px 7px;min-height:28px}
 button{cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid #c9e3b4;outline-offset:2px}
 select{width:100%;min-width:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 monospace}.diagnostics{margin-top:8px;border:0;box-shadow:none;background:transparent}.diagnostics summary{padding:3px 0;font-weight:400}label{display:flex;align-items:center;gap:4px;white-space:nowrap}input[type=number]{width:65px}small{color:#b0c5bd;display:block}output{display:block;overflow-wrap:anywhere;white-space:pre-wrap;margin-top:6px}
 .recording{background:#f6dda0;color:#382805}.saved{background:#cfe7c6;color:#153b2b}.dot{color:#c33135;font-size:15px}
 </style><details><summary>SDK 调试</summary><section>
 <small>开启记录 → 复现异常 → 保存现场，帮助 AI 定位问题。F8 可开启或保存。</small>
 <div class="row"><button data-action="record" aria-keyshortcuts="F8">记录现场 · F8</button><button data-action="pause">暂停 / 继续</button><button data-action="step">单步</button></div>
 <div class="row"><label><input type="checkbox" data-colliders>显示碰撞体</label><button data-action="inspect">相机诊断</button></div>
 <small>人物位置（米，步行状态）</small><div class="row"><label>X<input type="number" data-pose="x" value="0" step="0.1"></label><label>Y<input type="number" data-pose="y" value="0" step="0.1"></label><label>Z<input type="number" data-pose="z" value="0" step="0.1"></label></div>
 <div class="row"><button data-action="readPose">读取当前位置</button><button data-action="place">应用位置</button></div>
 <small>跟随相机角度（度）</small><div class="row"><label>水平<input type="number" data-angle="yaw" value="0"></label><label>俯仰<input type="number" data-angle="pitch" value="15"></label><button data-action="orbit">应用角度</button></div>
 <small>从起点记录会重置场景并保留当前人物起点；准备完成后按「继续」操作。重放也会重置场景。</small>
 <div class="row"><button data-action="start">从起点记录</button><button data-action="stop">结束记录</button><button data-action="replay">重放本次</button><button data-action="cancel">取消重放</button></div>
 <div data-incident-library>
 <small>当前场景的已保存现场</small>
 <label>现场<select data-incidents aria-label="已保存现场"><option value="">暂无现场</option></select></label>
 <div class="row"><button data-action="refresh">刷新列表</button><button data-action="download" disabled>导出所选</button><button data-action="replaySaved" disabled>重放所选</button><button data-action="import">导入现场</button></div>
 <input type="file" data-import accept="application/json,.json" hidden>
 <label><input type="checkbox" data-cross-version>允许跨版本对照重放</label>
 <small>普通现场用于诊断；仅含输入录制的现场可重放。跨版本结果不继承原验收结论。</small>
 </div>
 <output role="status" aria-live="polite">调试已就绪，记录和碰撞显示默认关闭。</output><details class="diagnostics"><summary>诊断详情</summary><pre data-diagnostics></pre></details>
 </section></details>`;
 const output=root.querySelector('output')!,recordButton=root.querySelector<HTMLButtonElement>('[data-action=record]')!,download=root.querySelector<HTMLButtonElement>('[data-action=download]')!;
 const incidentSelect=root.querySelector<HTMLSelectElement>('[data-incidents]')!,replaySaved=root.querySelector<HTMLButtonElement>('[data-action=replaySaved]')!,detail=root.querySelector<HTMLElement>('[data-diagnostics]')!;
 const importInput=root.querySelector<HTMLInputElement>('[data-import]')!,crossVersion=root.querySelector<HTMLInputElement>('[data-cross-version]')!;
 root.querySelector<HTMLElement>('[data-incident-library]')!.hidden=!options.listIncidents&&!options.importIncident&&!options.downloadIncident;
 root.querySelector<HTMLButtonElement>('[data-action=import]')!.hidden=!options.importIncident;
 root.querySelector<HTMLButtonElement>('[data-action=refresh]')!.hidden=!options.listIncidents;
 let disposed=false,uiBusy=false,saved=false,lastReplayResult='',listRequest=0;const lifetime=new AbortController();
 const refreshIncidents=async(preferred=incidentSelect.value)=>{
  if(!options.listIncidents)return;const request=++listRequest,items=await options.listIncidents(options.sceneId);if(disposed||request!==listRequest)return;
  incidentSelect.replaceChildren();for(const item of items){const option=document.createElement('option');option.value=item.id;option.dataset.hasRecording=String(item.hasRecording);option.textContent=`${new Date(item.createdAt).toLocaleString()} · ${item.label}${item.hasRecording?' · 含录制':''}`;incidentSelect.append(option);}
  if(preferred&&!items.some(item=>item.id===preferred)){
   const bundle=await options.readIncident?.(preferred) as {metadata?:{label?:string};recording?:unknown}|undefined;if(disposed||request!==listRequest)return;
   const option=document.createElement('option');option.value=preferred;option.dataset.hasRecording=String(bundle?.recording!==undefined);option.textContent=bundle?.metadata?.label??'刚保存 / 导入的现场';incidentSelect.prepend(option);
  }
  if(preferred)incidentSelect.value=preferred;
  if(!incidentSelect.options.length){const option=document.createElement('option');option.value='';option.textContent='暂无现场';incidentSelect.append(option);}
  update();
 };
 const clearInput=()=>world.humanoid?.clearInput();
 const controls=createDebugControls({getWorld:()=>world,isReady:()=>!disposed,isPaused:()=>!world.isRunning,clearInput,
  setPaused:async paused=>{if(paused)world.stop();else{await world.start();presentation.focus();saved=false;}},render:()=>world.render(),setCameraOrbit:value=>world.setCameraOrbit(value)});
 const update=()=>{const state=recording.inspect();recordButton.disabled=uiBusy||state.busy;recordButton.className=saved?'saved':state.enabled?'recording':'';recordButton.replaceChildren();
  if(state.enabled&&!saved){const dot=document.createElement('span');dot.className='dot';dot.textContent='●';dot.setAttribute('aria-hidden','true');recordButton.append(dot);}
  recordButton.append(saved?' ✓ 已保存 · F8':state.enabled?' 保存现场 · F8':'记录现场 · F8');download.disabled=!incidentSelect.value||!options.downloadIncident||uiBusy;replaySaved.disabled=!incidentSelect.value||incidentSelect.selectedOptions[0]?.dataset.hasRecording!=='true'||uiBusy||state.busy;
  const replay=state.replayOperation;if(replay&&replay.status!=='running'&&lastReplayResult!==`${replay.id}:${replay.status}`){lastReplayResult=`${replay.id}:${replay.status}`;show(replay.result);}
 };
 const recording=createDebugRecording({world,canvas:world.renderer.domElement,ready:()=>!disposed,mapId:()=>options.sceneId,
  pause:()=>world.stop(),reset:()=>world.reset(),clearInput,render:alpha=>world.render(alpha),onStateChange:()=>update()},options.store);
 const overlay=createCollisionOverlay(world,presentation.ui);
 const show=(result:unknown)=>{
  detail.textContent=typeof result==='string'?result:JSON.stringify(result,null,2);
  if(typeof result==='string'){output.textContent=result;return;}
  const status=(result as {status?:string})?.status;
  const messages:Record<string,string>={saved:'现场已保存，可从列表导出或重放。',imported:'现场已导入，保留原始代码身份；尚未重放。',prepared:'起点已准备并暂停，点击「继续」后操作。',started:'正在重放，可随时取消。',replayed:'重放完成，结果一致。',diverged:'重放出现差异，已停在对应位置，请查看诊断详情。',failed:'操作失败，请查看诊断详情。',rejected:'操作未执行，请查看诊断详情。',cancelled:'重放已取消。','cancellation-requested':'正在取消重放。',applied:'已应用。'};
  output.textContent=status?messages[status]??'操作完成，请查看诊断详情。':'诊断已更新，请展开查看。';
 };
 const remember=(result:unknown)=>{if(result&&typeof result==='object'&&'status' in result){if(['applied','prepared','started'].includes(String(result.status)))saved=false;if(result.status==='saved'&&'id' in result&&typeof result.id==='string'){saved=true;const id=result.id;
    if(!options.listIncidents){const option=document.createElement('option');option.value=id;option.textContent='最近保存的现场';incidentSelect.replaceChildren(option);}else void refreshIncidents(id).catch(error=>{if(!disposed)show(String(error));});}}};
 const run=async(action:()=>unknown|Promise<unknown>,allowDuringReplay=false)=>{if(uiBusy||disposed)return;if(recording.inspect().busy&&!allowDuringReplay){show('操作进行中，请先等待完成或取消重放。');return;}uiBusy=true;update();try{const result=await action();if(disposed)return;remember(result);show(result);}catch(error){if(!disposed)show(String(error));}finally{uiBusy=false;if(!disposed)update();}};
 const setColliders=(value:unknown)=>{const input=value as {enabled?:unknown};if(typeof input?.enabled!=='boolean')throw Error('DEBUG_INPUT_INVALID');overlay.setEnabled(input.enabled);root.querySelector<HTMLInputElement>('[data-colliders]')!.checked=input.enabled;if(!world.isRunning)world.render();return overlay.inspect();};
 const tools:DebugControlTool[]=[...controls.tools,...recording.tools,
  {name:'inspect_camera',description:'Read compact committed camera diagnostics without advancing simulation.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>inspectDebugCamera(world)},
  {name:'set_debug_colliders',description:'Toggle real committed physics lines in a separate overlay. Never changes pure renderer captures or advances physics.',inputSchema:{type:'object',properties:{enabled:{type:'boolean'}},required:['enabled'],additionalProperties:false},annotations:{readOnlyHint:false},execute:setColliders},
  {name:'inspect_debug_colliders',description:'Read collision overlay status and sampling identity without rendering or advancing simulation.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>overlay.inspect()},
  ...(options.listIncidents?[{name:'list_debug_incidents',description:'List recent local incidents for this scene, including original source identity and whether an input recording is present. Does not restore or advance simulation.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>options.listIncidents!(options.sceneId)}]:[]),
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
  refresh:async()=>{await refreshIncidents();return '现场列表已刷新。';},
  replaySaved:()=>recording.replay({bundleId:incidentSelect.value,allowSourceChange:crossVersion.checked}),
  import:()=>importInput.click(),
  download:async()=>{if(incidentSelect.value&&options.downloadIncident){await options.downloadIncident(incidentSelect.value);return '现场文件已导出。';}return '暂无可下载现场。';},
 };
 for(const button of root.querySelectorAll<HTMLButtonElement>('[data-action]'))button.addEventListener('click',()=>{if(button.dataset.action==='record')void record();else void run(actions[button.dataset.action!]!,['cancel','inspect','readPose','download'].includes(button.dataset.action!));},{signal:lifetime.signal});
 incidentSelect.addEventListener('change',()=>{crossVersion.checked=false;update();},{signal:lifetime.signal});
 importInput.addEventListener('change',()=>{const file=importInput.files?.[0];importInput.value='';if(!file||!options.importIncident)return;
  void run(async()=>{if(file.size>MAX_DEBUG_INCIDENT_BYTES)throw Error('DEBUG_BUNDLE_TOO_LARGE');const text=await file.text(),bundle=parseDebugIncident(text);if(bundle.metadata.mapId!==options.sceneId)throw Error(`现场属于 ${bundle.metadata.mapId}，请切换到对应场景后导入。`);const result=await options.importIncident!(text);await refreshIncidents(result.id);crossVersion.checked=false;return {status:'imported',id:result.id};});
 },{signal:lifetime.signal});
 root.querySelector('[data-colliders]')!.addEventListener('change',event=>{void run(()=>setColliders({enabled:(event.target as HTMLInputElement).checked}));},{signal:lifetime.signal});
 document.defaultView?.addEventListener('keydown',event=>{if(event.code!=='F8'||event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.defaultPrevented)return;
  if(event.composedPath().some(target=>target instanceof HTMLElement&&target.matches('input,textarea,select,[contenteditable]:not([contenteditable=false])')))return;
  event.preventDefault();event.stopImmediatePropagation();void record();},{capture:true,signal:lifetime.signal});
 const context=(document as Document&{modelContext?:{registerTool(tool:DebugControlTool,options:{signal:AbortSignal}):void|Promise<void>}}).modelContext;
 if(options.registerTools&&context)for(const tool of tools)try{void Promise.resolve(context.registerTool({...tool,execute:async input=>{if(recording.inspect().busy&&!tool.annotations.readOnlyHint&&tool.name!=='cancel_debug_replay')return {status:'rejected',code:'DEBUG_REPLAY_BUSY'};const result=await tool.execute(input);remember(result);update();return result;}},{signal:lifetime.signal})).catch(error=>show(String(error)));}catch(error){show(String(error));}
 const unmount=presentation.ui.mount(host,{interactive:true});
 void refreshIncidents().catch(error=>{if(!disposed)show(String(error));});
 const dispose=()=>{if(disposed)return;disposed=true;lifetime.abort();recording.dispose();overlay.dispose();unmount();releaseDispose();};
 const releaseDispose=world.onDispose(dispose);
 return {tools,recording,overlay,dispose};
}
