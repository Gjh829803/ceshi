import {test,expect,vi} from 'vitest';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {ThreeCreatorTools} from '../../src/tools/tools.js';
import {executeThreeCreatorTool} from '../../src/tools/tool-dispatch.js';
import {compileWorldUi} from '../../src/compiler/world-ui.js';
import {readExampleFiles} from '../../src/discovery/example-files.js';
import {readAgentDocument,documentNavigation} from '../../src/discovery/agent-docs.js';
import {publishLibrary} from '@worldkit/asset-library/testing/publish';
import {createServer} from '@worldkit/asset-library/testing/serve';
import {prepareAssetLibrary} from '../../src/assets/library-source.mjs';

test('UI compiler delivers isolated factory, catalog types and hashed assets; rejects foreign imports',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'world-ui-build-'));
  try{
    await cp('examples/three-creator/streaming-ui/ui',path.join(root,'ui'),{recursive:true});
    await writeFile(path.join(root,'ui/icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(path.join(root,'ui/components.tsx'),"import icon from './icon.svg';\n"+(await readFile(path.join(root,'ui/components.tsx'),'utf8')).replace('export const components={HealthBar,Controls}', 'export const components={HealthBar:()=>icon,Controls}'));
    const project=JSON.parse(await readFile('examples/three-creator/streaming-ui/project.json','utf8'));
    const result=await compileWorldUi(root,path.join(root,'out'),project.ui);
    const source=await readFile(path.join(root,'out',result.manifest.module.path),'utf8');
    expect(createHash('sha256').update(source).digest('hex')).toBe(result.manifest.module.sha256);
    // Importing compiles the complete wrapper, catching author/generated identifier collisions.
    const mod=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    expect(typeof mod.createWorldUiModule).toBe('function');
    const ui=mod.createWorldUiModule({react:{},jsxRuntime:{},motion:{},worldUi:{},assetBaseUrl:'https://example.test/ui/hash/components.mjs'});
    expect(ui.components.HealthBar()).toBe('https://example.test/ui/hash/'+result.manifest.assets[0]!.path);
    expect(await readFile(path.join(root,'ui/catalog.generated.ts'),'utf8')).toContain('CatalogComponents');
    expect(result.manifest.styles).toHaveLength(1);
    // Moving the same authored project must not change JS/CSS hashes through
    // esbuild's source-path comments or module identifiers.
    const relocated=path.join(root,'relocated');
    await cp(path.join(root,'ui'),path.join(relocated,'ui'),{recursive:true});
    const moved=await compileWorldUi(relocated,path.join(relocated,'out'),project.ui);
    expect(moved.manifest).toEqual(result.manifest);
    expect(moved.hash).toBe(result.hash);
    expect(await readFile(path.join(relocated,'out/local-preview.js'),'utf8')).toBe(await readFile(path.join(root,'out/local-preview.js'),'utf8'));
    await writeFile(path.join(root,'ui/components.tsx'),"import 'three'; export const components={};");
    await expect(compileWorldUi(root,path.join(root,'bad'),project.ui)).rejects.toThrow('UI_IMPORT_NOT_ALLOWED');
    const example=await readExampleFiles(path.resolve('examples/three-creator/streaming-ui'),'streaming-ui');
    expect(example.files['ui/components.tsx']).toContain('usePresentedMotionValue');
    expect(example.fileManifest.find(file=>file.path==='ui/components.tsx')?.readable).toBe(true);
    expect(readAgentDocument('ui.md')).toContain('usePresentedMotionValue');
    expect(documentNavigation('programming.md').children.some(c=>c.document==='ui.md')).toBe(true);
  }finally{await rm(root,{recursive:true,force:true});}
});


