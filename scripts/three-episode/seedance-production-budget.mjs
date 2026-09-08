/** Pure accounting for the production budget stored in the existing Seedance CAS state. */
// One unit represents a 15-second output. Limits belong to the production run.
const statuses = new Set(['reserved', 'running', 'unknown']);
function fail(code) { const e = new Error(`SEEDANCE_PRODUCTION_BUDGET_${code}`); e.code = e.message; throw e; }
function id(value) { if (typeof value !== 'string' || !value.trim() || ['__proto__', 'constructor', 'prototype'].includes(value)) fail('INVALID_ID'); return value; }
function units(value) { if (value !== 1 && value !== 2) fail('INVALID_UNITS'); return value; }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function limit(value) { if (!Number.isSafeInteger(value) || value < 1) fail('INVALID_LIMIT'); return value; }
function mix(value) {
  if (value === undefined) return;
  if (!object(value) || Object.keys(value).length !== 2 || !['normal30s', 'half15s'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)) fail('INVALID_MIX');
}
function same(a, b) { if (a.units !== b.units || a.inputHash !== b.inputHash) fail('IDENTITY_CONFLICT'); }
function validate(state) {
  const b = state?.productionBudget;
  if (!object(b)) fail('MISSING');
  if (b.schemaVersion !== 1 || !object(b.generatedByTaskId) || !object(b.reservationsByInputHash)) fail('INVALID_STATE');
  limit(b.limitUnits); mix(b.plannedMix);
  const seen = new Set();
  if (b.submittedByTaskId !== undefined && !object(b.submittedByTaskId)) fail('INVALID_STATE');
  for (const [taskId, row] of Object.entries(b.submittedByTaskId ?? {})) {
    id(taskId); if (!object(row)) fail('INVALID_STATE'); units(row.units); id(row.inputHash);
    if (row.outcome !== undefined && !['generated','not-generated'].includes(row.outcome)) fail('INVALID_STATE');
    if (row.retryAttempt !== undefined && !/^attempt-\d{2,}$/.test(row.retryAttempt)) fail('INVALID_STATE');
    if (row.retryTaskId !== undefined) id(row.retryTaskId);
  }
  for (const [taskId, row] of Object.entries(b.generatedByTaskId)) { id(taskId); if (!object(row)) fail('INVALID_STATE'); units(row.units); id(row.inputHash); }
  for (const [hash, row] of Object.entries(b.reservationsByInputHash)) {
    id(hash); if (!object(row) || !statuses.has(row.status)) fail('INVALID_STATE'); units(row.units);
    if (row.taskId !== undefined) {
      id(row.taskId); if (seen.has(row.taskId) || b.generatedByTaskId[row.taskId]) fail('DUPLICATE_TASK'); seen.add(row.taskId);
    }
  }
  return b;
}
function copy(state) { validate(state); return structuredClone(state); }
function generatedForInput(b, hash) { return Object.values(b.generatedByTaskId).some(x => x.inputHash === hash); }
function reservationForTask(b, taskId) { return Object.entries(b.reservationsByInputHash).find(([, x]) => x.taskId === taskId); }
function recordSubmitted(b, hash, amount, taskId) {
  b.submittedByTaskId ??= {};
  const existing = b.submittedByTaskId[taskId];
  if (existing) same(existing, { inputHash: hash, units: amount });
  else b.submittedByTaskId[taskId] = { inputHash: hash, units: amount };
  const retryOf=b.reservationsByInputHash[hash]?.authorizedRetryTaskId;
  if(!existing&&retryOf&&retryOf!==taskId){
    const prior=b.submittedByTaskId[retryOf];
    if(!prior||prior.retryTaskId&&prior.retryTaskId!==taskId)fail('RETRY_ALREADY_USED');
    prior.retryTaskId=taskId;
  }
}
function reserveExisting(b, hash, amount, taskId, status) {
  recordSubmitted(b, hash, amount, taskId);
  const generated = b.generatedByTaskId[taskId];
  if (generated) { same(generated, { inputHash: hash, units: amount }); return; }
  const other = reservationForTask(b, taskId);
  if (other && other[0] !== hash) fail('IDENTITY_CONFLICT');
  const row = b.reservationsByInputHash[hash];
  if (row && (row.units !== amount || (row.taskId && row.taskId !== taskId))) fail('IDENTITY_CONFLICT');
  b.reservationsByInputHash[hash] = { units: amount, status: row?.status === 'unknown' ? 'unknown' : status, taskId };
}
function recordGenerated(b, hash, amount, taskId) {
  recordSubmitted(b, hash, amount, taskId);
  b.submittedByTaskId[taskId].outcome = 'generated';
  const existing = b.generatedByTaskId[taskId];
  if (existing) { same(existing, { inputHash: hash, units: amount }); return; }
  const other = reservationForTask(b, taskId);
  if (other && other[0] !== hash) fail('IDENTITY_CONFLICT');
  const row = b.reservationsByInputHash[hash];
  if (row && (row.units !== amount || (row.taskId && row.taskId !== taskId))) fail('IDENTITY_CONFLICT');
  b.generatedByTaskId[taskId] = { units: amount, inputHash: hash };
  if (row) delete b.reservationsByInputHash[hash];
}

