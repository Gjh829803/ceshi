import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const prebuiltRoot=path.resolve(root,process.argv[2]||'.codex-tmp/platform-startup/runtime');
const manifest=await readFile(path.join(prebuiltRoot,'runtime-manifest.json'));
const workspace=await mkdtemp(path.join(os.tmpdir(),'creator-startup-'));
const env=Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL','SYSTEMROOT','WINDIR'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
Object.assign(env,{WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT:prebuiltRoot,WORLDKIT_THREE_PREBUILT_RUNTIME_MANIFEST_SHA256:createHash('sha256').update(manifest).digest('hex')});
const client=new Client({name:'creator-platform-startup-smoke',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx','packages/creator-host/src/cli/mcp.ts','--workspace',workspace,'--profile','three-sdk'],cwd:root,env,stderr:'pipe'});
let stderr='';transport.stderr?.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4000);});
const call=async(name,args={})=>{
 const response=await client.callTool({name,arguments:args},undefined,{timeout:30000});
 assert.notEqual(response.isError,true,`${name}: ${JSON.stringify(response.content)}`);
 return JSON.parse(response.content.find(block=>block.type==='text').text);
};
try{
 await client.connect(transport,{timeout:30000});
 const tools=(await client.listTools()).tools.map(tool=>tool.name);
 for(const name of ['creator_describe_environment','creator_get_authoring_schema','world_submit','operations_get','assets_search','assets_describe'])assert.ok(tools.includes(name),name);
 const environment=await call('creator_describe_environment');
 assert.ok(environment);
 const schema=await call('creator_get_authoring_schema');
 for(const item of schema.readingGuide||[]){
  assert.equal(item.tool,'creator_get_authoring_schema');
  await call(item.tool,item.arguments);
 }
 const found=await call('assets_search',{query:'humanoid.uefn-mannequin'});
 assert.ok(found.assets.some(asset=>asset.id==='humanoid.uefn-mannequin'));
 await call('assets_describe',{assetId:'humanoid.uefn-mannequin'});
 console.log(JSON.stringify({passed:true,platform:process.platform,profile:'three-sdk',tools:tools.length,readingGuideRequests:schema.readingGuide?.length||0,asset:'humanoid.uefn-mannequin',runtimeHash:JSON.parse(manifest).runtimeHash,scope:'Native MCP startup, guides and asset discovery with pinned prebuild; no model generation.'},null,2));
}catch(error){
 if(stderr)console.error(stderr);
 throw error;
}finally{
 await client.close();await transport.close();
 assert.ok(workspace.startsWith(path.join(os.tmpdir(),'creator-startup-')));
 await rm(workspace,{recursive:true,force:true});
}
