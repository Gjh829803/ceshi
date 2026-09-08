import {createHash} from 'node:crypto';

const identity=id=>createHash('sha256').update(id).digest('hex');
export function validateCreatorAccountPolicy(policy) {
  if(policy?.schemaVersion!==1||policy.scope!=='worldkit-creator'||!Array.isArray(policy.preferred)||!Array.isArray(policy.denied)||policy.allowUnratedFallback!==false)throw Error('CREATOR_ACCOUNT_POLICY_INVALID');
  if(policy.selection!==undefined&&!['single','pool'].includes(policy.selection))throw Error('CREATOR_ACCOUNT_SELECTION_MODE_INVALID');
  if(policy.selection==='pool'&&(policy.codexAccountRoot===undefined||policy.preferred.length>64))throw Error('CREATOR_ACCOUNT_POOL_POLICY_INVALID');
  if(policy.probation!==undefined&&!Array.isArray(policy.probation))throw Error('CREATOR_ACCOUNT_POLICY_INVALID');
  if(policy.codexAccountRoot!==undefined&&(typeof policy.codexAccountRoot!=='string'||!policy.codexAccountRoot.startsWith('/fsx/pipeline/worldkit-three-creator-experiments/')||policy.codexAccountRoot.split('/').slice(1).some(part=>! /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part)||part==='.'||part==='..')))throw Error('CREATOR_ACCOUNT_ROOT_INVALID');
  const all=[...policy.preferred,...policy.denied,...(policy.probation??[])];
  if(!policy.preferred.length||all.some(row=>typeof row.label!=='string'||!/^[a-f0-9]{64}$/.test(row.identitySha256??''))||new Set(all.map(row=>row.identitySha256)).size!==all.length)throw Error('CREATOR_ACCOUNT_POLICY_INVALID');
  return policy;
}
/** Shared pools preserve the requested cohort; single pools bind its one identity. */
export function creatorAccountRoot(ids,policy) {
  assertCreatorAccountSelection(ids,policy);
  if(policy.codexAccountRoot===undefined)return undefined;
  if(policy.selection==='pool')return policy.codexAccountRoot;
  if(ids.length!==1)throw Error('CREATOR_ACCOUNT_ROOT_REQUIRES_SINGLE_ID');
  return `${policy.codexAccountRoot}/${identity(ids[0])}`;
}
export function assertCreatorAccountSelection(ids,policy) {
  validateCreatorAccountPolicy(policy);
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!id||/[\\/\x00-\x1f]/.test(id))||new Set(ids).size!==ids.length)throw Error('CREATOR_ACCOUNT_SELECTION_INVALID');
  const denied=new Set(policy.denied.map(row=>row.identitySha256));
  if(ids.some(id=>denied.has(identity(id))))throw Error('CREATOR_ACCOUNT_DENIED');
  if(policy.selection==='pool'&&(ids.length>64||ids.some(id=>!policy.preferred.some(row=>row.identitySha256===identity(id)))))throw Error('CREATOR_ACCOUNT_POOL_SELECTION_INVALID');
  return ids;
}
export function selectCreatorAccount({policy,inventory,requestedIds,slot=0}) {
  validateCreatorAccountPolicy(policy);
  if(!Array.isArray(inventory)||!Number.isSafeInteger(slot)||slot<0)throw Error('CREATOR_ACCOUNT_INVENTORY_INVALID');
  const eligible=inventory.filter(row=>typeof row.codexAccountId==='string'&&row.eligible===true&&row.healthStatus==='active');
  const preferred=policy.preferred.flatMap(account=>eligible.filter(row=>identity(row.codexAccountId)===account.identitySha256));
  if(requestedIds!==undefined) {
    assertCreatorAccountSelection(requestedIds,policy);
    const probation=(policy.selection==='pool'?[]:policy.probation??[]).flatMap(account=>eligible.filter(row=>identity(row.codexAccountId)===account.identitySha256));
    if(requestedIds.some(id=>![...preferred,...probation].some(row=>row.codexAccountId===id)))throw Error('CREATOR_ACCOUNT_NOT_PREFERRED_OR_UNAVAILABLE');
    return requestedIds;
  }
  if(!preferred.length)throw Error('CREATOR_PREFERRED_ACCOUNTS_UNAVAILABLE');
  if(policy.selection==='pool')return assertCreatorAccountSelection(preferred.map(row=>row.codexAccountId),policy);
  return assertCreatorAccountSelection([preferred[slot%preferred.length].codexAccountId],policy);
}
export function actualCreatorAccountEvidence(ids,actualId,policy) {
  assertCreatorAccountSelection(ids,policy);
  if(typeof actualId!=='string'||!actualId)return {verified:false,reason:'provider-account-metadata-unavailable'};
  const hash=identity(actualId),denied=policy.denied.some(row=>row.identitySha256===hash);
  return {verified:!denied&&ids.includes(actualId),identitySha256:hash,label:[...policy.preferred,...(policy.probation??[])].find(row=>row.identitySha256===hash)?.label??null,denied};
}
