import {createHash} from 'node:crypto';

const identity=id=>createHash('sha256').update(id).digest('hex');
export function validateCreatorAccountPolicy(policy) {
  if(policy?.schemaVersion!==1||policy.scope!=='worldkit-creator'||!Array.isArray(policy.preferred)||!Array.isArray(policy.denied)||policy.allowUnratedFallback!==false)throw Error('CREATOR_ACCOUNT_POLICY_INVALID');
  const all=[...policy.preferred,...policy.denied];
  if(!policy.preferred.length||all.some(row=>typeof row.label!=='string'||!/^[a-f0-9]{64}$/.test(row.identitySha256??''))||new Set(all.map(row=>row.identitySha256)).size!==all.length)throw Error('CREATOR_ACCOUNT_POLICY_INVALID');
  return policy;
}
export function assertCreatorAccountSelection(ids,policy) {
  validateCreatorAccountPolicy(policy);
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!id||/[\\/\x00-\x1f]/.test(id))||new Set(ids).size!==ids.length)throw Error('CREATOR_ACCOUNT_SELECTION_INVALID');
  const denied=new Set(policy.denied.map(row=>row.identitySha256));
  if(ids.some(id=>denied.has(identity(id))))throw Error('CREATOR_ACCOUNT_DENIED');
  return ids;
}
export function selectCreatorAccount({policy,inventory,requestedIds,slot=0}) {
  validateCreatorAccountPolicy(policy);
  if(!Array.isArray(inventory)||!Number.isSafeInteger(slot)||slot<0)throw Error('CREATOR_ACCOUNT_INVENTORY_INVALID');
  const eligible=inventory.filter(row=>typeof row.codexAccountId==='string'&&row.eligible===true&&row.healthStatus==='active');
  const preferred=policy.preferred.flatMap(account=>eligible.filter(row=>identity(row.codexAccountId)===account.identitySha256));
  if(requestedIds!==undefined) {
    assertCreatorAccountSelection(requestedIds,policy);
    if(requestedIds.some(id=>!preferred.some(row=>row.codexAccountId===id)))throw Error('CREATOR_ACCOUNT_NOT_PREFERRED_OR_UNAVAILABLE');
    return requestedIds;
  }
  if(!preferred.length)throw Error('CREATOR_PREFERRED_ACCOUNTS_UNAVAILABLE');
  return assertCreatorAccountSelection([preferred[slot%preferred.length].codexAccountId],policy);
}
export function actualCreatorAccountEvidence(ids,actualId,policy) {
  assertCreatorAccountSelection(ids,policy);
  if(typeof actualId!=='string'||!actualId)return {verified:false,reason:'provider-account-metadata-unavailable'};
  const hash=identity(actualId),denied=policy.denied.some(row=>row.identitySha256===hash);
  return {verified:!denied&&ids.includes(actualId),identitySha256:hash,label:policy.preferred.find(row=>row.identitySha256===hash)?.label??null,denied};
}
