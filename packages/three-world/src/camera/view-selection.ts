import type {CameraViewSelectionRule} from '../config/camera';

export interface CameraViewSelectionMemory {
  readonly manualViewId?: string;
  readonly activeRuleId?: string;
  readonly pending?: {readonly viewId:string;readonly ruleId?:string|undefined;readonly elapsedSeconds:number};
}
export type CameraViewAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly failure?: { readonly code: string; readonly message: string; readonly fieldPath?: string } };
export interface CameraViewSelectionInspection {
  readonly source: 'default'|'rule'|'manual'|'retained';
  readonly viewId:string;
  readonly ruleId?:string|undefined;
  readonly pending?:CameraViewSelectionMemory['pending'];
  readonly unavailableRules:readonly {readonly ruleId:string;readonly viewId:string;readonly reason:'state-unavailable'|'view-unavailable';readonly failure?:Extract<CameraViewAvailability,{available:false}>['failure']}[];
  readonly suspendedBy?:'editing'|'episode';
  readonly unavailableDefaultView?: {readonly viewId:string;readonly failure?:Extract<CameraViewAvailability,{available:false}>['failure']};
}
/** Pure choice from committed facts. No clock, actor mutation, or camera writes. */
export function selectCameraView(input:{
  readonly rules:readonly CameraViewSelectionRule[];
  readonly defaultViewId:string;
  readonly currentViewId:string;
  readonly states?:{readonly swimming?:boolean}|undefined;
  readonly memory:CameraViewSelectionMemory;
  readonly deltaSeconds:number;
  readonly available:(viewId:string)=>CameraViewAvailability;
}):{viewId:string;memory:CameraViewSelectionMemory;inspection:CameraViewSelectionInspection} {
  const {rules,memory,currentViewId,available}=input;
  const unavailableRules:CameraViewSelectionInspection['unavailableRules'][number][]=[];
  if(memory.manualViewId)return {viewId:memory.manualViewId,memory,inspection:{source:'manual',viewId:memory.manualViewId,unavailableRules}};
  let selected:CameraViewSelectionRule|undefined;
  for(const {rule} of rules.map((rule,index)=>({rule,index})).sort((a,b)=>(b.rule.priority??0)-(a.rule.priority??0)||a.index-b.index)) {
    const state=input.states?.[rule.when.state];
    if(state===undefined){unavailableRules.push({ruleId:rule.id,viewId:rule.viewId,reason:'state-unavailable'});continue;}
    if(!state)continue;
    const availability=available(rule.viewId);
    if(!availability.available){unavailableRules.push({ruleId:rule.id,viewId:rule.viewId,reason:'view-unavailable',...(availability.failure?{failure:availability.failure}:{})});continue;}
    selected=rule;break;
  }
  const target=selected?.viewId??input.defaultViewId;
  if(!selected){
    const fallback=available(target);
    if(!fallback.available)return {viewId:currentViewId,memory:{},inspection:{source:'retained',viewId:currentViewId,unavailableRules,unavailableDefaultView:{viewId:target,...(fallback.failure?{failure:fallback.failure}:{})}}};
  }
  const delay=Math.max(selected?.enterDelaySeconds??0,rules.find(rule=>rule.id===memory.activeRuleId&&rule.id!==selected?.id)?.exitDelaySeconds??0);
  const elapsed=memory.pending?.viewId===target&&memory.pending.ruleId===selected?.id?memory.pending.elapsedSeconds+input.deltaSeconds:input.deltaSeconds;
  // Delay a change only while the current view remains usable. A disappearing
  // eye/seat anchor must yield to a legal fallback before input and pose solving.
  if(target!==currentViewId&&elapsed+1e-12<delay&&available(currentViewId).available) {
    const pending={viewId:target,...(selected?{ruleId:selected.id}:{}),elapsedSeconds:elapsed};
    return {viewId:currentViewId,memory:{...memory,pending},inspection:{source:memory.activeRuleId?'rule':'default',viewId:currentViewId,ruleId:memory.activeRuleId,pending,unavailableRules}};
  }
  return {viewId:target,memory:{...(selected?{activeRuleId:selected.id}:{})},inspection:{source:selected?'rule':'default',viewId:target,...(selected?{ruleId:selected.id}:{}),unavailableRules}};
}
