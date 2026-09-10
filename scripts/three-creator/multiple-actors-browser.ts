import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ThreeCreatorTools} from './tools.js';
import {openEpisodeBrowser} from '../three-episode/browser.js';

const ordinaryNpc=process.argv.includes('--ordinary-npc');
const output=path.resolve(process.argv[2]??'.codex-tmp/multiple-actors-browser');
await mkdir(output,{recursive:false});const workspace=path.join(output,'workspace');await mkdir(workspace);
const service=new ThreeCreatorTools(workspace,'three-sdk'),report:Record<string,unknown>={fullHumanoidCount:3,ordinaryNpcCount:ordinaryNpc?1:0};
const save=()=>writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
try{
  const example=await service.examples('multiple-actors');
  for(const [name,source] of Object.entries(example.files)){
    const code=ordinaryNpc&&name==='main.ts'?source.replace('world.setCaptureTargets(',`const ordinary=new THREE.Group(),visual=new THREE.Mesh(new THREE.BoxGeometry(.8,1.2,.8),new THREE.MeshStandardMaterial({color:'#d99937'}));
visual.position.y=.6;ordinary.add(visual);ordinary.position.set(7,.04,0);
world.addCharacter({id:'ordinary-npc',object:ordinary,body:{heightMeters:1.2,radiusMeters:.4},movement:{kind:'ground',walkSpeedMetersPerSecond:2}});
world.setAutonomy('ordinary-npc',{kind:'patrol',waypointPositionsWorldMetersXYZ:[[7,0,7],[7,0,-3]],pauseSeconds:.5});
world.onDispose(()=>{visual.geometry.dispose();visual.material.dispose();});
world.setCaptureTargets(`):source;
    await writeFile(path.join(workspace,name),code);
  }
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
    if(ordinaryNpc){
      const a=before.entities.find(entity=>entity.id==='ordinary-npc')!,b=after.entities.find(entity=>entity.id==='ordinary-npc')!;
      assert(a&&b,'ordinary NPC must survive Episode preparation');assert(b.positionWorldMetersXYZ[2]-a.positionWorldMetersXYZ[2]>1,'ordinary NPC must navigate in the shared world');
    }
    const frame=await episode.frame('image/png');await writeFile(path.join(output,ordinaryNpc?'mixed-actors.png':'three-actors.png'),Buffer.from(frame.imageDataUrl.split(',')[1]!,'base64'));
    const moved=await episode.advance({moveZRatio:-1},60);assert(moved.entities.find(entity=>entity.id==='person')!.positionWorldMetersXYZ[2]>1);
    report.reset=await episode.prepareSegment(start,{widthPixels:1280,heightPixels:720});
    if(ordinaryNpc)assert.deepEqual((report.reset as typeof before).entities.find(entity=>entity.id==='ordinary-npc')!.positionWorldMetersXYZ,before.entities.find(entity=>entity.id==='ordinary-npc')!.positionWorldMetersXYZ);
    assert.deepEqual(moved.errors,[]);assert.deepEqual(episode.errors,[]);report.errors=episode.errors;
  }finally{await episode.close();}
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{await service.close();await save();}
console.log(JSON.stringify({output,failure:report.failure??null}));
