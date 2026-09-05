#!/usr/bin/env node
import {readFile,lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readRuntimeLock,fileSha256} from './three-eval-runtime.mjs';
import {eventStatistics,validateDeliveryEvidence} from './three-eval-statistics.mjs';
const options={};const argv=process.argv.slice(2);
for(let i=0;i<argv.length;i+=2){if(!['--case-root','--runtime-lock','--output'].includes(argv[i])||!argv[i+1]||options[argv[i]])throw new Error('Expected --case-root <downloaded task> --runtime-lock <lock> --output <new directory>');options[argv[i]]=path.resolve(argv[i+1]);}
for(const key of ['--case-root','--runtime-lock','--output'])if(!options[key])throw new Error(`Missing ${key}`);
const root=options['--case-root'];
const json=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const [result,launcher,input,lock]=await Promise.all([json('creator-result.json'),json('creator-launcher-report.json'),json('case-input.json'),readRuntimeLock(options['--runtime-lock'])]);
const artifacts={};
for(const name of ['creator-result.json','creator-delivery.tar.gz','creator-events.jsonl']){const file=path.join(root,name),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('THREE_ARTIFACT_FILE_INVALID');artifacts[name]={sha256:await fileSha256(file),bytes:stat.size};}
if(launcher.status!=='delivered')throw new Error('THREE_LAUNCHER_NOT_DELIVERED');
const echo=await json('config-echo.json');
const workspace=path.join(echo.config.options.work_dir,'tasks',input.taskId);
validateDeliveryEvidence({result,launcherReport:launcher,events:await eventStatistics(path.join(root,'creator-events.jsonl')),eventsSha256:artifacts['creator-events.jsonl'].sha256,artifacts,expectedRuntimeHash:lock.runtimeHash,expectedFixedRuntimeHash:lock.prebuiltRuntimes[input.profile].runtimeHash,expectedCaseId:input.caseId,expectedTaskId:input.taskId,expectedProfile:input.profile,expectedWorkspace:workspace});
const child=spawnSync('python3',[path.join(path.dirname(fileURLToPath(import.meta.url)),'three-eval-unpack.py'),'--archive',path.join(root,'creator-delivery.tar.gz'),'--receipt',path.join(root,'creator-result.json'),'--output',options['--output']],{stdio:'inherit'});
if(child.error)throw child.error;process.exitCode=child.status??1;
