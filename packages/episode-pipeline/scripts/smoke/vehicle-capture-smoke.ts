import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {loadEpisodeSource} from '../../src/source/source.js';
import {runCaptureSegments} from '../../src/capture/capture.js';
import {validateEpisodePlan,type EpisodePlan} from '../../src/contracts.js';
const manifest=process.argv[2];if(!manifest)throw new Error('Pass a delivered independent player source.json');
const source=await loadEpisodeSource(manifest),output=path.resolve(process.argv[3]??'outputs/player-migration/rover-capture');
await mkdir(output,{recursive:true});
// Local authored acceptance route, not a claim of cloud-planner generation.
const plan:EpisodePlan={kind:'worldkit-three-episode-plan',schemaVersion:2,worldBuildHash:source.worldBuildHash,
 segments:Array.from({length:6},(_,index)=>({id:`segment-0${index}`,start:{positionWorldMetersXYZ:[-75,.03,-75+index*6],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'rover-instance-1',mounted:true,cameraMode:0}},
  waypoints:[{positionWorldMetersXYZ:[-75,.03,75],gait:'walk'},{positionWorldMetersXYZ:[75,.03,75],gait:'walk'},{positionWorldMetersXYZ:[75,.03,-75],gait:'walk'},{positionWorldMetersXYZ:[-75,.03,-75],gait:'walk'}],
  endBehavior:'loop',purpose:'Local physical rover route and pure-world recording acceptance'}))};
validateEpisodePlan(plan,{worldBuildHash:source.worldBuildHash});
await writeFile(path.join(output,'plan.json'),JSON.stringify(plan,null,2));
const summary=await runCaptureSegments({playableRoot:source.playableRoot,plan,outputRoot:output,runtimeHash:source.runtimeHash,
 onProgress:event=>{if(event.frameCount%120===0||event.status!=='recording')console.log(JSON.stringify(event));}});
console.log(JSON.stringify(summary));if(summary.status!=='completed')process.exitCode=1;
