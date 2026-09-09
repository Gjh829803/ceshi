import {CONTROL_RANGES,type ControlKey} from './control';
type Key=ControlKey;
export type ControlField={key:Key;label:string;unit:string;step:number;note:string;section:'速度范围'|'加速与减速'|'转向与稳定'|'专项运动';disabled?:boolean};

/** Shared parameter meaning and controller-family applicability. No simulation state. */
export function controlFields(family:string):ControlField[]{
 if(family==='unicycle')return controlFields('wheeled').filter(f=>['speed','maxSpeed','reverseSpeed','accel','coastDeceleration','brakeDeceleration','steer','steeringResponse','steeringReturn','pitchResponse','rollResponse'].includes(f.key)).map(f=>({...f,note:f.key==='accel'?'收脚回踏板后建立踩踏推进；悬空时无推进。':f.key==='coastDeceleration'?'松键自动减速；停稳后左脚寻找真实地面支撑。':f.key==='steer'?'依靠重心转向；原地不转动，低速转向减弱。':f.note,label:f.key==='steer'?'平衡转向速率':f.label,unit:f.key==='steer'?'rad/s':f.unit}));
 if(family==='raft')return [...controlFields('kayak').map(f=>({...f,note:f.key==='speed'?'单人划行限速；Shift 提高划桨频率。':f.key==='accel'?'桨叶入水时产生推进；地面只受重力和摩擦。':f.note})),{key:'brakeDeceleration',label:'陆地制动',unit:'m/s²',step:.1,note:'Space 拖地制动；松键仍可沿坡面滑动。',section:'加速与减速'}];
 if(family==='kayak')return [
  {key:'speed',label:'前划限速',unit:'m/s',step:.1,note:'划桨速度上限；Shift 不增加动力。',section:'速度范围'},
  {key:'reverseSpeed',label:'倒划限速',unit:'m/s',step:.1,note:'反向划桨先抵消前进动量。',section:'速度范围'},
  {key:'accel',label:'划桨峰值加速度',unit:'m/s²',step:.1,note:'每 1.12 秒一次单侧划桨；回桨不推进。',section:'加速与减速'},
  {key:'coastDeceleration',label:'线性水阻',unit:'/s',step:.01,note:'无输入时保留动量并逐渐滑停。',section:'加速与减速'},
  {key:'dragQuadratic',label:'速度平方水阻',unit:'1/m',step:.001,note:'高速时阻力更明显。',section:'加速与减速'},
  {key:'brakeDamping',label:'压桨制动阻尼',unit:'/s',step:.1,note:'Space 将桨叶压入水中减速。',section:'加速与减速'},
  {key:'grip',label:'侧向水阻',unit:'/s',step:.1,note:'船头转动后仍保留短暂横向惯性。',section:'转向与稳定'},
  {key:'steer',label:'扫桨角加速度',unit:'rad/s²',step:.1,note:'低速可用单侧桨转向，转动有惯性。',section:'转向与稳定'},
 ];
 if(family==='jetski')return controlFields('atv').map(f=>({...f,note:f.key==='steer'?'喷口偏航速率；有推进时转向强，松油后减弱。':f.key==='brakeDeceleration'?'S 先制动后倒船；Space 水阻制动。':f.note,label:f.key==='steer'?'喷口转向速率':f.label,unit:f.key==='steer'?'rad/s':f.unit}));
 if(family==='atv')return controlFields('wheeled').filter(f=>['speed','maxSpeed','reverseSpeed','accel','grip','coastDeceleration','brakeDeceleration','steer','steeringResponse','steeringReturn','throttleResponse','pitchResponse','rollResponse'].includes(f.key)).map(f=>({...f,note:f.key==='steer'?'低速车把转角；高速减小转角，静止不能原地旋转。':f.note,label:f.key==='steer'?'低速转向角':f.label,unit:f.key==='steer'?'rad':f.unit}));
 if(family==='tank')return controlFields('wheeled').filter(f=>['speed','maxSpeed','reverseSpeed','accel','coastDeceleration','brakeDeceleration','steer','steeringResponse','steeringReturn','throttleResponse','pitchResponse','rollResponse'].includes(f.key)).map(f=>({...f,note:f.key==='steer'?'履带差速偏航速率；静止支持原地转向。':f.note,label:f.key==='steer'?'差速转向速率':f.label,unit:f.key==='steer'?'rad/s':f.unit}));
 if(family==='bus')return [
  {key:'speed',label:'前进限速',unit:'m/s',step:.1,note:'满油门速度上限；Shift 不提供额外动力。',section:'速度范围'},
  {key:'reverseSpeed',label:'倒车限速',unit:'m/s',step:.1,note:'S 先制动，再低速倒车。',section:'速度范围'},
  {key:'accel',label:'起步加速度',unit:'m/s²',step:.1,note:'随车速增加逐渐减弱；油门有建立过程。',section:'加速与减速'},
  {key:'coastDeceleration',label:'松油滑行减速度',unit:'m/s²',step:.1,note:'松开油门后的滚动阻力。',section:'加速与减速'},
  {key:'brakeDeceleration',label:'制动减速度',unit:'m/s²',step:.1,note:'S 反向制动和 Space 刹车使用此值。',section:'加速与减速'},
  {key:'steer',label:'前轮最大转角',unit:'rad',step:.01,note:'结合 3.3 米轴距计算转弯；高速减小转角。',section:'转向与稳定'},
  ...(['steeringResponse','steeringReturn','throttleResponse','pitchResponse','rollResponse'] as const).map(key=>({key,label:({steeringResponse:'转向响应',steeringReturn:'转向回正',throttleResponse:'油门响应',pitchResponse:'俯仰响应',rollResponse:'车身侧倾响应'})[key],unit:'/s',step:.1,note:'数值越大响应越快。',section:'转向与稳定' as const})),
 ];
 if(family==='ski')return controlFields('sled').map(field=>({...field,label:field.label.replaceAll('蹬地','撑杖').replaceAll('滑条','雪板').replaceAll('拖脚','压刃'),note:field.note.replaceAll('蹬地','撑杖').replace('收脚','停止撑杖').replaceAll('滑条','雪板').replaceAll('雪橇','双板').replace('S / Space 双脚刹车；A / D 单侧拖脚产生部分阻力。','S / Space 制动；A / D 压刃转弯并损失部分速度。')}));
 if(family==='sled')return [
  {key:'speed',label:'下坡安全限速',unit:'m/s',step:.1,note:'重力滑行的速度上限；Shift 不提供动力。',section:'速度范围'},
  {key:'groundSpeed',label:'蹬地速度上限',unit:'m/s',step:.1,note:'超过此速度收脚；W 不能在高速时继续加速。',section:'速度范围'},
  {key:'accel',label:'蹬地峰值加速度',unit:'m/s²',step:.1,note:'每 0.85 秒一次的蹬地脉冲。',section:'加速与减速'},
  {key:'coastDeceleration',label:'滑条摩擦减速度',unit:'m/s²',step:.01,note:'持续摩擦；默认模拟压实雪面。',section:'加速与减速'},
  {key:'brakeDeceleration',label:'拖脚制动减速度',unit:'m/s²',step:.1,note:'S / Space 双脚刹车；A / D 单侧拖脚产生部分阻力。',section:'加速与减速'},
  {key:'dragQuadratic',label:'空气阻力系数',unit:'1/m',step:.001,note:'减速度 = 系数 × 速度平方。',section:'加速与减速'},
  {key:'grip',label:'滑条侧向阻尼',unit:'/s',step:.1,note:'低值允许横滑；转向后动量逐渐跟随雪橇。',section:'转向与稳定'},
  {key:'steer',label:'拖脚转向速率',unit:'rad/s',step:.01,note:'随速度建立转向效果；静止不能原地转圈。',section:'转向与稳定'},
  ...(['steeringResponse','steeringReturn','pitchResponse','rollResponse'] as const).map(key=>({key,label:({steeringResponse:'转向响应',steeringReturn:'转向回弹',pitchResponse:'顺坡俯仰响应',rollResponse:'横坡姿态响应'})[key],unit:'/s',step:.1,note:'数值越大响应越快。',section:'转向与稳定' as const})),
 ];
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
 return fields;
}
export const controlKeys=Object.keys(CONTROL_RANGES) as Key[];

/** Discovery only: stored complete profiles may retain inactive family fields. */
export function controlSchemaForFamily(family:string){
 return Object.fromEntries(controlFields(family).filter(field=>!field.disabled).map(field=>{
  const [minimum,maximum]=CONTROL_RANGES[field.key];
  return [field.key,{type:'number',minimum,maximum,description:`${field.label} (${field.unit}): ${field.note}`}];
 }));
}
