import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {TrainingCharacter,CharacterAttachmentPoint} from '@worldkit/three';
import {ACCESSORY_CHOICES,type createAccessoryPreview} from './accessories';
import {icon} from '../ui/icons';
import './equipment-panel.css';

const DETAILS={
  head:{name:'头部',hint:'帽子、头盔等头部装饰',icon:'baseball-cap'},
  back:{name:'背部',hint:'背包、披风等背部装饰',icon:'backpack'},
  handLeft:{name:'左手',hint:'随左手运动的视觉道具',icon:'hand'},
  handRight:{name:'右手',hint:'随右手运动的视觉道具',icon:'hand'},
  footLeft:{name:'左脚',hint:'随左脚运动的鞋靴或护具',icon:'boot'},
  footRight:{name:'右脚',hint:'随右脚运动的鞋靴或护具',icon:'boot'},
} as const;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;node.className=className;return node;};
type Preview=ReturnType<typeof createAccessoryPreview>;

/** Static, demand-rendered equipment view. Never ticks or writes the live actor. */
export function mountEquipmentPanel(host:HTMLElement,character:TrainingCharacter,accessories:Preview,onOpenChange:(open:boolean)=>void){
  let selected:CharacterAttachmentPoint='head',disposed=false;
  const dialog=el('dialog','','equipment-panel');dialog.setAttribute('aria-label','人物装备');
  const header=el('header','','equipment-header'),heading=el('div');
  heading.append(el('span','CHARACTER / EQUIPMENT','equipment-eyebrow'),el('h2','人物装备'));
  const close=el('button','','equipment-close');close.setAttribute('aria-label','关闭人物装备');close.append(icon('close',22));close.onclick=()=>dialog.close();
  header.append(heading,el('span','Source 101 · 原始人物','equipment-model-label'),close);dialog.append(header);
  const body=el('div','','equipment-body'),slots=el('aside','','equipment-slots');slots.append(el('h3','挂载部位'));
  const stage=el('section','','equipment-stage');stage.setAttribute('aria-label','人物模型预览');
  let canvas=el('canvas');canvas.setAttribute('aria-label','可旋转缩放的人物装备模型');canvas.tabIndex=0;stage.append(canvas);
  const counter=el('span','','equipment-count');stage.append(counter);
  const instruction=el('p','拖动 / Shift＋方向键旋转 · 滚轮缩放','equipment-orbit-hint');stage.append(instruction);
  instruction.id='equipment-orbit-hint';canvas.setAttribute('aria-describedby',instruction.id);
  const detail=el('aside','','equipment-detail'),title=el('h3'),hint=el('p','','equipment-muted');
  const card=el('div','','equipment-item'),itemIcon=el('div','','equipment-item-icon'),itemName=el('strong'),itemType=el('span','视觉附件','equipment-muted');card.append(itemIcon,itemName,itemType);
  const action=el('button','','equipment-primary'),status=el('output','','equipment-status');status.setAttribute('aria-live','polite');
  detail.append(el('span','当前部位','equipment-eyebrow'),title,hint,card,action,status,el('p','手持物不改变拾取状态；披风为固定样件。','equipment-footnote'));
  body.append(slots,stage,detail);dialog.append(body);
  const footer=el('footer','','equipment-footer'),pinLabel=el('label'),showPins=el('input');showPins.type='checkbox';showPins.checked=true;pinLabel.append(showPins,document.createTextNode('显示挂点'));
  const resetView=el('button','重置视角','equipment-secondary'),clear=el('button','卸下全部','equipment-secondary');footer.append(pinLabel,resetView,el('span','佩戴状态与场景人物同步','equipment-muted'),clear);dialog.append(footer);host.append(dialog);

  const scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,.05,30);
  scene.add(new T.HemisphereLight(0xffffff,0x567277,2.8));
  const light=new T.DirectionalLight(0xffffff,2.3);light.position.set(3,5,4);scene.add(light);
  const floor=new T.Mesh(new T.CircleGeometry(.7,48),new T.MeshBasicMaterial({color:0x28474e,transparent:true,opacity:.7}));floor.rotation.x=-Math.PI/2;floor.position.y=-.012;scene.add(floor);
  let renderer:T.WebGLRenderer|undefined,controls:OrbitControls|undefined,model:T.Object3D|undefined,mixer:T.AnimationMixer|undefined;
  const buttons=new Map<CharacterAttachmentPoint,HTMLButtonElement>(),labels=new Map<CharacterAttachmentPoint,HTMLElement>(),pins=new Map<CharacterAttachmentPoint,HTMLButtonElement>();

  function render(){
    if(!renderer||!dialog.open||disposed)return;
    const width=stage.clientWidth,height=stage.clientHeight;if(!width||!height)return;
    const size=renderer.getSize(new T.Vector2());if(size.x!==width||size.y!==height)renderer.setSize(width,height,false);
    camera.aspect=width/height;camera.updateProjectionMatrix();scene.updateMatrixWorld(true);renderer.render(scene,camera);
    for(const [point,pin] of pins){
      const anchor=model?.getObjectByName(`attachment:${point}`);pin.hidden=!showPins.checked||!anchor;
      if(anchor){const p=anchor.getWorldPosition(new T.Vector3()).project(camera);pin.hidden=pin.hidden||p.z>1||p.z<-1;pin.style.left=`${(p.x+1)*width/2}px`;pin.style.top=`${(1-p.y)*height/2}px`;}
    }
  }
  function resetCamera(){camera.position.set(2.2,1.65,3.5);controls?.target.set(0,.86,0);controls?.update();render();}
  function disposeRenderer(){
    canvas.removeEventListener('webglcontextrestored',render);
    controls?.dispose();controls=undefined;
    renderer?.dispose();renderer=undefined;
  }
  function initializeRenderer(){
    if(renderer)return;
    try{
      renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true});
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
      controls=new OrbitControls(camera,canvas);
      controls.enableDamping=false;controls.enablePan=false;
      controls.minDistance=1.6;controls.maxDistance=6;controls.maxPolarAngle=Math.PI*.85;
      controls.listenToKeyEvents(canvas);controls.addEventListener('change',render);
      // Register after Three's own restoration listener has rebuilt GL state.
      canvas.addEventListener('webglcontextrestored',render);
    }catch(error){
      disposeRenderer();
      // Three installs canvas listeners before attempting context creation.
      // A failed constructor has no disposable handle: discard that canvas.
      const replacement=canvas.cloneNode(false) as HTMLCanvasElement;
      canvas.replaceWith(replacement);canvas=replacement;
      throw error;
    }
  }
  function clearModel(){
    model?.removeFromParent();mixer?.stopAllAction();if(model&&mixer)mixer.uncacheRoot(model);mixer=undefined;
    // Geometry/materials are borrowed from the live character. Only cloned
    // skeleton buffers and this preview renderer belong to the preview.
    const skeletons=new Set<T.Skeleton>();model?.traverse(node=>{if((node as T.SkinnedMesh).isSkinnedMesh)skeletons.add((node as T.SkinnedMesh).skeleton);});
    for(const skeleton of skeletons)skeleton.dispose();model=undefined;
  }
  function refreshModel(){
    clearModel();const source=character.sourceCharacter;if(!source)return;
    model=clone(source.root);model.position.set(0,0,0);model.rotation.set(0,0,0);scene.add(model);
    const idle=source.actions.idle?.getClip();
    if(idle){mixer=new T.AnimationMixer(model);mixer.clipAction(idle).play();mixer.setTime(0);}
    render();
  }
  function refresh(){
    const choice=ACCESSORY_CHOICES.find(item=>item.point===selected)!;
    title.textContent=DETAILS[selected].name;hint.textContent=DETAILS[selected].hint;
    itemName.textContent=choice.label;itemIcon.replaceChildren(icon(DETAILS[selected].icon,42));
    action.textContent=accessories.enabled(selected)?'卸下装备':'穿戴装备';
    action.dataset.equipped=String(accessories.enabled(selected));
    action.disabled=!renderer||!character.attachmentPoints.includes(selected);
    counter.textContent=`已装备 ${ACCESSORY_CHOICES.filter(item=>accessories.enabled(item.point)).length} / ${ACCESSORY_CHOICES.length}`;
    for(const {point,label} of ACCESSORY_CHOICES){
      buttons.get(point)!.setAttribute('aria-pressed',String(point===selected));
      labels.get(point)!.textContent=accessories.enabled(point)?label:'未装备';
      pins.get(point)!.dataset.selected=String(point===selected);
    }
  }
  function select(point:CharacterAttachmentPoint){selected=point;status.textContent='';refresh();buttons.get(point)?.scrollIntoView({block:'nearest'});render();}
  for(const {point} of ACCESSORY_CHOICES){
    const button=el('button','','equipment-slot');button.append(icon(DETAILS[point].icon,24));
    const text=el('span'),name=el('strong',DETAILS[point].name),label=el('small');text.append(name,label);button.append(text);button.onclick=()=>select(point);
    buttons.set(point,button);labels.set(point,label);slots.append(button);
    const pin=el('button',DETAILS[point].name,'equipment-pin');pin.setAttribute('aria-label',`选择${DETAILS[point].name}挂点`);pin.onclick=()=>select(point);pins.set(point,pin);stage.append(pin);
  }
  action.onclick=()=>{
    try{accessories.set(selected,!accessories.enabled(selected));refresh();refreshModel();status.textContent=accessories.enabled(selected)?'已穿戴到场景人物':'已卸下';}
    catch(error){status.textContent='装备预览更新失败，请关闭后重试。';console.error('EQUIPMENT_PREVIEW_UPDATE_FAILED',error);}
  };
  clear.onclick=()=>{for(const {point} of ACCESSORY_CHOICES)accessories.set(point,false);refresh();refreshModel();status.textContent='已卸下全部装备';};
  showPins.onchange=render;resetView.onclick=resetCamera;
  const resize=new ResizeObserver(render);resize.observe(stage);
  // Native close events are queued. A prior close must not resume the world
  // after this dialog has already reopened.
  dialog.addEventListener('close',()=>{if(!disposed&&!dialog.open)onOpenChange(false);});
  refresh();
  return {
    open(){
      if(disposed||dialog.open)return;dialog.showModal();onOpenChange(true);
      try{
        initializeRenderer();status.textContent='';refresh();refreshModel();resetCamera();
      }catch(error){
        clearModel();refresh();status.textContent='人物预览暂时无法显示，请关闭后重试。';
        console.error('EQUIPMENT_PREVIEW_OPEN_FAILED',error);
      }
    },
    dispose(){
      if(disposed)return;disposed=true;dialog.close();resize.disconnect();clearModel();floor.geometry.dispose();floor.material.dispose();disposeRenderer();dialog.remove();
    },
  };
}
