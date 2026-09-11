import {hashVisualInput, THREE_EPISODE_STYLE_IDS} from './visual-contracts.mjs';
import {resolveUserAnchorAcceptance} from '../review/review-policy.mjs';

/** An explicit continuation imports image bytes and spent budgets, never a new
 * user verdict. Cross-plan approvals require identical variant definitions. */
export function validateAnchorContinuation(value, {source,plan,whiteboxOpeningSha256}) {
  const fail=message=>{throw new Error(`EPISODE_ANCHOR_CONTINUATION_INVALID: ${message}`)};
  if(value?.kind!=='three-episode-anchor-continuation'||value.schemaVersion!==1||value.worldBuildHash!==source.worldBuildHash||value.runtimeHash!==source.runtimeHash||value.whiteboxOpeningSha256!==whiteboxOpeningSha256)fail('world/runtime/opening changed');
  if(!value.plan||!value.historicalPlan||!Array.isArray(value.anchors)||value.anchors.length!==10)fail('incomplete closure');
  for(const [index,id]of THREE_EPISODE_STYLE_IDS.entries()){
    const item=value.anchors[index];
    if(item?.id!==id||hashVisualInput(plan.variants[index])!==hashVisualInput(value.plan.variants[index]))fail(`variant ${id} changed`);
    if(!/^[a-f0-9]{64}$/.test(item.image?.sha256??'')||typeof item.image.path!=='string'||!Number.isInteger(item.previousAttemptCount)||item.previousAttemptCount<1||item.previousAttemptCount>20||!Number.isInteger(item.additionalOpeningAttempts)||item.additionalOpeningAttempts<0||item.additionalOpeningAttempts>2)fail(`invalid image/budget ${id}`);
  }
  return value;
}
export function carriedUserAnchorAcceptance(calibration, continuation, identity, variant) {
  if(!continuation||identity.scope!=='opening-anchor-only')return null;
  const priorVariant=continuation.historicalPlan.variants.find(v=>v.id===variant.id);
  if(!priorVariant||hashVisualInput(priorVariant)!==hashVisualInput(variant))return null;
  const item=continuation.anchors.find(a=>a.id===variant.id);
  if(item?.image.sha256!==identity.imageSha256)return null;
  const original=resolveUserAnchorAcceptance(calibration,{...identity,planHash:hashVisualInput(continuation.historicalPlan)});
  if(!original)return null;
  return {...original,kind:'three-episode-carried-user-anchor-acceptance',planHash:identity.planHash,
    sourceAcceptance:original,unchangedVariantHash:hashVisualInput(variant),continuationHash:hashVisualInput(continuation)};
}
