import {describe,it,expect} from 'vitest';
import path from 'node:path';
import {readExampleFiles} from './example-files.js';
describe('modular training example discovery',()=>{
 const root=path.resolve('examples/three-creator/sdk-capabilities');
 it('lists nested dependencies instead of pretending four files are complete',async()=>{
  const result=await readExampleFiles(root,'extensions');expect(result.fileManifest.some(f=>f.path==='environment/maps.ts')).toBe(true);
  expect(result.fileManifest.some(f=>f.path==='ui/phosphor/Phosphor.woff2'&&!f.readable)).toBe(true);
  expect(Object.keys(result.files)).toEqual(['index.html','main.ts','project.json','episode.json']);
 });
 it('reads topic modules and rejects arbitrary paths',async()=>{
  expect((await readExampleFiles(root,'training-maps')).files['environment/maps.ts']).toContain('campus');
  await expect(readExampleFiles(root,'extensions',['../../package.json'])).rejects.toThrow('THREE_EXAMPLE_FILE_UNKNOWN');
 });
});
