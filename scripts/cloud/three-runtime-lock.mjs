#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CODEX_BINARY_SHA256, THREE_ENGINE, THREE_PROFILES, RUNTIME_LOCK_KEYS, fileSha256, sha256, writeJson, readRuntimeLock} from './three-eval-runtime.mjs';
const args = process.argv.slice(2), options = {};
for (let i=0;i<args.length;i+=2) {
  if (!['--config','--output'].includes(args[i]) || !args[i+1] || options[args[i]]) throw new Error('Expected --config <freeze-input.json> --output <runtime-lock.json>');
  options[args[i]]=args[i+1];
}
if (!options['--config'] || !options['--output']) throw new Error('Both --config and --output are required');
const input = JSON.parse(await readFile(options['--config'],'utf8'));
for (const key of Object.keys(input)) if (!RUNTIME_LOCK_KEYS.has(key)) throw new Error(`THREE_RUNTIME_UNKNOWN_FIELD: ${key}`);
if (!['draft','ready'].includes(input.status)) throw new Error('Input status must explicitly be draft or ready; only Root freezes ready after T5');
const directory = path.dirname(fileURLToPath(import.meta.url));
const names = ['three-eval-launcher.mjs','three-eval-runtime.mjs','three-eval-mcp-bridge.mjs','three-eval-statistics.mjs'];
const lock = {...input, kind:'three-creator-runtime-lock',schemaVersion:1,engine:THREE_ENGINE,profiles:THREE_PROFILES,codexBinarySha256:CODEX_BINARY_SHA256,
  createdAt:new Date().toISOString(),launcherFilesSha256:Object.fromEntries(await Promise.all(names.map(async name=>[name,await fileSha256(path.join(directory,name))])))};
await writeJson(options['--output'],lock);
await readRuntimeLock(options['--output'],{requireReady:input.status==='ready'});
console.log(JSON.stringify({status:input.status,file:path.resolve(options['--output']),runtimeHash:sha256(await readFile(options['--output'])),modelCalls:0,qualification:'Configuration identity only; no installed/cloud doctor implied.'}));
