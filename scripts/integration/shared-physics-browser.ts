import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ThreeCreatorTools} from '@worldkit/creator-host/tools';
import {openEpisodeBrowser} from '@worldkit/episode-pipeline/browser';

const output=path.resolve(process.argv[2]??'.codex-tmp/shared-physics-browser');
await mkdir(output,{recursive:false});const workspace=path.join(output,'workspace');await mkdir(workspace);
const service=new ThreeCreatorTools(workspace,'three-sdk');
const report:Record<string,unknown>={};
const save=()=>writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
try {
  const example=await service.examples('shared-physics');
  for(const [name,source] of Object.entries(example.files))await writeFile(path.join(workspace,name),source);
  const candidate=await service.validate();report.compiled=candidate;await save();
  const recording=await service.playtest('shared-physics');report.creator=recording;await save();
  assert.equal(recording.status,'passed');await service.close();
  const episode=await openEpisodeBrowser({playableRoot:candidate.playableRoot});
  try {
    const start={positionWorldMetersXYZ:[0,.04,0] as const,facingYawRadians:Math.PI};
    await episode.prepareSegment(start,{widthPixels:1280,heightPixels:720});
    const input={forward:0,steer:0,roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:false,slow:false,jump:false};
    const before=await episode.advance({humanoid:input},120);
    assert(Math.abs(before.entities.find(e=>e.id==='crate')!.positionWorldMetersXYZ[1]-.5)<.05);
    const after=await episode.advance({humanoid:{...input,forward:1}},120);
    const from=before.entities.find(e=>e.id==='crate')!.positionWorldMetersXYZ,to=after.entities.find(e=>e.id==='crate')!.positionWorldMetersXYZ;
    const displacement=Math.hypot(...to.map((v,i)=>v-from[i]!));
    report.episode={before,after,crateDisplacementMeters:displacement,errors:episode.errors};await save();
    assert(displacement>.2,'Human must physically push the shared dynamic crate');assert.deepEqual(after.errors,[]);assert.deepEqual(episode.errors,[]);
    const frame=await episode.frame('image/png');await writeFile(path.join(output,'pushed.png'),Buffer.from(frame.imageDataUrl.split(',')[1]!,'base64'));
    const reset=await episode.prepareSegment(start,{widthPixels:1280,heightPixels:720});
    assert.equal(reset.humanoid?.character.instanceId,'person');
    const landed=await episode.advance({humanoid:input},120);assert(Math.abs(landed.entities.find(e=>e.id==='crate')!.positionWorldMetersXYZ[1]-.5)<.05);
    report.reset=landed;
  } finally {await episode.close();}
} catch(error){report.failure=String(error);process.exitCode=1;}
finally {await service.close();await save();}
console.log(JSON.stringify({output,failure:report.failure??null}));
