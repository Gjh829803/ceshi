import {humanoid} from '@worldkit/three';
import './styles/space-panel.css';
/** 仅展示当前太空载具状态；沿用主页面展示回调，不建立模拟或刷新时钟。 */
export function mountSpacePanel(parent:HTMLElement,command:(c:humanoid.HumanoidCommand)=>void){
 const root=document.createElement('section');root.className='space-flight-panel';root.hidden=true;root.setAttribute('aria-label','太空飞行控制');
 const title=document.createElement('strong'),readout=document.createElement('span'),mode=document.createElement('button'),dock=document.createElement('button'),status=document.createElement('small');
 title.textContent='太空飞行';mode.type=dock.type='button';mode.id='spaceDriveMode';dock.id='spaceDock';
 root.append(title,readout,mode,dock,status);parent.append(root);
 let current:ReturnType<typeof humanoid.spaceTelemetry>=null;
 const submit=(c:humanoid.HumanoidCommand)=>{try{command(c);status.textContent='';}catch(e){status.textContent=e instanceof Error?e.message:String(e);}mode.blur();dock.blur();};
 mode.onclick=()=>{if(current)submit({type:'space.set-drive-mode',mode:current.driveMode==='assisted'?'inertial':'assisted'});};
 dock.onclick=()=>{if(current)submit({type:'space.dock',portId:current.docking?null:current.dockingPorts[0]?.id??null});};
 return {update(state:ReturnType<typeof humanoid.spaceTelemetry>){
  current=state;root.hidden=!state;if(!state)return;
  readout.textContent=`质量 ${state.massKilograms.toFixed(0)} kg`;
  mode.textContent=state.driveMode==='assisted'?'辅助驾驶 · 切换惯性':'惯性驾驶 · 切换辅助';
  dock.hidden=!state.dockingPorts.length;dock.textContent=state.docking?.status==='docked'?'已对接 · 解除':state.docking?'正在对接 · 取消':'返回泊位对接';
 },dispose(){mode.onclick=dock.onclick=null;root.remove();}};
}
