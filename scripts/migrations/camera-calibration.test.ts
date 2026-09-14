import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {getDefaultProfile,loadAssetProfile,saveAssetProfile,clearAssetProfile} from '@worldkit/preset-content/platform/profiles';
import {migrateLegacyAssetProfile} from './camera-configuration';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/legacy-camera-baseline.json',import.meta.url),'utf8'));
it('keeps raw browser v1 data untouched across v2 load/save/clear and explicit conversion',async()=>{
  const raw=JSON.stringify(baseline.profiles.person),key='worldkit.humanoid.profile.person';const records=new Map([[key,raw]]),storage={getItem:(k:string)=>records.get(k)??null,setItem:(k:string,v:string)=>{records.set(k,v);},removeItem:(k:string)=>{records.delete(k);}};
  expect(loadAssetProfile(storage,'person')).toBeUndefined();saveAssetProfile(storage,getDefaultProfile('person')!);clearAssetProfile(storage,'person');expect(records.get(key)).toBe(raw);
  const converted=await migrateLegacyAssetProfile(raw);expect(converted.profile.control).toEqual(baseline.profiles.person.control);expect(converted.profile.envelope).toEqual(baseline.profiles.person.envelope);expect(converted.profile).not.toHaveProperty('camera');expect(converted.sourceBytes).toBe(raw);
 });

it('hash-checks all exporter inputs before writes and reports each exact source',async()=>{
 const {planCameraCalibrationExport,writeCameraCalibrationExport}=await import('./export-camera-calibration');
 const {mkdtemp,cp,writeFile,readFile,readdir,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'camera-export-'));
 try{
  const names=['legacy-camera-baseline.json','legacy-dragon-variants.json','legacy-camera-subject-facts.json'];
  for(const name of names)await cp(new URL('./fixtures/'+name,import.meta.url),join(root,name));
  const input={baselinePath:join(root,names[0]!),variantPath:join(root,names[1]!),subjectFactsPath:join(root,names[2]!)};
  const plan=await planCameraCalibrationExport(input),repeat=await planCameraCalibrationExport(input);
  expect(plan.outputs).toEqual(repeat.outputs);
  const report=JSON.parse(plan.outputs['packages/preset-content/config/cameras/migration-report.json']!);
  expect(report.sources).toHaveLength(3);for(const source of plan.sources)expect(report.sources).toContainEqual(expect.objectContaining({sourceHash:source.sourceHash}));
  for(const source of plan.sources){
   await writeFile(source.sourcePath,source.sourceBytes+'\n');
   await expect(writeCameraCalibrationExport(plan,join(root,'output'))).rejects.toThrow('SOURCE_HASH_CONFLICT');
   expect(await readdir(root)).not.toContain('output');
   await writeFile(source.sourcePath,source.sourceBytes);
  }
  await writeCameraCalibrationExport(plan,join(root,'output'));
  expect(await readFile(join(root,'output/apps/sdk-playground/config/camera.json'),'utf8')).toBe(plan.outputs['apps/sdk-playground/config/camera.json']);
 }finally{await rm(root,{recursive:true,force:true});}
});
