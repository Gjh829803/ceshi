import {CONTROL_RANGES,type ControlKey} from './control';
type Key=ControlKey;
export type ControlField={key:Key;label:string;unit:string;step:number;note:string;section:'速度范围'|'加速与减速'|'转向与稳定'|'专项运动';disabled?:boolean};

/** UI descriptions only; defaults and numeric validation live in the SDK. */
export function controlFields(family:string,powertrain=false):ControlField[]{
 const person=family==='character',road=['wheeled','bike'].includes(family),creature=['mount','carriage'].includes(family),dragon=family==='dragon',air=['plane','glider'].includes(family),sub=family==='sub',space=family==='space',surface=['wheeled','bike','slide','hover','boat'].includes(family);
 const fields:ControlField[]=[];
 const add=(key:Key,label:string,unit:string,note:string,section:ControlField['section'],step=.1,disabled=false)=>fields.push({key,label,unit,note,section,step,disabled});
 add('speed',person?'基础移速基准':creature?'步态速度基准':air||sub||space?'最大移速':'基础移速上限','m/s',person?'实际常速 = 基准 × 3.1 / 3.8；蹲行同基准缩放，冲刺与慢走独立。':creature?'普通步态速度 = 基准 × 0.58；加速步态独立使用最大移速。':air?'飞行速度上限；俯冲与推力仍受此限速。':'基础输入下的速度上限，不会在起步时瞬间赋速。','速度范围');
 if(person||surface||creature||dragon)add('maxSpeed',person?'冲刺最大移速':'加速最大移速','m/s','Shift 加速状态使用的独立速度上限，不随基础移速自动改变。','速度范围');
 if(surface||creature||dragon)add('reverseSpeed','倒车速度上限','m/s',dragon?'飞行倒退的速度上限。':'反向输入时的独立限速，不随前进上限改变。','速度范围');
 if(person||creature)add('slowSpeed','慢走速度','m/s','慢走输入使用的独立目标速度。','速度范围');
 if(dragon)add('groundSpeed','地面行走速度','m/s','龙在地面时使用的速度；不改变飞行限速。','速度范围');
 add('accel',person?'地面加速基准':'推进加速度','m/s²',family==='glider'?'无动力滑翔机没有主动推力。':person?'实际地面加速度 = 基准 × 14 / 12；松键减速独立。':'从当前速度趋向目标速度的推进加速度。','加速与减速',.1,family==='glider');
 if(person||surface||creature||dragon)add('coastDeceleration','松键减速度','m/s²',dragon?'空中松开前进键的减速度；地面使用地面减速。':'无前进/后退输入时的线性减速度；0 保留滑行，碰撞仍有效。','加速与减速');
 if(surface||creature)add('brakeDeceleration',creature?'刹车减速度':'反向制动减速度','m/s²','反向制动使用此值；骑乘动物和马车的刹车输入使用此值。','加速与减速');
 if(creature||dragon)add('directionChangeDeceleration','换向减速度','m/s²','输入方向与当前前进速度相反时，先按此值减速换向。','加速与减速');
 if(dragon)add('groundDeceleration','地面松键减速度','m/s²','地面行走松键后的独立减速度，不改变空中滑行。','加速与减速');
 if(surface||sub||space)add('brakeDamping',surface?'手刹减速阻尼':'强制制动阻尼','/s',surface?'Space 手刹使用指数减速；与松油滑行、反向制动独立。':'Shift 制动时使用的指数阻尼；数值越大停得越快。','加速与减速');
 const noGrip=air||creature||dragon;
 add('grip',person?'空中加速基准':space?'平移稳定辅助':'侧向抓地 / 阻尼',person?'m/s²':'/s',noGrip?'此家族不使用该参数；请调整下方对应减速或阻力。':person?'实际空中加速度 = 基准 × 5 / 3。':space?'抑制无输入局部轴的漂移；0 保留惯性。':'数值越大，侧向滑动越快衰减。','转向与稳定',.1,noGrip);
 add('steer',person?'转身速率基准':road?'转向倍率':'偏航速率',road?'×':'rad/s',person?'实际转身角速度 = 基准 × 8 / 14。':road?'对随车速变化的转向曲线施加倍率。':space?'同时影响俯仰、横滚和偏航的角速度。':'主体偏航转向的速率。','转向与稳定',.01);
 if(!person){add('steeringResponse','转向输入响应','/s','按下方向键时，转向量趋近输入的速度。','转向与稳定');add('steeringReturn','松键转向回弹','/s','松开方向键时，转向量回到零的速度。','转向与稳定');}
 if(person)add('jumpSpeed','跳跃初速度','m/s','普通起跳的垂直初速度；不修改越障动作和重力。','专项运动');
 if(sub){add('verticalAcceleration','升降加速度','m/s²','上浮/下潜的独立推进加速度。','专项运动');add('linearDamping','松键水平阻尼','/s','无前后输入时，水平速度的指数衰减。','加速与减速');add('verticalDamping','松键升降阻尼','/s','无升降输入时，垂直速度的指数衰减。','加速与减速');}
 if(air||sub)add('drag',sub?'推进时水平阻尼':'基础空气减速',sub?'/s':'m/s²',sub?'有前后推进输入时的水平阻力。':'基础空气阻力产生的减速度。','加速与减速',.01);
 if(air){add('dragQuadratic','速度平方阻力系数','1/m','额外减速度 = 系数 × 当前速度²；不会改变重力分量。','加速与减速',.0001);add('minimumSpeed','最低飞行速度','m/s','积分速度下限；实际不超过最大移速，失速仍会下沉。','速度范围');add('rollResponse','横滚姿态响应','/s','向目标横滚姿态靠拢的速度。','专项运动');}
 if(air||sub)add('pitchResponse','俯仰姿态响应','/s','向目标俯仰姿态靠拢的速度。','专项运动');
 if(family==='plane')add('throttleResponse','油门升降速率','/s','Shift / Ctrl 每秒增加或减少的油门量（油门范围 0–1）。','专项运动',.01);
 if(family==='glider')add('launchSpeed','弹射初速度','m/s','再次准备后按 Shift 发射的初速度。','专项运动');
 if(powertrain)for(const f of fields){
  if(['accel','coastDeceleration','brakeDamping'].includes(f.key)){f.disabled=true;f.note='动力链模式：加速由发动机与齿比决定；滑行由发动机制动、滚阻和风阻决定。';}
  if(f.key==='brakeDeceleration'){f.label='制动力基准';f.note='换向制动和 Space 制动的最大轮轴制动扭矩基准，实际制动力受抓地力限制。';}
  if(f.key==='grip'){f.label='轮胎侧向响应';f.unit='/s';f.note='侧向滑动的衰减速率；摩擦上限由轮胎材质倍率、轮载和地面摩擦独立决定。';}
  if(family==='wheeled'&&f.key==='steer')f.note='控制完整机械舵角；高速平滑转向过程，最终舵角不随车速缩小。';
  if(family==='wheeled'&&['steeringResponse','steeringReturn'].includes(f.key))f.note+=' 高速按 1 + 前向速度绝对值 / 20 平滑响应，保留完整舵角。';
 }
 return fields;
}
export const controlKeys=Object.keys(CONTROL_RANGES) as Key[];

/** Discovery only: stored complete profiles may retain inactive family fields. */
export function controlSchemaForFamily(family:string,powertrain=false){
 return Object.fromEntries(controlFields(family,powertrain).filter(field=>!field.disabled).map(field=>{
  const [minimum,maximum]=CONTROL_RANGES[field.key];
  return [field.key,{type:'number',minimum,maximum,description:`${field.label} (${field.unit}): ${field.note}`}];
 }));
}
