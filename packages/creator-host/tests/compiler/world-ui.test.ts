import {test,expect} from 'vitest';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {compileWorldUi} from '../../src/compiler/world-ui.js';
import {readExampleFiles} from '../../src/discovery/example-files.js';
import {readAgentDocument,documentNavigation} from '../../src/discovery/agent-docs.js';

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
