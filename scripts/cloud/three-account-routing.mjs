import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateCreatorAccountPolicy(policy) {
  if(policy?.schemaVersion!==1||policy.scope!=='worldkit-creator'||!Array.isArray(policy.preferred)||!Array.isArray(policy.denied)||policy.allowUnratedFallback!==false)throw Error('CREATOR_ACCOUNT_POLICY_INVALID');
  if(policy.probation!==undefined&&!Array.isArray(policy.probation))throw Error('CREATOR_ACCOUNT_POLICY_INVALID');
  const all=[...policy.preferred,...policy.denied,...(policy.probation??[])];
  if(!policy.preferred.length||all.some(row=>typeof row.label!=='string'||!/^[a-f0-9]{64}$/.test(row.identitySha256??''))||new Set(all.map(row=>row.identitySha256)).size!==all.length)throw Error('CREATOR_ACCOUNT_POLICY_INVALID');
  return policy;
}
export function assertCreatorAccountSelection(ids,policy) {
  validateCreatorAccountPolicy(policy);
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!id||/[\\/\x00-\x1f]/.test(id))||new Set(ids).size!==ids.length)throw Error('CREATOR_ACCOUNT_SELECTION_INVALID');
  const denied=new Set(policy.denied.map(row=>row.identitySha256));
  if(ids.some(id=>denied.has(sha256(id))))throw Error('CREATOR_ACCOUNT_DENIED');
  return ids;
}
export function selectCreatorAccount({policy,inventory,requestedIds,slot=0}) {
  validateCreatorAccountPolicy(policy);
  if(!Array.isArray(inventory)||!Number.isSafeInteger(slot)||slot<0)throw Error('CREATOR_ACCOUNT_INVENTORY_INVALID');
  const eligible=inventory.filter(row=>typeof row.codexAccountId==='string'&&row.eligible===true&&row.healthStatus==='active');
  const preferred=policy.preferred.flatMap(account=>eligible.filter(row=>sha256(row.codexAccountId)===account.identitySha256));
  if(requestedIds!==undefined) {
    assertCreatorAccountSelection(requestedIds,policy);
    const probation=(policy.probation??[]).flatMap(account=>eligible.filter(row=>sha256(row.codexAccountId)===account.identitySha256));
    if(requestedIds.some(id=>![...preferred,...probation].some(row=>row.codexAccountId===id)))throw Error('CREATOR_ACCOUNT_NOT_PREFERRED_OR_UNAVAILABLE');
    return requestedIds;
  }
  if(!preferred.length)throw Error('CREATOR_PREFERRED_ACCOUNTS_UNAVAILABLE');
  return assertCreatorAccountSelection([preferred[slot%preferred.length].codexAccountId],policy);
}
export function actualCreatorAccountEvidence(ids,actualId,policy) {
  assertCreatorAccountSelection(ids,policy);
  if(typeof actualId!=='string'||!actualId)return {verified:false,reason:'provider-account-metadata-unavailable'};
  const hash=sha256(actualId),denied=policy.denied.some(row=>row.identitySha256===hash);
  return {verified:!denied&&ids.includes(actualId),identitySha256:hash,label:[...policy.preferred,...(policy.probation??[])].find(row=>row.identitySha256===hash)?.label??null,denied};
}

/** Read a run's policy without rewriting its frozen source path during relocation. */
export async function readCreatorAccountPolicy({repoRoot, policyFile, previousPlan}) {
  const defaultPath = path.resolve(repoRoot, 'config/three-creator/account-policy.json');
  const legacyPath = path.resolve(repoRoot, 'scripts/cloud/creator-account-policy.json');
  const accountPolicyPath = path.resolve(policyFile ?? previousPlan?.accountPolicyPath ?? defaultPath);
  let accountPolicyBytes;
  try {
    accountPolicyBytes = await readFile(accountPolicyPath);
  } catch (error) {
    // Only the removed default in this checkout may relocate. An explicit CLI
    // path, another checkout, or an unpinned plan must keep its original error.
    if (error.code !== 'ENOENT' || policyFile !== undefined
        || previousPlan?.accountPolicyPath !== legacyPath
        || !/^[a-f0-9]{64}$/.test(previousPlan?.accountPolicySha256 ?? '')) throw error;
    accountPolicyBytes = await readFile(defaultPath);
  }
  if (previousPlan?.accountPolicySha256 && previousPlan.accountPolicySha256 !== sha256(accountPolicyBytes)) {
    throw Error('CREATOR_FROZEN_ACCOUNT_POLICY_CHANGED');
  }
  return {accountPolicyPath, accountPolicyBytes};
}
