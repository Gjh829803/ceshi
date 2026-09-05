#!/usr/bin/env node
// Host-only projection. Reads bounded evidence; never contacts a provider or executes a case.
import {constants} from 'node:fs';
import {open, realpath, rename, unlink, writeFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {THREE_TOOLS} from './three-eval-runtime.mjs';

export const THREE_PROGRESS_STAGE_LABELS = Object.freeze({queued:'等待执行',starting:'启动 Agent',planning:'整体地图规划',authoring:'编写与校验',preview:'预览与检查',playtest:'实际操作测试',capture:'采集对象视图',packaging:'整理交付',delivered:'技术交付完成',failed:'执行失败',unknown:'等待可确认状态'});
const toolStages = {imagegen:'planning',creator_describe_environment:'starting',creator_get_authoring_schema:'authoring',creator_get_examples:'authoring',assets_search:'authoring',assets_describe:'authoring',world_validate:'authoring',world_preview:'preview',world_inspect:'preview',world_execute_command:'playtest',world_get_operation:'playtest',world_playtest:'playtest',world_capture_triviews:'capture',world_submit:'packaging'};
const operationStages = {'imagegen.generate':'planning','world.validate':'authoring','world.preview':'preview','world.inspect':'preview','world.execute-command':'playtest','world.get-operation':'playtest','world.playtest':'playtest','world.capture-triviews':'capture','world.submit':'packaging'};
const toolLabels = {imagegen:'ImageGen 生成规划图',creator_describe_environment:'读取运行环境',creator_get_authoring_schema:'读取 SDK 接口',creator_get_examples:'读取通用示例',assets_search:'搜索资产',assets_describe:'检查资产',world_validate:'编译与校验',world_preview:'查看真实预览',world_inspect:'检查世界状态',world_execute_command:'执行交互操作',world_get_operation:'检查交互任务',world_playtest:'实际操作测试',world_capture_triviews:'采集对象视图',world_submit:'整理技术交付',operations_get:'查询工具进度',operations_cancel:'取消工具操作'};
const phaseSet = new Set(['not-started','submitted','queued','running','delivery-pending','delivered','failed','cancelled','stopped','stop-pending','remote-pending','submission-unknown','admission-blocked']);
const statusSet = new Set(['submitted','submitting','queued','pending','starting','running','succeeded','completed','failed','submit_failed','cancelled','stopped']);
const operationStatusSet = new Set(['queued','running','succeeded','failed','cancelled']);
// Retain old production events without re-exposing retired tools to agents.
const knownTools = new Set([...THREE_TOOLS, 'world_playtest', 'imagegen']);
const slug = /^[a-z0-9][a-z0-9-]{1,159}$/;
const requestPattern = /^[a-z0-9][a-z0-9-]{2,239}$/;
const jobPattern = /^gen_[a-f0-9]{8,64}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const validSlug = value => typeof value === 'string' && slug.test(value);
const MAX_JSON_BYTES = 8 * 1024 * 1024, MAX_EVENT_BYTES = 128 * 1024 * 1024, MAX_LINE_BYTES = 16 * 1024 * 1024;
const fail = code => { throw new Error(`THREE_PROGRESS_${code}`); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9 ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 1e9 ? value : 0;
const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT[0-9:.]+(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const latestDate = values => values.map(date).filter(Boolean).sort().at(-1) ?? null;
const seconds = (start, end) => start && end && Date.parse(end) >= Date.parse(start) ? Math.round((Date.parse(end)-Date.parse(start))/10)/100 : null;
const safeModel = value => typeof value === 'string' && /^gpt-[a-z0-9.-]{1,60}$/.test(value) ? value : null;
const safeEffort = value => ['minimal','low','medium','high','xhigh','max','ultra'].includes(value) ? value : null;
const eventId = (...values) => createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0,24);
const failureFactDefinitions = Object.freeze({
  PLATFORM_SCRATCH_SCANNED_AS_SOURCE:{layer:'host-integration',category:'host-integration',priority:0,message:'Host 将平台临时目录误扫为场景源码，工具输入边界需修复。'},
  MODEL_USAGE_LIMIT:{layer:'model-service',category:'account-usage',priority:0.5,message:'云端账号额度已用尽，本次生成停止。'},
  PHYSICS_TRIANGLE_BUDGET_EXCEEDED:{layer:'sdk-physics',category:'world-validation',priority:2,message:'SDK 物理三角面预算超限。'},
  PHYSICS_COLLIDER_BUDGET_EXCEEDED:{layer:'sdk-physics',category:'world-validation',priority:2,message:'SDK 碰撞体数量预算超限。'},
  MODEL_CAPACITY:{layer:'model-service',category:'model-capacity',priority:1,failureCode:'MODEL_AT_CAPACITY',message:'模型容量不足，本次尝试未完成。'},
  PHYSICS_BOX_DEGENERATE:{layer:'author-geometry',category:'world-validation',priority:2,message:'作者几何无法生成有效盒形碰撞体。'},
  THREE_BROWSER_STARTUP_FAILED:{layer:'browser-startup',category:'runtime-browser',priority:3,message:'世界预览未能正常启动，具体原因尚未确认。'},
  THREE_SUBMIT_PLAYTEST_REQUIRED:{layer:'delivery-prerequisite',category:'delivery-prerequisite',priority:4,message:'提交时尚未具备要求的操作测试证据。'},
});

function cleanFailureFacts(values) {
  const facts=new Map();
  for(const value of Array.isArray(values) ? values.slice(0,40) : []) {
    const definition=isObject(value) && Object.hasOwn(failureFactDefinitions,value.code) ? failureFactDefinitions[value.code] : null;
    if(!definition || value.layer!==definition.layer)continue;
    facts.set(value.code,{layer:definition.layer,code:value.code,message:definition.message,...(definition.layer==='browser-startup' ? {cause:'not-identified'} : {})});
  }
  return [...facts.values()].sort((a,b)=>failureFactDefinitions[a.code].priority-failureFactDefinitions[b.code].priority);
}

function publicFailure(values) {
  const text = values.filter(value => typeof value === 'string').map(value => value.slice(0,8192)).join('\n');
  const known = [
    [/hit your usage limit|account has reached its usage limit|MODEL_USAGE_LIMIT/i,'account-usage','MODEL_USAGE_LIMIT','云端账号额度已用尽，本次生成停止。'],
    [/PHYSICS_TRIANGLE_BUDGET_EXCEEDED/,'world-validation','PHYSICS_TRIANGLE_BUDGET_EXCEEDED','SDK 物理三角面预算超限。'],
    [/PHYSICS_COLLIDER_BUDGET_EXCEEDED/,'world-validation','PHYSICS_COLLIDER_BUDGET_EXCEEDED','SDK 碰撞体数量预算超限。'],
    [/at capacity|MODEL_AT_CAPACITY|No available agent/i,'model-capacity','MODEL_AT_CAPACITY','模型容量不足，本次尝试未完成。'],
    [/THREE_SOURCE_SYMLINK/,'tool-input-boundary','THREE_SOURCE_SYMLINK','工具输入边界检查失败，平台临时目录需由 Host 检查。'],
    [/PHYSICS_BOX_DEGENERATE/,'world-validation','PHYSICS_BOX_DEGENERATE','作者几何无法生成有效盒形碰撞体。'],
    [/(?:scratch|codex_home)[\s\S]{0,300}ENOENT|ENOENT[\s\S]{0,300}(?:scratch|codex_home)/,'tool-runtime','TOOL_EXECUTION_ENVIRONMENT_FAILED','Agent 执行环境不可用，需由 Host 检查。'],
    [/model.{0,80}not supported|MODEL_UNSUPPORTED/i,'model-compatibility','MODEL_UNSUPPORTED','当前账户不支持所需模型。'],
    [/unauthorized|authentication|auth.{0,30}expired|MODEL_AUTHENTICATION_FAILED/i,'authentication','MODEL_AUTHENTICATION_FAILED','模型身份验证失败。'],
    [/MCP.{0,40}(?:START|startup|initialize)|CREATOR_MCP/i,'mcp-startup','MCP_STARTUP_FAILED','工具服务启动失败。'],
    [/THREE_BROWSER_STARTUP_FAILED|THREE_OBSERVER_TIMEOUT|THREE_SDK_OBSERVATION_VERSION_MISMATCH/,'runtime-browser','BROWSER_STARTUP_FAILED','世界预览未能正常启动。'],
    [/PLAYTEST|EPISODE|VIDEO_(?:DURATION|BOUNDARY|FLUSH)/,'playtest','PLAYTEST_FAILED','操作测试或录制未通过。'],
    [/TIMEOUT|timed out|deadline/i,'timeout','EXECUTION_TIMEOUT','本次尝试超过执行时限。'],
    [/THREE_(?:SOURCE|IMPORT|ENTRY|PROJECT|BUILD|SUBMIT|DELIVERY)/,'world-validation','WORLD_VALIDATION_FAILED','世界校验或交付检查未通过。'],
    [/ECONN|fetch failed|network|transport/i,'transport','TRANSPORT_FAILED','服务连接或产物传输失败。'],
  ];
  const row = known.find(([pattern]) => pattern.test(text));
  return row ? {category:row[1],code:row[2],message:row[3]} : {category:'execution',code:'EXECUTION_FAILED',message:'本次尝试失败，详细诊断由 Host 保留。'};
}

async function rootPath(value) {
  const absolute = path.resolve(value);
  if (await realpath(absolute) !== absolute) fail('PATH_INVALID');
  return absolute;
}
async function openedFile(file, maximum, optional = true) {
  try {
    if (await realpath(file) !== file) fail('PATH_INVALID');
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const stat = await handle.stat(); if (!stat.isFile() || stat.nlink !== 1 || stat.size > maximum) fail('FILE_NOT_ADMITTED'); return handle; }
    catch (error) { await handle.close(); throw error; }
  } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
async function readJson(file, optional = true) {
  const handle = await openedFile(file, MAX_JSON_BYTES, optional); if (!handle) return null;
  try { const text = await handle.readFile('utf8'); if (Buffer.byteLength(text)>MAX_JSON_BYTES) fail('FILE_NOT_ADMITTED'); try { return JSON.parse(text); } catch { fail('JSON_INVALID'); } }
  finally { await handle.close(); }
}
function checkIdentity(value, expected, fields) {
  if (!isObject(value)) fail('IDENTITY_MISMATCH');
  for (const field of fields) if (value[field] !== expected[field]) fail('IDENTITY_MISMATCH');
}
function validatePlan(plan) {
  if (!isObject(plan) || plan.schemaVersion !== 1 || !['three-creator-sdk-plan','three-creator-paired-plan'].includes(plan.kind) || !validSlug(plan.runId) || typeof plan.runtimeHash!=='string' || !hashPattern.test(plan.runtimeHash) || !Array.isArray(plan.cases) || !Array.isArray(plan.selectedTaskIds)) fail('PLAN_INVALID');
  const tasks = new Map();
  for (const task of plan.cases) {
    if (!isObject(task) || !validSlug(task.caseId) || !['three-sdk','three-raw'].includes(task.profile) || task.taskId !== `${task.caseId}--${task.profile}` || !validSlug(task.taskId) || typeof task.caseHash!=='string' || !hashPattern.test(task.caseHash) || typeof task.requestId!=='string' || !requestPattern.test(task.requestId) || tasks.has(task.taskId)) fail('PLAN_INVALID');
    if (plan.kind === 'three-creator-sdk-plan' && task.profile !== 'three-sdk') fail('PLAN_INVALID');
    tasks.set(task.taskId,task);
  }
  if (!plan.selectedTaskIds.length || plan.selectedTaskIds.length > 10 || new Set(plan.selectedTaskIds).size !== plan.selectedTaskIds.length || plan.selectedTaskIds.some(id => !tasks.has(id))) fail('PLAN_INVALID');
  return tasks;
}

function cleanProgress(value) {
  if (!isObject(value)) return undefined;
  const result = {};
  for (const field of ['stepIndex','elapsedSeconds','requestedSeconds','completedSteps','plannedSeconds']) if (numeric(value[field]) !== null) result[field] = value[field];
  return Object.keys(result).length ? result : undefined;
}
function cleanResultSummary(value) {
  if(!isObject(value))return null;
  const summary={};
  if(['passed','failed','ready','ready-for-independent-review','unreviewed'].includes(value.status))summary.status=value.status;
  for(const field of ['isCompleteEpisode','capturedInput'])if(typeof value[field]==='boolean')summary[field]=value[field];
  for(const field of ['activePlaySeconds','inputWallSeconds','actualWallSeconds','requestedSeconds','plannedSeconds','completedSteps'])if(numeric(value[field])!==null)summary[field]=value[field];
  const videoMetadata={};
  for(const field of ['durationSeconds','frameCount','widthPixels','heightPixels'])if(numeric(value.videoMetadata?.[field])!==null)videoMetadata[field]=value.videoMetadata[field];
  if(Object.keys(videoMetadata).length)summary.videoMetadata=videoMetadata;
  const failure=publicFailure([value.failureCode,value.failure]);
  if(failure.code!=='EXECUTION_FAILED')summary.failureCode=failure.code;
  return Object.keys(summary).length ? summary : null;
}
function playtestAdequacy(type,summary) {
  if(type!=='world.playtest')return null;
  if(summary?.isCompleteEpisode===false)return 'short-test';
  const times=[summary?.activePlaySeconds,summary?.inputWallSeconds,summary?.actualWallSeconds,summary?.videoMetadata?.durationSeconds];
  if(times.some(value=>numeric(value)!==null&&value<180))return 'duration-insufficient';
  return summary?.isCompleteEpisode===true&&summary?.capturedInput===true&&times.every(value=>numeric(value)!==null&&value>=180) ? 'complete' : 'unverified';
}
function cleanOperation(value) {
  if (!isObject(value) || !Object.hasOwn(operationStages,value.type) || !operationStatusSet.has(value.status)) return null;
  const resultSummary=cleanResultSummary(value.resultSummary??value.result),resultStatus=resultSummary?.status??null;
  const status=resultStatus==='failed'?'failed':value.status;
  return {type:value.type,status,executionStatus:value.status,resultStatus,resultSummary,playtestAdequacy:playtestAdequacy(value.type,resultSummary),createdAt:date(value.createdAt),updatedAt:date(value.updatedAt),identity:eventId(value.id ?? value.operationId ?? null,value.type),progress:cleanProgress(value.progress),...(status === 'failed' ? {failure:publicFailure([value.errorCode,value.error,value.resultSummary?.failureCode,value.resultSummary?.failure,value.result?.failure])} : {})};
}
function cleanSummary(value, cliActivityObserved = false) {
  const counts = {};
  for (const [tool,total] of Object.entries(value?.completedMcpCalls ?? {})) if (knownTools.has(tool) && count(total)) counts[tool] = total;
  const latestTool = knownTools.has(value?.latestTool?.name) ? {name:value.latestTool.name,status:statusSet.has(value.latestTool.status) ? value.latestTool.status : null,at:date(value.latestTool.timestamp)} : null;
  const operations=(Array.isArray(value?.operations) ? value.operations.slice(-100) : []).filter(operation=>typeof operation?.id==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(operation.id)).map(cleanOperation).filter(Boolean);
  const typedLatest=cleanOperation(value?.latestOperation);
  const latestKnown=operations.reduce((latest,operation)=>{
    const at=operation.updatedAt??operation.createdAt,previousAt=latest?.updatedAt??latest?.createdAt;
    return !latest || at && (!previousAt || at>=previousAt) ? operation : latest;
  },null);
  return {counts,imageResponses:count(value?.imageResponses),latestTool,latestOperation:typedLatest??latestKnown,awaitingToolResult:isObject(value?.latestOperation)&&!typedLatest,operations,cliActivityObserved:cliActivityObserved === true || count(value?.types?.['thread.started'])>0 || count(value?.types?.['turn.started'])>0,events:[],failureValues:(Array.isArray(value?.errors) ? value.errors.slice(-2).map(error => error?.message) : [])};
}
function pushEvent(summary, event) { summary.events.push(event); if (summary.events.length>100) summary.events.shift(); }

async function readEvents(file, jobId) {
  const handle = await openedFile(file, MAX_EVENT_BYTES); if (!handle) return null;
  const result = cleanSummary(null); let lineIndex = 0, bytes = 0, buffer = '', skipping = false;
  function consume(line) {
    lineIndex++; if (!line.trim()) return;
    let event; try { event = JSON.parse(line); } catch { return; }
    const at = date(event.timestamp ?? event.at);
    if (event.type === 'thread.started' || event.type === 'turn.started') {
      result.cliActivityObserved = true;
      pushEvent(result,{id:eventId(jobId,lineIndex,event.type),at,type:'agent-started',stage:'starting',label:'Agent 已开始执行',status:'running'});
    }
    if (event.type === 'error' || event.type === 'turn.failed') result.failureValues = [...result.failureValues,event.message,event.error?.message].filter(value=>typeof value==='string').slice(-3);
    const item = event.item;
    if (!['item.started','item.completed'].includes(event.type) || !isObject(item)) return;
    if (['file_change','command_execution'].includes(item.type)) {
      result.latestTool = null; result.latestOperation = null;
      result.latestStage = 'authoring';
      pushEvent(result,{id:eventId(jobId,item.id ?? lineIndex,event.type),at,type:item.type === 'file_change' ? 'files-updated' : 'command-executed',stage:'authoring',label:item.type === 'file_change' ? 'Agent 更新场景文件' : 'Agent 执行本地工具',status:event.type === 'item.started' ? 'running' : item.status === 'failed' ? 'failed' : 'succeeded'});
    }
    if (['image_generation','imageGeneration','image_generation_call'].includes(item.type)) {
      const status = event.type === 'item.started' ? 'running' : item.failure || ['failed','error'].includes(item.status) ? 'failed' : 'succeeded';
      result.latestTool = {name:'imagegen',status:status==='succeeded'?'completed':status,at};
      result.latestOperation = null; result.latestStage = 'planning';
      if (event.type === 'item.completed') result.counts.imagegen = (result.counts.imagegen ?? 0) + 1;
      pushEvent(result,{id:eventId(jobId,item.id ?? lineIndex,event.type),at,type:'tool',stage:'planning',label:toolLabels.imagegen,status,tool:'imagegen'});
      return;
    }
    if (item.type !== 'mcp_tool_call' || item.server !== 'worldkit_three_creator' || !knownTools.has(item.tool)) return;
    result.latestTool = {name:item.tool,status:event.type === 'item.started' ? 'running' : item.error || item.result?.isError ? 'failed' : 'completed',at};
    if (toolStages[item.tool]) result.latestStage = toolStages[item.tool];
    if (event.type === 'item.completed') result.counts[item.tool] = (result.counts[item.tool] ?? 0) + 1;
    if (item.tool !== 'operations_get') pushEvent(result,{id:eventId(jobId,item.id ?? lineIndex,event.type),at,type:'tool',stage:toolStages[item.tool]??'unknown',label:toolLabels[item.tool],status:result.latestTool.status === 'completed' ? 'succeeded' : result.latestTool.status,tool:item.tool});
    for (const content of Array.isArray(item.result?.content) ? item.result.content : []) {
      if (content.type === 'image') result.imageResponses++;
      if (content.type !== 'text' || typeof content.text !== 'string' || content.text.length>MAX_JSON_BYTES) continue;
      let operation; try { operation = cleanOperation(JSON.parse(content.text)); } catch { continue; }
      if (!operation) continue;
      result.latestOperation = operation; result.latestStage = operationStages[operation.type];
      pushEvent(result,operationEvent(jobId,operation));
    }
  }
  try {
    for await (const chunk of handle.createReadStream({encoding:'utf8',autoClose:false,highWaterMark:64*1024})) {
      bytes += Buffer.byteLength(chunk); if (bytes>MAX_EVENT_BYTES) fail('FILE_NOT_ADMITTED');
      buffer += chunk;
      for (;;) { const end=buffer.indexOf('\n'); if(end<0)break; const line=buffer.slice(0,end); buffer=buffer.slice(end+1); if(!skipping)consume(line); else lineIndex++; skipping=false; }
      if (Buffer.byteLength(buffer)>MAX_LINE_BYTES) { buffer=''; skipping=true; }
    }
    // A growing stream may end halfway through a JSON record; never infer from it.
    if (!skipping && buffer.trim()) consume(buffer);
  } finally { await handle.close(); }
  return result;
}
function operationEvent(jobId, operation) {
  let detail=operation.failure?.message;
  if(operation.executionStatus==='succeeded') {
    if(operation.resultStatus==='failed')detail='调用已完成，检查结果失败。';
    else if(operation.playtestAdequacy==='short-test')detail='调用已完成，仅完成短测，未完成整段自测。';
    else if(operation.playtestAdequacy==='duration-insufficient')detail='调用已完成，自测时长不足 180 秒。';
    else if(operation.resultStatus==='passed'&&operation.playtestAdequacy==='unverified')detail='调用已完成，完整自测证据尚不足。';
    else if(operation.resultStatus==='passed')detail='检查结果通过。';
    else detail='工具调用已完成，检查结果尚未确认。';
  }
  return {id:eventId(jobId,'operation',operation.identity),at:operation.updatedAt ?? operation.createdAt,type:'operation',stage:operationStages[operation.type],label:THREE_PROGRESS_STAGE_LABELS[operationStages[operation.type]],status:operation.status,executionStatus:operation.executionStatus,resultStatus:operation.resultStatus,...(operation.resultSummary ? {resultSummary:operation.resultSummary} : {}),...(operation.playtestAdequacy ? {playtestAdequacy:operation.playtestAdequacy} : {}),...(operation.progress ? {progress:operation.progress} : {}),...(detail ? {detail} : {}),...(operation.failure ? {code:operation.failure.code} : {})};
}
function orderedEvents(values) {
  const unique=new Map();
  for(const event of values) {
    const existing=unique.get(event.id);
    if(!existing || !existing.at || !event.at || event.at>=existing.at)unique.set(event.id,event);
  }
  return [...unique.values()].sort((a,b)=>a.at&&b.at ? a.at.localeCompare(b.at) : a.at ? -1 : b.at ? 1 : 0).slice(-100);
}

function counterState(job, item) {
  const itemStatus = statusSet.has(item?.status) ? item.status : null;
  const counters = {};
  for (const key of ['total','queued','running','succeeded','failed']) if (Number.isSafeInteger(job?.counters?.[key]) && job.counters[key]>=0) counters[key]=job.counters[key];
  const queued = itemStatus === 'queued' || itemStatus === 'pending' || counters.queued>0 && !(counters.running>0);
  return {itemStatus,counters,queued};
}
async function loadAttempt(runRoot, plan, task, live, now) {
  const caseRoot = path.join(runRoot,task.taskId);
  const [state,intent,config,localLauncher,job,items] = await Promise.all(['state.json','submission-intent.json','config-echo.json','creator-launcher-report.json','job-final.json','items.json'].map(name=>readJson(path.join(caseRoot,name))));
  const identity = {runId:plan.runId,taskId:task.taskId,caseId:task.caseId,requestId:task.requestId,caseHash:task.caseHash,runtimeHash:plan.runtimeHash,profile:task.profile};
  if (state) checkIdentity(state,identity,['taskId','caseId','requestId','caseHash','runtimeHash','profile']);
  if (intent) checkIdentity(intent,identity,['requestId']);
  if (live) checkIdentity(live,identity,['runId','taskId','caseId','requestId','caseHash','runtimeHash']);
  const jobId = state?.jobId ?? live?.jobId ?? null;
  if (jobId !== null && !jobPattern.test(jobId)) fail('IDENTITY_MISMATCH');
  if (live && live.jobId !== jobId) fail('IDENTITY_MISMATCH');
  if (config) {
    if (config.job_id !== jobId || config.config?.request_id !== task.requestId) fail('IDENTITY_MISMATCH');
  }
  if (job && ((job.job_id ?? job.id) !== jobId || job.request_id !== task.requestId)) fail('IDENTITY_MISMATCH');
  if (localLauncher) {
    checkIdentity(localLauncher,identity,['taskId','caseId','profile','runtimeHash']);
    if(localLauncher.kind!=='three-creator-launcher-report' || localLauncher.workspace!==`/fsx/pipeline/lwdp_generation/${jobId}/tasks/${task.taskId}`)fail('IDENTITY_MISMATCH');
  }
  const launcher = localLauncher ?? live?.launcher;
  if (launcher?.runtimeHash && launcher.runtimeHash !== plan.runtimeHash) fail('IDENTITY_MISMATCH');
  const localSummary = jobId && localLauncher ? await readEvents(path.join(caseRoot,'creator-events.jsonl'),jobId) : null;
  const summary = live ? cleanSummary(live.events,live.cliActivityObserved) : localSummary ?? cleanSummary(null);
  if(live && localSummary) {
    summary.events=localSummary.events;
    for(const [tool,total] of Object.entries(localSummary.counts))summary.counts[tool]=Math.max(summary.counts[tool]??0,total);
    summary.imageResponses=Math.max(summary.imageResponses,localSummary.imageResponses);
    summary.failureValues.push(...localSummary.failureValues);
    summary.cliActivityObserved ||= localSummary.cliActivityObserved;
  }
  const listedItems = Array.isArray(items?.items) ? items.items : Array.isArray(items?.data) ? items.data : [];
  const item = listedItems.find(row=>(row?.item_id ?? row?.id)===task.taskId);
  const api = counterState(job,item);
  const providerStatus = statusSet.has(state?.providerStatus) ? state.providerStatus : statusSet.has(job?.status) ? job.status : statusSet.has(live?.providerStatus) ? live.providerStatus : null;
  const hostPhase = phaseSet.has(state?.phase) ? state.phase : phaseSet.has(live?.phase) ? live.phase : 'not-started';
  const cliStarted = summary.cliActivityObserved || ['running','delivered'].includes(launcher?.status) || Number.isInteger(launcher?.childExitCode);
  const submittedAt = date(state?.submittedAt ?? intent?.createdAt ?? live?.submittedAt);
  const startedAt = cliStarted ? date(launcher?.startedAt) : null;
  const recordedFinishedAt = date(launcher?.finishedAt ?? item?.completed_at ?? item?.finished_at ?? job?.completed_at ?? job?.finished_at);
  const lastObservedAt = latestDate([live?.observedAt,state?.lastObservedAt,state?.updatedAt,job?.updated_at]);
  const events = [];
  if (submittedAt) events.push({id:eventId(jobId ?? task.requestId,'submitted'),at:submittedAt,type:'submitted',stage:'unknown',label:'请求已提交',status:'succeeded'});
  if (cliStarted) events.push({id:eventId(jobId,'started'),at:startedAt,type:'agent-started',stage:'starting',label:'Agent 已开始执行',status:'succeeded'});
  events.push(...summary.events);
  if (live) events.push(...summary.operations.map(operation=>operationEvent(jobId,operation)));
  if (live && summary.latestTool && summary.latestTool.name !== 'operations_get') events.push({id:eventId(jobId,summary.latestTool.name,summary.latestTool.status),at:summary.latestTool.at,type:'tool',stage:toolStages[summary.latestTool.name]??'unknown',label:toolLabels[summary.latestTool.name],status:summary.latestTool.status === 'completed' ? 'succeeded' : summary.latestTool.status ?? 'running',tool:summary.latestTool.name});
  if (live && summary.latestOperation) events.push(operationEvent(jobId,summary.latestOperation));
  let phase = hostPhase, stage = 'unknown';
  const operation = summary.latestOperation;
  if (hostPhase === 'delivered') { stage='delivered'; phase='delivered'; }
  else if (hostPhase === 'failed' || launcher?.status === 'failed' || ['failed','submit_failed'].includes(api.itemStatus)) { stage='failed'; phase='failed'; }
  else if (['cancelled','stopped','stop-pending'].includes(hostPhase)) { stage='unknown'; }
  else if (cliStarted) { phase='running'; stage=hostPhase === 'delivery-pending' || launcher?.status==='delivered' ? 'packaging' : summary.latestStage ?? toolStages[summary.latestTool?.name] ?? (operation ? operationStages[operation.type] : undefined) ?? 'starting'; }
  else if (api.queued || ['queued','pending','submitted','submitting'].includes(providerStatus)) { stage='queued'; phase='queued'; }
  else if (launcher?.status === 'starting') { stage='starting'; phase='running'; }
  const terminal = ['failed','delivered','cancelled','stopped'].includes(phase);
  const completedAt = terminal ? recordedFinishedAt : null;
  const terminalFailure = phase==='failed' ? publicFailure([state?.failure?.message,launcher?.error,item?.error,job?.error,...summary.failureValues]) : undefined;
  // A sanitized launcher error can be intentionally opaque. Preserve the latest
  // verified tool failure as evidence without claiming it is the terminal cause.
  let failure = terminalFailure?.code==='EXECUTION_FAILED' && operation?.failure
    ? {...operation.failure,evidence:'latest-failed-operation'} : terminalFailure;
  const failureFacts=cleanFailureFacts(live?.failureFacts);
  if(phase==='failed' && failureFacts.length) {
    const fact=failureFacts[0],definition=failureFactDefinitions[fact.code];
    failure={category:definition.category,code:definition.failureCode??fact.code,message:definition.message,evidence:'verified-host-fact'};
  }
  if (terminal) events.push({id:eventId(jobId,phase),at:completedAt,type:'attempt-finished',stage:phase==='delivered'?'delivered':phase==='failed'?'failed':'unknown',label:phase==='delivered' ? '技术交付已通过 Host 检查' : phase==='failed' ? '本次尝试失败' : '本次尝试已停止',status:phase==='delivered' ? 'succeeded' : phase==='failed' ? 'failed' : 'cancelled',...(failure ? {detail:failure.message,code:failure.code} : {})});
  const counts = Object.fromEntries(Object.entries(summary.counts).sort(([a],[b])=>a.localeCompare(b)));
  const end = completedAt ?? (!terminal ? now : null);
  phase = ['running','queued','failed','delivered'].includes(phase) ? phase : 'unknown';
  const awaitingToolResult=phase==='running'&&summary.awaitingToolResult;
  return {runId:plan.runId,taskId:task.taskId,jobId,phase,hostPhase,stage,stageLabel:awaitingToolResult?'等待工具返回':THREE_PROGRESS_STAGE_LABELS[stage],awaitingToolResult,submittedAt,startedAt,completedAt,lastObservedAt,
    elapsedSeconds:seconds(submittedAt,end),queueSeconds:startedAt ? seconds(submittedAt,startedAt) : phase==='queued' ? seconds(submittedAt,lastObservedAt) : null,
    model:safeModel(config?.config?.options?.model ?? state?.model),effort:safeEffort(config?.config?.options?.reasoning_effort ?? state?.reasoningEffort),providerStatus,itemStatus:api.itemStatus,providerCounters:api.counters,
    cliActivityObserved:cliStarted,providerQueueIsStale:cliStarted && api.queued,
    ...(failure ? {failure} : {}),failureFacts,toolSummary:{counts,imageResponses:summary.imageResponses,latestTool:summary.latestTool?.name ?? null,...(operation ? {latestOperation:{type:operation.type,status:operation.status,executionStatus:operation.executionStatus,resultStatus:operation.resultStatus,...(operation.resultSummary ? {resultSummary:operation.resultSummary} : {}),...(operation.playtestAdequacy ? {playtestAdequacy:operation.playtestAdequacy} : {}),createdAt:operation.createdAt,updatedAt:operation.updatedAt,...(operation.progress ? {progress:operation.progress} : {})}} : {})},events:orderedEvents(events)};
}

export async function buildThreeRunProgress({runRoot,attemptRunRoots=[],liveStatus=null,now=Date.now()}) {
  const updatedAt = typeof now==='number' && Number.isFinite(now) ? new Date(now).toISOString() : date(now);
  if (!updatedAt) fail('TIME_INVALID');
  const roots = await Promise.all([runRoot,...attemptRunRoots].map(rootPath));
  if (new Set(roots).size!==roots.length || roots.length>8) fail('RUN_ROOTS_INVALID');
  const runs = await Promise.all(roots.map(async root=>{const plan=await readJson(path.join(root,'evaluation-plan.json'),false);return {root,plan,tasks:validatePlan(plan)};}));
  const primary=runs[0], selected=new Set(primary.plan.selectedTaskIds);
  if (liveStatus !== null && (!isObject(liveStatus) || liveStatus.kind!=='three-creator-safe-live-status' || liveStatus.schemaVersion!==1 || !Array.isArray(liveStatus.attempts) || liveStatus.attempts.length>80)) fail('LIVE_STATUS_INVALID');
  const liveByIdentity=new Map();
  for(const row of liveStatus?.attempts ?? []) {
    if (!isObject(row) || !validSlug(row.runId) || !validSlug(row.taskId) || typeof row.jobId!=='string' || !jobPattern.test(row.jobId) || typeof row.requestId!=='string' || !requestPattern.test(row.requestId)) fail('IDENTITY_MISMATCH');
    const key=`${row.runId}:${row.taskId}`; if(liveByIdentity.has(key))fail('IDENTITY_MISMATCH'); liveByIdentity.set(key,row);
  }
  const cases=[];
  for(const taskId of primary.plan.selectedTaskIds) {
    const base=primary.tasks.get(taskId), attempts=[];
    for(const run of runs) {
      if (!run.plan.selectedTaskIds.includes(taskId)) continue;
      const task=run.tasks.get(taskId);
      if(task.caseHash!==base.caseHash || task.profile!==base.profile || run.plan.runtimeHash!==primary.plan.runtimeHash)fail('RETRY_IDENTITY_MISMATCH');
      attempts.push(await loadAttempt(run.root,run.plan,task,liveByIdentity.get(`${run.plan.runId}:${taskId}`),updatedAt));
    }
    attempts.sort((a,b)=>(a.submittedAt??'').localeCompare(b.submittedAt??''));
    const jobs=attempts.map(row=>row.jobId).filter(Boolean);if(new Set(jobs).size!==jobs.length)fail('IDENTITY_MISMATCH');
    const current=attempts.at(-1);
    const timeline=new Map();for(const attempt of attempts)for(const event of attempt.events)timeline.set(event.id,{...event,jobId:attempt.jobId});
    const events=orderedEvents([...timeline.values()]);
    cases.push({...current,taskId,profile:base.profile,attempts:attempts.filter(attempt=>attempt.jobId||attempt.submittedAt).map(({events,...attempt})=>({...attempt,events:events.slice(-100)})),events});
  }
  for(const run of runs.slice(1))if(run.plan.selectedTaskIds.some(id=>!selected.has(id)))fail('RETRY_IDENTITY_MISMATCH');
  const identical = field => {const values=cases.map(row=>row[field]);return values.every(value=>value!==null&&value===values[0])?values[0]:null;};
  return {schemaVersion:1,kind:'three-creator-run-progress',runId:primary.plan.runId,updatedAt,model:identical('model'),effort:identical('effort'),cases};
}

async function main() {
  const args=process.argv.slice(2), options={attemptRunRoots:[]};
  for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!value)fail('ARGUMENT_INVALID');if(key==='--attempt-run-root')options.attemptRunRoots.push(value);else if(['--run-root','--live-status','--output'].includes(key)&&options[key]===undefined)options[key]=value;else fail('ARGUMENT_INVALID');}
  if(!options['--run-root']||!options['--output'])fail('ARGUMENT_INVALID');
  const liveStatus=options['--live-status'] ? await readJson(path.resolve(options['--live-status']),false) : null;
  const result=await buildThreeRunProgress({runRoot:options['--run-root'],attemptRunRoots:options.attemptRunRoots,liveStatus});
  const output=path.resolve(options['--output']);if(path.basename(output)!=='progress.json')fail('OUTPUT_INVALID');await rootPath(path.dirname(output));
  const existing=await openedFile(output,MAX_JSON_BYTES);await existing?.close();
  const temporary=`${output}.${randomUUID()}.part`;
  try {await writeFile(temporary,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o644});await rename(temporary,output);} finally {await unlink(temporary).catch(()=>{});}
  process.stdout.write(JSON.stringify({kind:result.kind,runId:result.runId,cases:result.cases.length,updatedAt:result.updatedAt})+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write((/^THREE_PROGRESS_[A-Z_]+$/.test(error?.message??'')?error.message:'THREE_PROGRESS_FAILED')+'\n');process.exitCode=1;});