test('Agent discovers UI guidance and consumes the public UI example through compilation and delivery',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'ui-authoring-tool-'));
  let tools:ThreeCreatorTools|undefined;
  const registryRoot=await mkdtemp(path.join(os.tmpdir(),'ui-asset-registry-'));
  let registry:ReturnType<typeof createServer>|undefined;
  try{
    await publishLibrary(path.resolve('asset-library'),{output:registryRoot});
    registry=createServer(registryRoot,{staticFiles:[]});
    await new Promise<void>(resolve=>registry!.listen(0,'127.0.0.1',resolve));
    vi.stubEnv('ASSET_REGISTRY_URL',`http://127.0.0.1:${(registry.address() as {port:number}).port}/`);
    await prepareAssetLibrary(path.resolve('.'));
    tools=new ThreeCreatorTools(root,'three-sdk');
    const environment=await tools.environment();expect(environment.uiAuthoring).toBeDefined();
    const navigation=environment.uiAuthoring!;
    const guide:any=await executeThreeCreatorTool(tools,navigation.guide.tool,navigation.guide.arguments);
    expect(JSON.stringify(guide)).toContain('This is the UI authoring contract');
    const programming:any=await executeThreeCreatorTool(tools,'creator_get_authoring_schema',{topic:'programming'});
    expect(programming.uiAuthoring).toEqual(navigation);
    expect(programming.sdkGuide).not.toContain('presentation.ui.mount(hud)');
    expect(programming.sdkGuide).toContain('## World UI');
    const presentation:any=await executeThreeCreatorTool(tools,'creator_get_authoring_schema',{topic:'presentation'});
    expect(presentation.sdkGuide).toBe(guide.guide);
    expect(presentation.uiAuthoring).toEqual(navigation);
    const example:any=await executeThreeCreatorTool(tools,navigation.example.tool,navigation.example.arguments);
    expect(example.files['main.ts']).not.toContain('createPresentation');
    expect(Object.keys(example.projectUi).sort()).toEqual(['catalog','components','definition','stateSchema']);
    const selected:any=await executeThreeCreatorTool(tools,'creator_get_examples',{topic:'streaming-ui',files:['ui/components.tsx']});
    expect(Object.keys(selected.files)).toEqual(['ui/components.tsx']);
    await expect(executeThreeCreatorTool(tools,'creator_get_examples',{topic:'streaming-ui',files:['../../package.json']})).rejects.toThrow('THREE_EXAMPLE_FILE_UNKNOWN');
    const raw=new ThreeCreatorTools(root,'three-raw');
    try{expect((await raw.environment()).uiAuthoring).toBeUndefined();await expect(raw.bindingExamples('streaming-ui')).rejects.toThrow('THREE_SDK_EXAMPLE_UNSUPPORTED');}finally{await raw.close();}
    await writeFile(path.join(root,'index.html'),await readFile('examples/three-creator/streaming-ui/index.html','utf8'));
    let scene=await readFile('examples/three-creator/streaming-ui/scene.ts','utf8');
    scene=scene.slice(0,scene.indexOf('Object.assign(window'));
    // Substitute the snippet's declared world/state with the real scene bindings.
    scene+=example.files['main.ts'].split('\n').filter((line:string)=>!line.startsWith('declare const')).join('\n');
    await writeFile(path.join(root,'scene.ts'),scene);
    await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
    expect((await tools.validate()).ui).toMatchObject({status:'not-configured',next:navigation});
    for(const [name,source]of Object.entries(example.files)){if(name==='main.ts')continue;await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),source as string);}
    await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:['humanoid.uefn-mannequin'],ui:example.projectUi}));
    const compiled=await tools.validate();
    expect(compiled.ui).toMatchObject({status:'compiled',declaration:example.projectUi});
    const assetLock=JSON.parse(await readFile(path.join(compiled.playableRoot,'project.assets.lock.json'),'utf8'));
    expect(assetLock.assets.some((asset:{asset_id:string})=>asset.asset_id==='humanoid.uefn-mannequin')).toBe(true);
    const preview=await tools.preview('opening');expect(preview.ui.included).toBe(true);
    await writeFile(path.join(root,'episode.json'),JSON.stringify({schemaVersion:1,steps:[{keysDown:['w'],durationSeconds:.7},{keysUp:['w'],durationSeconds:.2}],targets:[]}));
    const playtest=await tools.playtest('ui-authoring-delivery',undefined,3);expect(playtest.status).toBe('passed');
    const delivery=await tools.submit();expect(delivery.ui.status).toBe('compiled');
    expect(delivery.files['playable/world-ui/manifest.json']).toMatch(/^[a-f0-9]{64}$/);
    // Also exercise the documented opt-out: an empty UI document still ships a valid stream binding.
    await writeFile(path.join(root,'ui/catalog.json'),JSON.stringify({schemaVersion:1,catalogId:'empty',components:{},actions:{}}));
    await writeFile(path.join(root,'ui/definition.json'),JSON.stringify({schemaVersion:1,catalogId:'empty',designViewport:{width:1280,height:720},spec:{root:'hud',elements:{hud:{type:'HudLayer',props:{},children:[]}}},transitions:{}}));
    await writeFile(path.join(root,'ui/state.schema.json'),JSON.stringify({type:'object',properties:{},additionalProperties:false}));
    await writeFile(path.join(root,'ui/components.tsx'),'export const components={};');
    await writeFile(path.join(root,'scene.ts'),scene.slice(0,scene.indexOf('Object.assign(window'))+'Object.assign(window,{__WORLDKIT_STREAM_WORLD__:{world,readUiState:()=>({}),actions:{}}});');
    expect((await tools.preview('opening')).ui.included).toBe(true);
  }finally{
    await tools?.close();vi.unstubAllEnvs();
    if(registry){registry.closeAllConnections();await new Promise<void>(resolve=>registry!.close(()=>resolve()));}
    await rm(root,{recursive:true,force:true});await rm(registryRoot,{recursive:true,force:true});
  }
},60000);
