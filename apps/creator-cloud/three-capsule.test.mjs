import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {stageContext,CREATOR_RUNTIME_PACKAGES} from './three-capsule.mjs';

test('isolated capsule stages Registry and UI packages with matching runtime dependency closure',t=>{
 const repositoryRoot=path.resolve('.'),scratch=path.join(repositoryRoot,'.codex-tmp');mkdirSync(scratch,{recursive:true});
 const output=mkdtempSync(path.join(scratch,'capsule-closure-test-'));t.after(()=>rmSync(output,{recursive:true,force:true}));
 assert(CREATOR_RUNTIME_PACKAGES.includes('packages/asset-client'));
 assert(CREATOR_RUNTIME_PACKAGES.includes('packages/asset-contracts'));
 const staged=stageContext(repositoryRoot,output),sources=path.join(staged.contextRoot,'sources'),manifests=path.join(staged.contextRoot,'manifests');
 const workspace=readFileSync(path.join(sources,'pnpm-workspace.yaml'),'utf8'),lock=readFileSync(path.join(sources,'pnpm-lock.yaml'),'utf8');
 for(const packageName of ['asset-client','asset-contracts','world-ui']){
  assert(workspace.includes('packages/'+packageName));assert(lock.includes('  packages/'+packageName+':'));
  assert.equal(JSON.parse(readFileSync(path.join(manifests,'packages',packageName,'package.json'),'utf8')).name,'@worldkit/'+packageName);
 }
 const uiManifest=JSON.parse(readFileSync(path.join(manifests,'packages/world-ui/package.json'),'utf8'));
 assert.equal(uiManifest.dependencies.react,'19.2.8');assert.equal(uiManifest.dependencies['react-dom'],'19.2.8');
 for(const file of ['packages/asset-client/src/registry-client.mjs','packages/asset-client/src/materialize.mjs','packages/asset-contracts/index.mjs','packages/asset-contracts/validate.mjs','packages/asset-contracts/schemas/v1.schema.json','packages/preset-content/src/assets/host-adapter.mjs','packages/preset-content/config/integrations/content-ownership.json','packages/preset-content/config/integrations/whitebox.json','packages/preset-content/config/integrations/subjects.json','packages/preset-content/config/presets/subjects.json'])assert(existsSync(path.join(sources,file)),file);
 assert.equal(staged.remoteStaged,false);assert.equal(existsSync(path.join(sources,'packages/asset-client/tests')),false);
});