/** Merge evidence without resetting existing reservations or generated accounting. */
export function initializeProductionBudget(state, { generated = [], outstanding = [], sourceProof, limitUnits, plannedMix } = {}) {
  if (!object(state) || !Array.isArray(generated) || !Array.isArray(outstanding) || sourceProof == null || sourceProof === '') fail('INVALID_INITIALIZATION');
  const next = structuredClone(state);
  if (next.productionBudget === undefined) {
    limit(limitUnits); mix(plannedMix);
    next.productionBudget = {
      kind: 'three-episode-seedance-production-budget', schemaVersion: 1, limitUnits,
      ...(plannedMix === undefined ? {} : { plannedMix: structuredClone(plannedMix) }),
      generatedByTaskId: {}, reservationsByInputHash: {}, submittedByTaskId: {}, sourceProof: structuredClone(sourceProof),
    };
  } else {
    if (limitUnits !== undefined && limitUnits !== next.productionBudget.limitUnits) fail('LIMIT_CHANGED');
    if (plannedMix !== undefined && JSON.stringify(plannedMix) !== JSON.stringify(next.productionBudget.plannedMix)) fail('MIX_CHANGED');
  }
  const b = validate(next);
  for (const [taskId,row] of Object.entries(b.generatedByTaskId)) recordSubmitted(b,row.inputHash,row.units,taskId);
  for (const [hash,row] of Object.entries(b.reservationsByInputHash)) if(row.taskId) recordSubmitted(b,hash,row.units,row.taskId);
  for (const row of generated) { if (!object(row)) fail('INVALID_STATE'); recordGenerated(b, id(row.inputHash), units(row.units), id(row.taskId)); }
  for (const row of outstanding) {
    if (!object(row)) fail('INVALID_STATE');
    const hash = id(row.inputHash), amount = units(row.units), status = row.status ?? 'unknown';
    if (!statuses.has(status)) fail('INVALID_STATUS');
    if (row.taskId !== undefined) reserveExisting(b, hash, amount, id(row.taskId), status);
    else {
      const existing = b.reservationsByInputHash[hash];
      if (existing && existing.units !== amount) fail('IDENTITY_CONFLICT');
      // An unbound outstanding attempt must not disappear just because another attempt generated.
      if (!existing) b.reservationsByInputHash[hash] = { units: amount, status };
    }
  }
  validate(next); return next;
}

/** A returned state permits the caller's CAS admission. Existing task IDs only permit polling. */
export function admitProductionBudget(state, key, { units: amount, existingTaskId, authorizedRetryTaskId, attempt } = {}) {
  const hash = id(key); units(amount); const next = copy(state), b = next.productionBudget;
  if (existingTaskId !== undefined) { reserveExisting(b, hash, amount, id(existingTaskId), 'running'); return next; }
  if (generatedForInput(b, hash)) fail('INPUT_ALREADY_GENERATED');
  const submitted=Object.values(b.submittedByTaskId ?? {}).filter(row=>row.inputHash===hash);
  let prior;
  if(authorizedRetryTaskId!==undefined){
    id(authorizedRetryTaskId);prior=b.submittedByTaskId?.[authorizedRetryTaskId];
    if(!prior||prior.inputHash!==hash||prior.units!==amount||prior.outcome!=='not-generated'||submitted.some(row=>row.outcome!=='not-generated'))fail('RETRY_NOT_SETTLED');
    if(typeof attempt!=='string'||!/^attempt-\d{2,}$/.test(attempt))fail('RETRY_ATTEMPT_REQUIRED');
    if(prior.retryAttempt&&prior.retryAttempt!==attempt)fail('RETRY_ALREADY_USED');
    if(prior.retryTaskId)fail('RETRY_ALREADY_USED');
  }else if(submitted.length)fail('INPUT_ALREADY_SUBMITTED');
  const row = b.reservationsByInputHash[hash];
  if (row) { if (row.units !== amount) fail('IDENTITY_CONFLICT'); fail('INPUT_ALREADY_RESERVED'); }
  const stats = productionBudgetStats(next);
  if (stats.committedUnits + amount > b.limitUnits) fail('EXHAUSTED');
  if (stats.byDuration[amount === 2 ? '30' : '15'].remainingRequests < 1) fail('DURATION_EXHAUSTED');
  if(prior)prior.retryAttempt=attempt;
  b.reservationsByInputHash[hash] = { units: amount, status: 'reserved',...(prior?{authorizedRetryTaskId,attempt}:{}) };
  return next;
}

