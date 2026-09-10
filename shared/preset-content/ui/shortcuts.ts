import {humanoid} from '@worldkit/three';
export const controlsFor=(mode:string,bindings:humanoid.KeyBindings=humanoid.DEFAULT_KEY_BINDINGS):[string,string][]=>{
  const key=(action:humanoid.ControlAction)=>humanoid.bindingLabel(action,bindings),pair=(a:humanoid.ControlAction,b:humanoid.ControlAction)=>`${key(a)} / ${key(b)}`;
  const move=pair('forward','backward'),turn=pair('left','right'),speed=pair('sprint','crouch'),vertical=pair('jump','crouch'),roll=pair('roll','interact');
  switch(mode){
    case 'unicycle':return [[move,'踩踏前进 / 制动后倒骑'],[turn,'重心转向'],['松键','减速停稳，左脚撑地'],[key('forward'),'收脚回踏板后起步'],[key('jump'),'制动'],[key('sprint'),'加快踩踏'],[key('vehicle'),'上下独轮车']];
    case 'tank':return [[move,'前进 / 制动后倒车'],[turn,'履带差速转向（支持原地）'],[key('sprint'),'加速'],[key('jump'),'刹车'],[`${key('roll')} / ${key('interact')}`,'炮塔左右转动'],[`${key('cameraUp')} / ${key('cameraDown')}`,'炮管抬高 / 降低'],['T','第三 / 第一 / 越肩视角'],[key('vehicle'),'进出驾驶舱']];
    case 'raft':return [[move,'划桨 / 倒划（水上）'],[turn,'换侧划桨 / 滑行转向'],[key('sprint'),'快划'],[key('jump'),'水阻 / 摩擦制动'],['松键','水上惯性 / 陆地下坡'],['T','第三 / 第一 / 越肩视角'],[key('vehicle'),'上下艇']];
    case 'kayak':return [[move,'划桨前进 / 倒划'],[turn,'单侧扫桨转向'],[key('jump'),'压桨制动'],['松键','惯性滑行'],['T','第三 / 第一 / 越肩视角'],[key('vehicle'),'上下艇']];
    case 'bus':return [[move,'油门 / 制动后倒车'],[turn,'前轮转向（长轴距）'],[key('jump'),'刹车'],['T','切换第三 / 第一 / 越肩视角'],[key('vehicle'),'上下巴士']];
    case 'ski':return [[key('forward'),'低速撑杖起步'],[turn,'左右压刃转弯'],[`${key('backward')} / ${key('jump')}`,'刹停'],['松开按键','依靠重力顺坡滑行'],[key('vehicle'),'穿脱双板']];
    case 'sled':return [[key('forward'),'反复蹬地起步（低速）'],[turn,'单侧拖脚 / 重心转弯'],[`${key('backward')} / ${key('jump')}`,'双脚拖地制动'],['松开按键','依靠重力顺坡滑行'],[key('vehicle'),'上下雪橇']];
    case 'mount':case 'carriage':return [[move,'前进 / 后退'],[turn,'转向'],[speed,'疾驰 / 慢走'],[key('jump'),'勒停'],[key('vehicle'),'离开骑乘位']];
    case 'dragon':return [[move,'前进 / 后退'],[turn,'转向'],[vertical,'起飞上升 / 下降着陆'],[key('sprint'),'加速'],['松开按键','空中悬停'],[key('vehicle'),'着陆后离开']];
    case 'plane':return [[speed,'加 / 减油门'],[move,'低头 / 拉起'],[turn,'协调转弯'],[key('jump'),'地面刹车'],[key('cameraToggle'),'驾驶舱 / 外部视角'],[key('vehicle'),'停稳后离开']];
    case 'glider':return [[key('sprint'),'释放滑翔'],[move,'俯冲 / 拉起'],[turn,'转向'],[roll,'横滚'],[key('vehicle'),'离开驾驶位']];
    case 'sub':return [[move,'推进 / 后退'],[turn,'转向'],[vertical,'上浮 / 下潜'],[roll,'横滚'],[key('sprint'),'制动'],[key('vehicle'),'离开驾驶位']];
    case 'space':return [[move,'前后推进'],[turn,'偏航'],[`${pair('cameraUp','cameraDown')} / ${pair('cameraLeft','cameraRight')}`,'俯仰 / 侧移'],[vertical,'局部升降'],[roll,'横滚'],[key('sprint'),'惯性制动'],[key('vehicle'),'离开驾驶位']];
    case 'hover':return [[move,'推进 / 后退'],[turn,'转向'],[roll,'侧向移动'],[key('jump'),'减速'],[key('sprint'),'加速'],[key('vehicle'),'离开驾驶位']];
    case 'atv':case 'wheeled':return [[move,'油门 / 制动倒车'],[turn,'转向'],[key('jump'),'手刹漂移'],[key('sprint'),'加速'],[key('vehicle'),'离开驾驶位']];
    case 'jetski':return [[move,'油门 / 制动后倒船'],[turn,'喷口转向'],[key('jump'),'水阻制动'],[key('sprint'),'加速'],[key('vehicle'),'上下艇']];
    case 'boat':return [[move,'推进 / 倒船'],[turn,'船舵'],[key('jump'),'减速'],[key('sprint'),'加速'],[key('vehicle'),'离开驾驶位']];
    case 'motorcycle':case 'slide':return [[move,'前进 / 后退'],[turn,'转向'],[key('jump'),'刹车'],[key('sprint'),'加速'],[key('vehicle'),'离开载具']];
    default:return humanoid.controlHints(bindings);
  }
};
