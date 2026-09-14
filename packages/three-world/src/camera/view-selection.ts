import type {CameraViewSelectionRule} from '../config/camera';

export interface CameraViewSelectionMemory {
  readonly manualViewId?: string;
  readonly activeRuleId?: string;
  readonly pending?: {readonly viewId:string;readonly ruleId?:string|undefined;readonly elapsedSeconds:number};
}
export interface CameraViewSelectionInspection {
  readonly source: 'default'|'rule'|'manual'|'retained';
  readonly viewId:string;
  readonly ruleId?:string|undefined;
  readonly pending?:CameraViewSelectionMemory['pending'];
  readonly unavailableRules:readonly {readonly ruleId:string;readonly reason:'state-unavailable'|'view-unavailable'}[];
  readonly suspendedBy?:'editing'|'episode';
}
/** Pure choice from committed facts. No clock, actor mutation, or camera writes. */
export function selectCameraView(input:{
  readonly rules:readonly CameraViewSelectionRule[];
  readonly defaultViewId:string;
  readonly currentViewId:string;
  readonly states?:{readonly swimming?:boolean}|undefined;
  readonly memory:CameraViewSelectionMemory;
  readonly deltaSeconds:number;
  readonly available:(viewId:string)=>boolean;
}):{viewId:string;memory:CameraViewSelectionMemory;inspection:CameraViewSelectionInspection} {
  const {rules,memory,currentViewId,available}=input;
  const unavailableRules:{ruleId:string;reason:'state-unavailable'|'view-unavailable'}[]=[];
  if(memory.manualViewId)return {viewId:memory.manualViewId,memory,inspection:{source:'manual',viewId:memory.manualViewId,unavailableRules}};
  let selected:CameraViewSelectionRule|undefined;
  for(const {rule} of rules.map((rule,index)=>({rule,index})).sort((a,b)=>(b.rule.priority??0)-(a.rule.priority??0)||a.index-b.index)) {
    const state=input.states?.[rule.when.state];
    if(state===undefined){unavailableRules.push({ruleId:rule.id,reason:'state-unavailable'});continue;}
    if(!state)continue;
    if(!available(rule.viewId)){unavailableRules.push({ruleId:rule.id,reason:'view-unavailable'});continue;}
    selected=rule;break;
  }
  const target=selected?.viewId??input.defaultViewId;
  if(!selected&&!available(target))return {viewId:currentViewId,memory:{},inspection:{source:'retained',viewId:currentViewId,unavailableRules}};
  const delay=Math.max(selected?.enterDelaySeconds??0,rules.find(rule=>rule.id===memory.activeRuleId&&rule.id!==selected?.id)?.exitDelaySeconds??0);
  const elapsed=memory.pending?.viewId===target&&memory.pending.ruleId===selected?.id?memory.pending.elapsedSeconds+input.deltaSeconds:input.deltaSeconds;
  // Delay a change only while the current view remains usable. A disappearing
  // eye/seat anchor must yield to a legal fallback before input and pose solving.
  if(target!==currentViewId&&elapsed+1e-12<delay&&available(currentViewId)) {
    const pending={viewId:target,...(selected?{ruleId:selected.id}:{}),elapsedSeconds:elapsed};
    return {viewId:currentViewId,memory:{...memory,pending},inspection:{source:memory.activeRuleId?'rule':'default',viewId:currentViewId,ruleId:memory.activeRuleId,pending,unavailableRules}};
  }
  return {viewId:target,memory:{...(selected?{activeRuleId:selected.id}:{})},inspection:{source:selected?'rule':'default',viewId:target,...(selected?{ruleId:selected.id}:{}),unavailableRules}};
}
