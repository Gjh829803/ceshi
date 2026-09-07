import type { AssetProfileV1, ProfileCameraTuning } from './profiles';
import { training } from '@worldkit/three';
const { CAMERA_TUNING_RANGES }=training;
import { icon } from '../ui/icons';
import './inspector.css';

export type InspectorSubject = { name:string; subtitle?:string; state?:string; color?:string };
export type InspectorCamera = { mode:number; distance:number; fovDegrees:number; yawRadians:number; pitchRadians:number; collisionLimited:boolean };
export type InspectorTelemetry = { speedKmh?:number; altitudeMeters?:number; paused?:boolean; position?:readonly number[]; headingDegrees?:number };
export type InspectorOptions = {
  getAssetId():string;
  getSubject():InspectorSubject;
  getProfile(id:string):AssetProfileV1;
  applyProfile(profile:AssetProfileV1):void;
  saveProfile(profile:AssetProfileV1):void;
  resetProfile(id:string):void;
  getCamera():InspectorCamera;
  setCameraMode(mode:number):void;
  getTelemetry?():InspectorTelemetry;
  onInteract?():void;
};
export type CameraInspector = { sync():void; focus():void; dispose():void };
type NumericCameraKey = Exclude<keyof ProfileCameraTuning,'collisionEnabled'>;
type Field = { row:HTMLElement; range:HTMLInputElement; number:HTMLInputElement; key:NumericCameraKey; unit:string; precision:number };
let inspectorCount=0;

function create<K extends keyof HTMLElementTagNameMap>(tag:K,className:string,text?:string):HTMLElementTagNameMap[K]{
  const element=document.createElement(tag);element.className=className;if(text!==undefined)element.textContent=text;return element;
}
const format=(value:number|undefined,precision=1)=>value===undefined||!Number.isFinite(value)?'—':value.toFixed(precision);
const write=(element:HTMLElement,value:string)=>{if(element.textContent!==value)element.textContent=value;};

