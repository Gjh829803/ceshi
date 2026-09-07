export const controlsFor=(mode:string):[string,string][]=>{
  switch(mode){
    case 'mount':case 'carriage':return [['W / S','前进 / 后退'],['A / D','转向'],['Shift / Ctrl','疾驰 / 慢走'],['Space','勒停'],['F','离开骑乘位']];
    case 'dragon':return [['W / S','前进 / 后退'],['A / D','转向'],['Space / Ctrl','起飞上升 / 下降着陆'],['Shift','加速'],['松开按键','空中悬停'],['F','着陆后离开']];
    case 'plane':return [['Shift / Ctrl','加 / 减油门'],['W / S','俯冲 / 拉起'],['A / D','转向'],['Q / E','横滚'],['F','离开驾驶位']];
    case 'glider':return [['Shift','释放滑翔'],['W / S','俯冲 / 拉起'],['A / D','转向'],['Q / E','横滚'],['F','离开驾驶位']];
    case 'sub':return [['W / S','推进 / 后退'],['A / D','转向'],['Space / Ctrl','上浮 / 下潜'],['Q / E','横滚'],['Shift','制动'],['F','离开驾驶位']];
    case 'space':return [['W / S','前后推进'],['A / D','偏航'],['↑ ↓ / ← →','俯仰 / 侧移'],['Space / Ctrl','局部升降'],['Q / E','横滚'],['Shift','惯性制动'],['F','离开驾驶位']];
    case 'hover':return [['W / S','推进 / 后退'],['A / D','转向'],['Q / E','侧向移动'],['Space','减速'],['Shift','加速'],['F','离开驾驶位']];
    case 'wheeled':return [['W / S','油门 / 制动倒车'],['A / D','转向'],['Space','手刹漂移'],['Shift','加速'],['F','离开驾驶位']];
    case 'boat':return [['W / S','推进 / 倒船'],['A / D','船舵'],['Space','减速'],['Shift','加速'],['F','离开驾驶位']];
    case 'bike':case 'slide':return [['W / S','前进 / 后退'],['A / D','转向'],['Space','刹车'],['Shift','加速'],['F','离开载具']];
    default:return [['WASD','移动'],['Shift','冲刺'],['X / Ctrl','慢走'],['Space','跳跃 / 攀爬时脱离'],['WASD + Space','朝障碍翻越'],['C','蹲伏'],['Q / V','滑铲 / 翻滚'],['Z','匍匐'],['B','爬墙 / 梯子'],['E','拾取 / 坐下 / 起身'],['G','放下'],['N','泳姿'],['F','上下载具']];
  }
};
