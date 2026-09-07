import type { CollisionDebugMode } from './capsule-debug';
import { MAPS } from '../environment/maps';
import { training } from '@worldkit/three';
type HumanoidInput=training.HumanoidInput;
import type { CharacterTrial } from '../environment/types';

const { HUMANOID_BINDINGS }=training;

interface Options {
  onOpenChange(open:boolean):void;
  onPrepare(mapId:string,trial:CharacterTrial,demo:boolean):void;
  onAction(command:HumanoidInput|'jump'):void;
  getState():Record<string,unknown>;
  getAutoTraverse():boolean;setAutoTraverse(value:boolean):void;
  getSmoothing():boolean;setSmoothing(value:boolean):void;
  getDebug():CollisionDebugMode;setDebug(value:CollisionDebugMode):void;
}
const make=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
/** Searchable workshop entry; adding assets or trials does not add permanent HUD buttons. */
export function mountHumanoidLab(host:HTMLElement,o:Options){
  let pendingAction:HumanoidInput|'jump'|undefined;
  const dialog=make('dialog','','workbench humanoid-lab');dialog.setAttribute('aria-label','人物动作工坊');
  const header=make('header','','wb-header'),close=make('button','关闭 ×','wb-close');close.onclick=()=>dialog.close();
  header.append(make('div','CHARACTER / TRAVERSAL LAB','wb-eyebrow'),close);
  dialog.append(header,make('h2','人物动作工坊'),make('p','沿用人物场模型、101 骨骼与全部 48 个动作。选择测试点，或在当前位置执行动作。','wb-note'));
  const actions=make('div','','wb-actions');
  const choices:[string,HumanoidInput|'jump'][]=[['站立 / 蹲伏',{toggleCrouch:true}],['普通跳跃（原地）','jump'],['翻滚',{roll:true}],['滑铲',{slide:true}],['匍匐 / 起身',{prone:true}],['进入 / 退出攀爬',{climb:true}],['拾取 / 坐下 / 起身',{interact:true}],['放到台面',{putDown:true}],['切换泳姿',{toggleSwimStyle:true}],['取消离散动作',{cancel:true}]];
  for(const [label,command] of choices){
    const key=command==='jump'?'Space':Object.entries(HUMANOID_BINDINGS).find(([name])=>command[name as keyof HumanoidInput])?.[1].key;
    const b=make('button',key?`${key} · ${label}`:label,'wb-button');b.onclick=()=>{pendingAction=command;dialog.close();};actions.append(b);
  }
  dialog.append(make('p','靠近障碍后，按住 WASD 朝向障碍并按 Space 翻越 / 攀上；游泳上岸也使用这个组合。单按 Space 普通跳跃，壁面 / 梯子攀爬中按 B 或 Space 脱离。F 上下载具 · Q 滑铲（先助跑） · V 翻滚 · C 蹲伏。方向键环绕相机，相机模式使用页面「相机」按钮切换。','wb-note'));
  const toggles=make('div','','wb-parameter-grid'),refreshToggles:(()=>void)[]=[];
  for(const [title,get,set] of [['自动翻越 / 攀上（调试，默认关闭）',o.getAutoTraverse,o.setAutoTraverse],['原人物动画平滑混合',o.getSmoothing,o.setSmoothing]] as const){const label=make('label',title,'wb-field'),input=make('input');input.type='checkbox';input.checked=get();input.onchange=()=>set(input.checked);refreshToggles.push(()=>{input.checked=get();});label.append(input);toggles.append(label);}
  const debugLabel=make('label','碰撞体显示','wb-field'),debugSelect=make('select');
  for(const [value,title] of [['person','人'],['all','全部'],['off','关闭']] as const){const option=make('option',title);option.value=value;debugSelect.append(option);}
  debugSelect.value=o.getDebug();debugSelect.onchange=()=>o.setDebug(debugSelect.value as CollisionDebugMode);
  refreshToggles.push(()=>{debugSelect.value=o.getDebug();});debugLabel.append(debugSelect);toggles.append(debugLabel);
  const filters=make('div','','wb-parameter-grid'),select=make('select'),search=make('input');
  select.setAttribute('aria-label','人物测试地图');search.type='search';search.placeholder='搜索动作、场景或测试点';search.setAttribute('aria-label','搜索人物测试点');
  for(const map of MAPS.filter(m=>m.characterTrials?.length)){const option=make('option',map.name);option.value=map.id;select.append(option);}select.value='character-workshop';filters.append(select,search);
  const grid=make('div','','wb-scene-grid'),status=make('output','','wb-telemetry');status.setAttribute('aria-label','人物动作实时状态');
  const render=()=>{grid.replaceChildren();const map=MAPS.find(m=>m.id===select.value)!;const query=search.value.trim().toLowerCase();
    for(const trial of map.characterTrials??[]){if(query&&!`${trial.name} ${trial.description} ${trial.action}`.toLowerCase().includes(query))continue;
      const card=make('section','','wb-scene');card.append(make('h3',trial.name),make('p',trial.description,'wb-note'));
      for(const [label,demo] of [['前往测试点',false],['前往并演示',true]] as const){const b=make('button',label,'wb-button');b.onclick=()=>{try{o.onPrepare(map.id,trial,demo);dialog.close();}catch(error){status.textContent=String(error);}};card.append(b);}grid.append(card);
    }if(!grid.childElementCount)grid.append(make('p','没有匹配的测试点。','wb-note'));
  };select.onchange=render;search.oninput=render;
  dialog.append(actions,toggles,filters,grid,make('h3','当前人物状态'),status);host.append(dialog);
  const timer=setInterval(()=>{if(dialog.open)status.textContent=JSON.stringify(o.getState(),null,2);},200);
  // The native close event is asynchronous. Clear modal input first, then queue
  // the requested action, so closing cannot erase its one-shot fixed-tick pulse.
  dialog.addEventListener('close',()=>{o.onOpenChange(false);const action=pendingAction;pendingAction=undefined;if(action)o.onAction(action);});
  return {open(){render();refreshToggles.forEach(refresh=>refresh());status.textContent=JSON.stringify(o.getState(),null,2);dialog.showModal();o.onOpenChange(true);},close(){pendingAction=undefined;dialog.close();},dispose(){pendingAction=undefined;clearInterval(timer);dialog.close();dialog.remove();}};
}