/** Release only on explicit evidence of no video/no submission; elapsed time is not evidence. */
export function settleProductionBudget(state, key, { status, taskId, units: amount } = {}) {
  const hash = id(key); if (!['generated', 'not-generated', 'unsubmitted', 'unknown', 'running'].includes(status)) fail('INVALID_STATUS');
  if (taskId !== undefined) id(taskId); if (amount !== undefined) units(amount);
  const next = copy(state), b = next.productionBudget, row = b.reservationsByInputHash[hash];
  const existing = taskId === undefined ? undefined : b.generatedByTaskId[taskId];
  const taskReservation = taskId === undefined ? undefined : reservationForTask(b, taskId);
  if (taskReservation && taskReservation[0] !== hash) fail('IDENTITY_CONFLICT');
  if (!row && !existing && (status === 'not-generated' || status === 'unsubmitted')) return next;
  amount = amount ?? row?.units ?? existing?.units;
  units(amount);
  if (existing) { same(existing, { inputHash: hash, units: amount }); if (status !== 'generated' && status !== 'running' && status !== 'unknown') fail('GENERATED_CANNOT_RELEASE'); }
  if (existing) return next;
  if (row && (row.units !== amount || (row.taskId && taskId && row.taskId !== taskId))) fail('IDENTITY_CONFLICT');
  if (taskId) recordSubmitted(b, hash, amount, taskId);
  if (status === 'generated') {
    if (!taskId) fail('TASK_ID_REQUIRED'); recordGenerated(b, hash, amount, taskId); return next;
  }
  if (existing) return next;
  if (status === 'running' || status === 'unknown') {
    if (taskId) reserveExisting(b, hash, amount, taskId, status);
    else { if (!row) fail('RESERVATION_MISSING'); b.reservationsByInputHash[hash] = { ...row, status }; }
    return next;
  }
  if (!row) return next; // Repeated proven terminal settlement is idempotent.
  if (row.taskId && taskId !== row.taskId) fail('TASK_ID_REQUIRED');
  if (status === 'unsubmitted' && (row.taskId || taskId)) fail('SUBMITTED_CANNOT_UNSUBMIT');
  if (status === 'not-generated' && taskId) b.submittedByTaskId[taskId].outcome='not-generated';
  delete b.reservationsByInputHash[hash];
  return next;
}

export function productionBudgetStats(state) {
  const b = validate(state);
  const generatedUnits = Object.values(b.generatedByTaskId).reduce((n, x) => n + x.units, 0);
  const reservedUnits = Object.values(b.reservationsByInputHash).reduce((n, x) => n + x.units, 0);
  const committedUnits = generatedUnits + reservedUnits;
  const byDuration = {};
  for (const [duration, amount, limitRequests] of [
    ['30', 2, b.plannedMix?.normal30s ?? Math.floor(b.limitUnits / 2)],
    ['15', 1, b.plannedMix?.half15s ?? b.limitUnits],
  ]) {
    const generatedRequests = Object.values(b.generatedByTaskId).filter(x => x.units === amount).length;
    const reservedRequests = Object.values(b.reservationsByInputHash).filter(x => x.units === amount).length;
    byDuration[duration] = { limitRequests, generatedRequests, reservedRequests,
      remainingRequests: Math.max(0, limitRequests - generatedRequests - reservedRequests) };
  }
  return { limitUnits: b.limitUnits, generatedUnits, reservedUnits, committedUnits,
    byDuration,
    remainingUnits: Math.max(0, b.limitUnits - committedUnits), overBudgetUnits: Math.max(0, committedUnits - b.limitUnits),
    generatedEquivalent: generatedUnits / 2, reservedEquivalent: reservedUnits / 2, committedEquivalent: committedUnits / 2,
    remainingEquivalent: Math.max(0, b.limitUnits - committedUnits) / 2,
    generatedTaskCount: Object.keys(b.generatedByTaskId).length, reservationCount: Object.keys(b.reservationsByInputHash).length };
}
