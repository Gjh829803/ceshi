import type {WorldSnapshot} from '@worldkit/three';
type WaterObservation=NonNullable<WorldSnapshot['humanoid']>['water'];
export interface WaterFeedback {
 readonly advisory:true;
 readonly code:string;
 readonly summary:string;
 readonly evidence:WaterObservation|null;
 readonly nextChecks:readonly string[];
}
const notes:Record<string,readonly [string,readonly string[]]>={
 WATER_DIAGNOSTICS_UNAVAILABLE:['当前观测没有可用的 Player 水域诊断。',['确认是否接入完整人物控制器；自定义移动请读取自身状态，并通过真实输入验证任务要求。']],
 WATER_CONTROLLER_INACTIVE:['人物水域控制器当前未参与运动，未使用旧的水域接触数据。',['检查人物是否在载具或攀越流程中；恢复人物控制后再观察。']],
 NO_WATER_DECLARED:['当前 Player 地图没有声明水域。',['若任务需要游泳，在 map.water 声明功能水域，并配套实际碰撞几何。']],
 NO_WATER_CONTACT:['已声明水域，但当前没有有效的水域接触样本。',['核对人物水平位置、脚底高度和水域范围；初始化或重置后推进短输入再观察。']],
 SWIMMING:['SDK 已根据当前水域接触进入游泳。',[]],
 SWIMMING_UNDERWATER:['原生人物处于水下游泳控制模式。',[]],
 WATER_TOO_SHALLOW:['实际支撑几何对应的水深未通过当前游泳深度判定。',['若此处本应为深水，检查池底、台阶或横穿水池的地面碰撞；让实际水深与场景意图一致。']],
 NOT_SUBMERGED_ENOUGH:['水深已满足要求，但人物尚未达到当前入水浸没条件。',['通过真实输入继续接近深水或等待入水过程，并核对人物高度与水面高度。']],
 WATER_STATE_PENDING:['接触样本的两项条件已满足，但当前观测尚未显示游泳。',['继续短输入并重新观察状态；保留时间与接触数据，避免凭动画名称判断完成。']],
};

/** Advisory only: consumes existing decision evidence, never a physics query/gate. */
export function buildWaterFeedback(value:unknown):WaterFeedback{
 const water=value as WaterObservation|undefined;
 let evidence:WaterObservation|null=null,code='WATER_DIAGNOSTICS_UNAVAILABLE';
 if(water&&Number.isSafeInteger(water.declaredVolumeCount)&&water.declaredVolumeCount>=0&&typeof water.controllerActive==='boolean'&&typeof water.swimming==='boolean'){
  const contact=water.contact;
  // Parse telemetry defensively; unavailable feedback never rejects the scene.
  const usable=contact===null||(contact&&typeof contact.volumeId==='string'&&contact.volumeId.length>0
   &&(contact.swimmingMode===null||contact.swimmingMode==='surface'||contact.swimmingMode==='underwater')
   &&[contact.surfaceHeightMeters,contact.depthMeters,contact.submersionRatio,contact.feetBelowSurfaceMeters,
    contact.requiredDepthMeters,contact.requiredFeetBelowSurfaceMeters,contact.entrySpeedMetersPerSecond].every(Number.isFinite)
   &&contact.depthMeters>=0&&contact.submersionRatio>=0&&contact.submersionRatio<=1
   &&contact.requiredDepthMeters>=0&&contact.requiredFeetBelowSurfaceMeters>=0&&contact.entrySpeedMetersPerSecond>=0
   &&Number.isSafeInteger(contact.entrySerial)&&contact.entrySerial>=0
   &&typeof contact.depthCheckPassed==='boolean'&&typeof contact.immersionCheckPassed==='boolean'&&typeof contact.wasSwimmingAtSample==='boolean');
  if(usable){
   evidence={...water,contact:water.controllerActive&&contact?{...contact}:null};
   code=!water.controllerActive?'WATER_CONTROLLER_INACTIVE':water.declaredVolumeCount===0?'NO_WATER_DECLARED':!contact?'NO_WATER_CONTACT':water.swimming?(contact.swimmingMode==='underwater'?'SWIMMING_UNDERWATER':'SWIMMING'):!contact.depthCheckPassed?'WATER_TOO_SHALLOW':!contact.immersionCheckPassed?'NOT_SUBMERGED_ENOUGH':'WATER_STATE_PENDING';
  }
 }
 const [summary,nextChecks]=notes[code]!;
 return {advisory:true,code,summary,evidence,nextChecks:[...nextChecks]};
}

/** First observed state plus changes; keeps the latest 128 events, not every frame. */
export function summarizeWaterFeedback(samples:readonly {wallSeconds?:number|null;simulationTick?:number|null;water?:unknown}[]){
 const events:Array<{wallSeconds:number|null;simulationTick:number|null;code:string;volumeId:string|null;feedback:WaterFeedback}>=[];
 let previous:string|undefined,totalTransitions=0;
 for(const sample of samples){
  if(sample.water==null)continue;
  const feedback=buildWaterFeedback(sample.water),volumeId=feedback.evidence?.contact?.volumeId??null;
  const key=JSON.stringify([feedback.code,volumeId]);if(key===previous)continue;previous=key;
  events.push({wallSeconds:sample.wallSeconds??null,simulationTick:sample.simulationTick??null,code:feedback.code,volumeId,feedback});
  totalTransitions++;if(events.length>128)events.shift();
 }
 return {events,totalTransitions,omittedTransitions:Math.max(0,totalTransitions-events.length)};
}
