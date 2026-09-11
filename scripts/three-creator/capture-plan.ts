export interface CaptureTargetDescriptor {
 id:string;
 sourceEntityId:string;
 representative?:{kind:'object'|'instance';objectUuid:string;instanceIndex?:number};
}
/** One sheet contains front/right/back; opening and overview are not object sheets. */
export function selectTriviewTargets(targets:readonly CaptureTargetDescriptor[],includeAdditionalTargets=false) {
 if(typeof includeAdditionalTargets!=='boolean'||!Array.isArray(targets)||targets[0]?.id!=='player'||
  targets.some(value=>!value||typeof value.id!=='string'||!value.id||typeof value.sourceEntityId!=='string'||!value.sourceEntityId)||
  new Set(targets.map(value=>value.id)).size!==targets.length)throw new Error('THREE_CAPTURE_PLAN_INVALID: require a unique subject-first target plan.');
 if(includeAdditionalTargets&&targets.length>100)throw new Error('THREE_CAPTURE_TARGET_BUDGET_EXCEEDED: at most 100 explicitly selected important targets can be included in one delivery.');
 return {selectionPolicy:'important-representatives-v1' as const,
  selectedTargets:targets.slice(0,includeAdditionalTargets?targets.length:5),
  conditioningEntityIds:targets.slice(0,5).map(value=>value.id),
  omittedEntityIds:includeAdditionalTargets?[]:targets.slice(5).map(value=>value.id)};
}

/** Shape check for same-version capture reuse; file hashes are verified separately. */
export function hasRequiredCaptureViews(report:{images?:readonly {view?:string;entityIds?:readonly string[]}[]}|undefined):boolean{
 const images=report?.images;
 return Array.isArray(images)&&images[0]?.view==='opening'&&images[1]?.view==='top-down'&&
  images.slice(2).some(image=>image.view==='entity-triview'&&image.entityIds?.includes('player'));
}