/** A nonmodal live inspector. The host owns its placement and simulation loop. */
export function mountInspector(host:HTMLElement,options:InspectorOptions):CameraInspector{
  const id=`camera-inspector-${++inspectorCount}`,dirty=new Set<string>(),fields:Field[]=[];
  let activeId='',disposed=false;
  const panel=create('section','camera-inspector');panel.setAttribute('aria-labelledby',`${id}-title`);
  const header=create('header','inspector-header');
  const heading=create('div','inspector-heading');
  const title=create('h2','inspector-title','属性检查器');title.id=`${id}-title`;
  heading.append(create('span','inspector-eyebrow','3C INSPECTOR'),title);
  const live=create('span','inspector-live','实时');header.append(heading,live);

  const scroll=create('div','inspector-scroll');
  const subject=create('section','inspector-subject');subject.setAttribute('aria-label','当前操控主体');
  const subjectTop=create('div','inspector-subject-top');
  const subjectMark=create('span','inspector-subject-mark');subjectMark.setAttribute('aria-hidden','true');
  const subjectInfo=create('div','inspector-subject-info');
  const subjectName=create('h3','inspector-subject-name'),subjectSubtitle=create('span','inspector-subject-subtitle');
  subjectInfo.append(subjectName,subjectSubtitle);
  const subjectState=create('span','inspector-subject-state');subjectTop.append(subjectMark,subjectInfo,subjectState);
  const subjectStats=create('div','inspector-subject-stats');
  const stat=(label:string)=>{const cell=create('div','inspector-stat');const value=create('output','inspector-stat-value','—');value.setAttribute('aria-live','off');cell.append(create('span','inspector-stat-label',label),value);subjectStats.append(cell);return value;};
  const speed=stat('速度 km/h'),altitude=stat('高度 m'),headingValue=stat('朝向 °');
  const position=create('div','inspector-position','X —   Y —   Z —');subject.append(subjectTop,subjectStats,position);
  scroll.append(subject);

  function group(label:string,kicker:string){
    const section=create('section','inspector-group');
    const groupHeader=create('div','inspector-group-header');groupHeader.append(create('h3','inspector-group-title',label),create('span','inspector-group-kicker',kicker));section.append(groupHeader);scroll.append(section);return section;
  }
  const cameraGroup=group('相机模式','CAMERA');
  const modes=create('div','inspector-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','相机模式');
  const modeButtons=['跟随','近距','俯视'].map((label,index)=>{
    const button=create('button','inspector-mode',label);button.type='button';button.dataset.mode=String(index);
    button.addEventListener('click',()=>{options.onInteract?.();options.setCameraMode(index);sync();});modes.append(button);return button;
  });
  const modeNote=create('p','inspector-mode-note');cameraGroup.append(modes,modeNote);
  const actual=create('div','inspector-camera-actual');
  const actualStat=(label:string)=>{const entry=create('div','inspector-actual-entry'),value=create('output','inspector-actual-value','—');value.setAttribute('aria-live','off');entry.append(create('span','inspector-actual-label',label),value);actual.append(entry);return value;};
  const actualDistance=actualStat('实际距离'),actualFov=actualStat('实际 FOV'),actualYaw=actualStat('视角偏航'),actualPitch=actualStat('视角俯仰');cameraGroup.append(actual);

  const followGroup=group('跟随与构图','FOLLOW & FRAMING');
  const status=create('p','inspector-save-status','参数按当前资产独立保存。');status.setAttribute('role','status');status.setAttribute('aria-live','polite');

  function applyValue(key:keyof ProfileCameraTuning,value:number|boolean){
    try{
      const profile=structuredClone(options.getProfile(activeId));
      if(key==='collisionEnabled')profile.camera.collisionEnabled=value as boolean;
      else profile.camera[key]=value as number;
      options.applyProfile(profile);dirty.add(activeId);write(status,'实时已应用 · 尚未保存到本地');status.dataset.error='false';sync();
    }catch(error){write(status,error instanceof Error?error.message:'无法应用相机参数');status.dataset.error='true';}
  }
  function field(parent:HTMLElement,key:NumericCameraKey,label:string,unit:string,step:number,description:string){
    const bounds=key==='distance'?[1,40] as const:CAMERA_TUNING_RANGES[key];
    const row=create('div','inspector-field');row.dataset.cameraField=key;
    const labelRow=create('div','inspector-field-label-row');
    const labelElement=create('label','inspector-field-label',label);labelElement.htmlFor=`${id}-${key}-number`;
    const numberWrap=create('span','inspector-number-wrap'),number=create('input','inspector-number');number.type='number';number.id=labelElement.htmlFor;
    number.min=String(bounds[0]);number.max=String(bounds[1]);number.step=String(step);number.inputMode='decimal';number.title=description;
    const unitElement=create('span','inspector-field-unit',unit);unitElement.setAttribute('aria-hidden','true');numberWrap.append(number,unitElement);labelRow.append(labelElement,numberWrap);
    const range=create('input','inspector-range');range.type='range';range.min=number.min;range.max=number.max;range.step=number.step;range.setAttribute('aria-label',`${label}滑块`);range.title=description;
    const item:Field={row,range,number,key,unit,precision:step<.1?2:step<1?1:0};fields.push(item);row.append(labelRow,range);parent.append(row);
    const commit=(input:HTMLInputElement)=>{
      if(input.value===''||!input.validity.valid)return;
      const value=input.valueAsNumber;if(!Number.isFinite(value))return;
      applyValue(key,value);
      if(input===number)range.value=String(value);else number.value=String(value);
      paintRange(item);
    };
    range.addEventListener('input',()=>commit(range));number.addEventListener('input',()=>commit(number));
    number.addEventListener('change',()=>{if(!number.validity.valid||number.value===''){number.value=String(options.getProfile(activeId).camera[key]);number.setCustomValidity('');}});
    return item;
  }
  const distance=field(followGroup,'distance','基础距离','m',.1,'跟随模式的镜头臂长；人物室内默认自动使用 5.6 m。');
  const response=field(followGroup,'followResponsePerSecond','跟随响应','/s',.1,'数值越大，镜头越快跟上主体。');
  const vertical=field(followGroup,'targetHeightOffset','垂直偏移','m',.05,'在主体原始注视高度上增加偏移。');
  const horizontal=field(followGroup,'horizontalOffset','水平偏移','m',.05,'相对镜头右方向偏移；驾驶位相对座位右方向。');
  const recenterGroup=group('自动回正','RECENTER');
  const recenterNote=create('p','inspector-group-note');recenterGroup.append(recenterNote);
  const delay=field(recenterGroup,'recenterDelaySeconds','回正等待','s',.1,'停止环绕后，载具行驶超过此时长开始回正。');
  const recenter=field(recenterGroup,'recenterResponsePerSecond','回正响应','/s',.1,'回正到载具前进方向的速率；空中模式按原始比例放缓，0 关闭自动回正。');
  const lensGroup=group('镜头','LENS');
  field(lensGroup,'baseFovDegrees','基础视野 FOV','°',1,'人物保持设置的视野；载具会按速度额外增加最多 12°。');
  const lensNote=create('p','inspector-group-note');lensGroup.append(lensNote);
  const collisionGroup=group('镜头避障','COLLISION');
  const collisionRow=create('label','inspector-toggle-row'),collisionToggle=create('input','inspector-toggle');collisionToggle.type='checkbox';collisionToggle.setAttribute('role','switch');
  collisionRow.append(create('span','inspector-field-label','启用碰撞检测'),collisionToggle);collisionGroup.append(collisionRow);
  collisionToggle.addEventListener('change',()=>applyValue('collisionEnabled',collisionToggle.checked));
  const radius=field(collisionGroup,'collisionRadiusMeters','探测半径','m',.01,'镜头球体探测半径；更大半径会更早收回镜头。');
  const collisionState=create('div','inspector-collision-state');collisionGroup.append(collisionState);
  const interactionNote=create('p','inspector-interaction-note','拖动场景环绕 · 滚轮缩放');scroll.append(interactionNote);

  const footer=create('footer','inspector-footer'),actions=create('div','inspector-actions');
  const reset=create('button','inspector-reset','恢复默认'),save=create('button','inspector-save','保存到本地');reset.type=save.type='button';
  reset.addEventListener('click',()=>{
    try{options.resetProfile(activeId);dirty.delete(activeId);write(status,'已恢复当前资产的默认参数');status.dataset.error='false';sync();}
    catch(error){write(status,error instanceof Error?error.message:'无法恢复默认参数');status.dataset.error='true';}
  });
  save.addEventListener('click',()=>{
    try{options.saveProfile(options.getProfile(activeId));dirty.delete(activeId);write(status,'已保存 · 重新打开后自动恢复');status.dataset.error='false';sync();}
    catch(error){write(status,error instanceof Error?error.message:'浏览器本地存储不可用');status.dataset.error='true';}
  });
  actions.append(reset,save);footer.append(actions,status);panel.append(header,scroll,footer);host.append(panel);
  // Editing must release a previously held driving key while leaving the
  // simulation running. No dialog or modal pause is involved in this panel.
  panel.addEventListener('pointerdown',()=>options.onInteract?.());
  panel.addEventListener('focusin',()=>options.onInteract?.());
  panel.addEventListener('keydown',event=>event.stopPropagation());panel.addEventListener('keyup',event=>event.stopPropagation());

  function paintRange(item:Field){const min=Number(item.range.min),max=Number(item.range.max);item.range.style.setProperty('--range-progress',`${(item.range.valueAsNumber-min)/(max-min)*100}%`);}
  function disable(item:Field,disabled:boolean,reason?:string){item.range.disabled=item.number.disabled=disabled;item.row.dataset.inactive=String(disabled);item.row.title=disabled?reason??'此模式不使用该参数':'';}
  function sync(){
    if(disposed)return;
    const nextId=options.getAssetId(),changed=nextId!==activeId;activeId=nextId;
    const profile=options.getProfile(activeId),subjectValue=options.getSubject(),camera=options.getCamera(),telemetry=options.getTelemetry?.()??{};
    const person=activeId==='person',overview=camera.mode===2,cockpit=!person&&camera.mode===1;
    panel.dataset.assetId=activeId;panel.dataset.mode=String(camera.mode);
    write(subjectName,subjectValue.name);write(subjectSubtitle,subjectValue.subtitle??activeId.toUpperCase());write(subjectState,subjectValue.state??(person?'步行':'驾驶'));
    subjectMark.style.setProperty('--subject-color',subjectValue.color??'#d3e9a8');
    if(changed)subjectMark.replaceChildren(icon(person?'person-standing':'box',19));
    write(live,telemetry.paused?'已暂停':'实时');live.dataset.paused=String(!!telemetry.paused);
    write(speed,format(telemetry.speedKmh));write(altitude,format(telemetry.altitudeMeters));write(headingValue,format(telemetry.headingDegrees,0));
    write(position,`X ${format(telemetry.position?.[0])}    Y ${format(telemetry.position?.[1])}    Z ${format(telemetry.position?.[2])}`);
    modeButtons.forEach((button,index)=>{button.setAttribute('aria-pressed',String(camera.mode===index));if(index===1)write(button,person?'近距':'驾驶位');});
    write(modeNote,overview?(person?'全场观察 · 距离由地图范围自动确定':'俯视当前载具，基础距离控制观察高度'):cockpit?'驾驶位视角 · 鼠标调整观察方向':person&&camera.mode===1?'近距离观察 · 固定 3.2 m，支持环绕':'自动跟随主体 · 鼠标自由环绕');
    write(actualDistance,`${format(camera.distance,2)} m`);write(actualFov,`${format(camera.fovDegrees)}°`);
    write(actualYaw,`${format(camera.yawRadians*180/Math.PI)}°`);write(actualPitch,`${format(camera.pitchRadians*180/Math.PI)}°`);
    for(const item of fields){
      if(item.key==='distance'){item.range.min=item.number.min=person?'3.2':'1';item.range.max=item.number.max=person?'12':'40';}
      if(document.activeElement!==item.number||changed)item.number.value=String(Number(profile.camera[item.key].toFixed(item.precision)));
      if(document.activeElement!==item.range||changed)item.range.value=String(profile.camera[item.key]);paintRange(item);
    }
    disable(distance,cockpit||person&&camera.mode!==0,'此模式的距离由驾驶位或地图范围决定');
    disable(response,cockpit||person&&overview,'当前模式不使用跟随阻尼');
    disable(vertical,person&&overview,'全场观察固定注视地图中心');disable(horizontal,person&&overview,'全场观察固定注视地图中心');
    disable(delay,person||camera.mode!==0,'人物保持原有自由环绕；载具仅跟随模式自动回正');disable(recenter,person||camera.mode!==0,'人物保持原有自由环绕；载具仅跟随模式自动回正');
    write(recenterNote,person?'人物使用自由环绕，不自动回正。':camera.mode!==0?'切换到跟随模式后生效。':'载具移动时回正；环绕操作会重新计时。');
    write(lensNote,person?'人物视野固定为设置值。':'随速度增加视野，上方显示实时结果。');
    collisionToggle.checked=profile.camera.collisionEnabled;collisionToggle.disabled=person&&overview;
    disable(radius,!profile.camera.collisionEnabled||person&&overview,'关闭检测或全场观察时不使用探测球');
    const collisionActive=profile.camera.collisionEnabled&&!(person&&overview);
    write(collisionState,!collisionActive?'检测未启用':camera.collisionLimited?'检测到遮挡 · 镜头已收回':'检测正常 · 镜头无遮挡');collisionState.dataset.limited=String(collisionActive&&camera.collisionLimited);
    save.dataset.dirty=String(dirty.has(activeId));
    if(changed){write(status,dirty.has(activeId)?'实时已应用 · 尚未保存到本地':'参数按当前资产独立保存。');status.dataset.error='false';}
  }
  sync();
  return {sync,focus(){modeButtons[0]!.focus({preventScroll:true});},dispose(){if(disposed)return;disposed=true;panel.remove();}};
}
