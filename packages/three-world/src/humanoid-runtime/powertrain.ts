/** 简化自动变速动力链。单位：rpm、N·m、秒；仅由车辆固定步推进。 */
export interface PowertrainConfig {
  idleRpm:number; maxRpm:number; upshiftRpm:number; downshiftRpm:number;
  /** 转速严格递增，扭矩为发动机曲轴处的 N·m。 */
  torqueCurve:readonly (readonly [number,number])[];
  forwardRatios:readonly number[]; reverseRatio:number; finalDrive:number;
  efficiency:number; shiftSeconds:number; engineBrakeTorque:number;
  /** 阻力面积 CdA（m²）及无量纲滚阻系数。 */
  dragArea:number; rollingResistance:number;
  /** 前进加速键的发动机扭矩倍率；默认 1.8，不改变刹车或倒车。 */
  boostTorqueMultiplier?:number;
}
export interface PowertrainState {
  rpm:number; gear:number; targetGear:number; shiftRemaining:number; cooldown:number;
  engagement:number; throttle:number; engineTorque:number; axleTorque:number;
  directionBraking:boolean;
}
export const DEFAULT_POWERTRAIN:PowertrainConfig={
  idleRpm:850,maxRpm:6200,upshiftRpm:5200,downshiftRpm:2100,
  torqueCurve:[[850,230],[1800,330],[3200,380],[4500,360],[6200,250]],
  forwardRatios:[3.8,2.3,1.55,1.1,.85,.68],reverseRatio:3.3,finalDrive:4.1,
  efficiency:.88,shiftSeconds:.38,engineBrakeTorque:65,dragArea:1.1,rollingResistance:.018,
};
export function createPowertrain(c:PowertrainConfig=DEFAULT_POWERTRAIN):PowertrainState {
  return {rpm:c.idleRpm,gear:1,targetGear:1,shiftRemaining:0,cooldown:0,engagement:1,throttle:0,engineTorque:0,axleTorque:0,directionBraking:false};
}
export function validatePowertrain(c:PowertrainConfig):void {
  const fail=()=>{throw new Error('VEHICLE_POWERTRAIN_CONFIG_INVALID');};
  if(c.boostTorqueMultiplier!==undefined&&(!Number.isFinite(c.boostTorqueMultiplier)||c.boostTorqueMultiplier<1||c.boostTorqueMultiplier>4))fail();
  for(const k of ['idleRpm','maxRpm','upshiftRpm','downshiftRpm','reverseRatio','finalDrive','efficiency','shiftSeconds','engineBrakeTorque','dragArea','rollingResistance'] as const){if(!Number.isFinite(c[k])||c[k]<0)fail();}
  if(c.idleRpm<100||c.maxRpm>20000||c.idleRpm>=c.downshiftRpm||c.downshiftRpm>=c.upshiftRpm||c.upshiftRpm>=c.maxRpm||c.efficiency<=0||c.efficiency>1||c.shiftSeconds<.05||c.shiftSeconds>3||c.reverseRatio<=0||c.finalDrive<=0||c.reverseRatio*c.finalDrive>100||c.rollingResistance>.2||c.dragArea>10)fail();
  if(!Array.isArray(c.forwardRatios)||!c.forwardRatios.length||c.forwardRatios.length>10||c.forwardRatios.some((r,i)=>!Number.isFinite(r)||r<=0||r*c.finalDrive>100||(i>0&&r>=c.forwardRatios[i-1]!)))fail();
  if(!Array.isArray(c.torqueCurve)||c.torqueCurve.length<2)fail();
  c.torqueCurve.forEach((p,i)=>{if(p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||p[0]<0||p[1]<0||p[1]>3000||(i>0&&p[0]<=c.torqueCurve[i-1]![0]))fail();});
  if(c.torqueCurve[0]![0]>c.idleRpm||c.torqueCurve.at(-1)![0]<c.maxRpm)fail();
}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function torqueAtRpm(c:PowertrainConfig,rpm:number):number {
  const curve=c.torqueCurve;
  for(let i=1;i<curve.length;i++){const a=curve[i-1]!,b=curve[i]!;if(rpm<=b[0])return a[1]+(b[1]-a[1])*clamp((rpm-a[0])/(b[0]-a[0]),0,1);}
  return curve.at(-1)![1];
}
export function gearRatio(c:PowertrainConfig,gear:number):number{return (gear<0?-c.reverseRatio:gear>0?c.forwardRatios[gear-1]!:0)*c.finalDrive;}
interface PowertrainInput {pedal:number;brake:boolean;speed:number;wheelOmega:number;roadWheelOmega?:number;grounded:boolean;slipping:boolean;speedLimit:number;boost?:boolean}
export function stepPowertrain(s:PowertrainState,c:PowertrainConfig,i:PowertrainInput,dt:number):void {
  if(dt<=0)return;
  s.cooldown=Math.max(0,s.cooldown-dt);
  if(s.shiftRemaining>0){s.shiftRemaining=Math.max(0,s.shiftRemaining-dt);if(s.shiftRemaining===0){s.gear=s.targetGear;s.engagement=0;s.cooldown=.65;}}
  const requested=Math.sign(i.pedal);
  // 反方向踏板先制动，接近停止才切换 D/R；不会在仍向前运动时施加倒车扭矩。
  s.directionBraking=requested!==0&&requested*i.speed<-.25;
  const shift=(gear:number)=>{s.targetGear=gear;s.gear=0;s.shiftRemaining=c.shiftSeconds;s.engagement=0;};
  if(!s.shiftRemaining&&requested&&Math.sign(s.gear)!==requested&&!s.directionBraking)shift(requested>0?1:-1);
  const desiredThrottle=i.brake||s.directionBraking?0:Math.abs(i.pedal);
  s.throttle+=(desiredThrottle-s.throttle)*(1-Math.exp(-10*dt));
  const ratio=gearRatio(c,s.gear),wheelRpm=Math.abs(i.wheelOmega*ratio)*60/(2*Math.PI);
  // 用车速对应轮速确认升挡，防止短暂空转的轮速反馈让车辆低速误升挡。
  const roadRpm=Math.abs((i.roadWheelOmega??i.wheelOmega)*ratio)*60/(2*Math.PI);
  // 起步允许液力耦合式转速差；不模拟熄火。自动换挡时断油，转速自然回落。
  const target=s.gear===0?c.idleRpm:Math.max(c.idleRpm+s.throttle*1100,wheelRpm);
  s.rpm=clamp(s.rpm+(target-s.rpm)*(1-Math.exp(-(s.gear===0?2:6)*dt)),c.idleRpm,c.maxRpm);
  const accelerating=!!i.boost&&i.pedal>0&&!i.brake&&!s.directionBraking;
  const upshiftRpm=accelerating?Math.min(c.maxRpm-350,c.upshiftRpm*1.1):c.upshiftRpm;
  if(s.gear>0&&!s.shiftRemaining&&!s.cooldown&&i.grounded&&!i.slipping&&!s.directionBraking){
    if(s.rpm>=upshiftRpm&&roadRpm>=upshiftRpm&&s.gear<c.forwardRatios.length)shift(s.gear+1);
    else if((s.rpm<c.downshiftRpm||accelerating)&&s.gear>1){
      const lowerRpm=Math.abs((i.roadWheelOmega??i.wheelOmega)*gearRatio(c,s.gear-1))*60/(2*Math.PI);
      // 加速时主动降挡，但保留升降挡回差及换挡冷却，避免来回跳挡或超转。
      if(lowerRpm<upshiftRpm*(accelerating?.85:.92))shift(s.gear-1);
    }
  }
  if(!s.shiftRemaining)s.engagement=Math.min(1,s.engagement+dt/.18);
  const limiter=clamp((c.maxRpm-Math.max(s.rpm,wheelRpm))/250,0,1);
  const speedLimiter=clamp((i.speedLimit-Math.abs(i.speed))/2,0,1);
  const boost=accelerating&&s.gear>0?(c.boostTorqueMultiplier??1.8):1;
  s.engineTorque=i.brake||s.directionBraking||s.gear===0?0:torqueAtRpm(c,s.rpm)*s.throttle*limiter*speedLimiter*boost;
  // 发动机制动也通过齿比传到轮轴，仅反抗已有的轮轴旋转。
  const engineBrake=c.engineBrakeTorque*(1-s.throttle)*clamp((wheelRpm-c.idleRpm)/1500,0,1);
  const currentRatio=gearRatio(c,s.gear);
  s.axleTorque=s.engagement*c.efficiency*(s.engineTorque*currentRatio-Math.sign(i.wheelOmega)*engineBrake*Math.abs(currentRatio));
}
