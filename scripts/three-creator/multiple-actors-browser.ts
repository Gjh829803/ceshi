import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ThreeCreatorTools} from './tools.js';
import {openEpisodeBrowser} from '../three-episode/browser.js';

const output=path.resolve(process.argv[2]??'.codex-tmp/multiple-actors-browser');
await mkdir(output,{recursive:false});const workspace=path.join(output,'workspace');await mkdir(workspace);
const service=new ThreeCreatorTools(workspace,'three-sdk'),report:Record<string,unknown>={};
const save=()=>writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
try{
  const example=await service.examples('multiple-actors');
  for(const [name,source] of Object.entries(example.files))await writeFile(path.join(workspace,name),source);
  const candidate=await service.validate();report.compiled=candidate;await save();
  const recording=await service.playtest('multiple-actors');report.creator=recording;await save();assert.equal(recording.status,'passed');await service.close();
  const episode=await openEpisodeBrowser({playableRoot:candidate.playableRoot});
  try{
    const start={positionWorldMetersXYZ:[0,.04,0] as const,facingYawRadians:Math.PI};
    const before=await episode.prepareSegment(start,{widthPixels:1280,heightPixels:720});
    const after=await episode.advance({},120);report.episode={before,after};
    for(const id of ['npc-left','npc-right']){
      const a=before.entities.find(entity=>entity.id===id)!,b=after.entities.find(entity=>entity.id===id)!;
      assert(b.positionWorldMetersXYZ[2]-a.positionWorldMetersXYZ[2]>1,`${id} must navigate through the SDK`);
      assert(b.animation?.actionId,`${id} must have evaluated skeletal animation`);
    }
    const frame=await episode.frame('image/png');await writeFile(path.join(output,'three-actors.png'),Buffer.from(frame.imageDataUrl.split(',')[1]!,'base64'));
    const moved=await episode.advance({moveZRatio:-1},60);assert(moved.entities.find(entity=>entity.id==='person')!.positionWorldMetersXYZ[2]>1);
    report.reset=await episode.prepareSegment(start,{widthPixels:1280,heightPixels:720});
    assert.deepEqual(moved.errors,[]);assert.deepEqual(episode.errors,[]);report.errors=episode.errors;
  }finally{await episode.close();}
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{await service.close();await save();}
console.log(JSON.stringify({output,failure:report.failure??null}));
