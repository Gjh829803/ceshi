import {humanoid} from '@worldkit/three';
export const controlsFor=(mode:string,bindings:humanoid.KeyBindings=humanoid.DEFAULT_KEY_BINDINGS):[string,string][]=>{
  const key=(action:humanoid.ControlAction)=>humanoid.bindingLabel(action,bindings),pair=(a:humanoid.ControlAction,b:humanoid.ControlAction)=>`${key(a)} / ${key(b)}`;
  const move=pair('forward','backward'),turn=pair('left','right'),speed=pair('sprint','crouch'),vertical=pair('jump','crouch'),roll=pair('roll','interact');
  switch(mode){
    case 'mount':case 'carriage':return [[move,'前进 / 后退'],[turn,'转向'],[speed,'疾驰 / 慢走'],[key('jump'),'勒停'],[key('vehicle'),'离开骑乘位']];
    case 'dragon':return [[move,'前进 / 后退'],[turn,'转向'],[vertical,'起飞上升 / 下降着陆'],[key('sprint'),'加速'],['松开按键','空中悬停'],[key('vehicle'),'着陆后离开']];
    case 'plane':return [[speed,'加 / 减油门'],[move,'俯冲 / 拉起'],[turn,'转向'],[roll,'横滚'],[key('vehicle'),'离开驾驶位']];
    case 'glider':return [[key('sprint'),'释放滑翔'],[move,'俯冲 / 拉起'],[turn,'转向'],[roll,'横滚'],[key('vehicle'),'离开驾驶位']];
    case 'sub':return [[move,'推进 / 后退'],[turn,'转向'],[vertical,'上浮 / 下潜'],[roll,'横滚'],[key('sprint'),'制动'],[key('vehicle'),'离开驾驶位']];
    case 'space':return [[move,'前后推进'],[turn,'偏航'],[`${pair('cameraUp','cameraDown')} / ${pair('cameraLeft','cameraRight')}`,'俯仰 / 侧移'],[vertical,'局部升降'],[roll,'横滚'],[key('sprint'),'惯性制动'],[key('vehicle'),'离开驾驶位']];
    case 'hover':return [[move,'推进 / 后退'],[turn,'转向'],[roll,'侧向移动'],[key('jump'),'减速'],[key('sprint'),'加速'],[key('vehicle'),'离开驾驶位']];
    case 'wheeled':return [[move,'油门 / 制动倒车'],[turn,'转向'],[key('jump'),'手刹漂移'],[key('sprint'),'加速'],[key('vehicle'),'离开驾驶位']];
    case 'boat':return [[move,'推进 / 倒船'],[turn,'船舵'],[key('jump'),'减速'],[key('sprint'),'加速'],[key('vehicle'),'离开驾驶位']];
    case 'bike':case 'slide':return [[move,'前进 / 后退'],[turn,'转向'],[key('jump'),'刹车'],[key('sprint'),'加速'],[key('vehicle'),'离开载具']];
    default:return humanoid.controlHints(bindings);
  }
};
