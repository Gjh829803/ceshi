import {cp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ThreeCreatorTools} from './tools.js';
import {prepareEpisodeSource} from '../three-episode/source.js';
import {openEpisodeBrowser} from '../three-episode/browser.js';
const output=path.resolve(process.argv[2]??`outputs/training-migration/delivery-${Date.now()}`);
await mkdir(output,{recursive:true});
const workspace=path.join(output,'author');await cp('examples/three-creator/training-independent',workspace,{recursive:true,filter:source=>!source.split(path.sep).includes('.three-creator')});
const service=new ThreeCreatorTools(workspace,'three-sdk');
try{
 const discovery=await service.assets('','training.rover');
 if(discovery.assets.length!==1)throw new Error('ASSET_DISCOVERY_FAILED');
 const inspected=await service.inspect();
 if(inspected.pageErrors.length||inspected.blockedNetworkRequests.length)throw new Error('INDEPENDENT_WORLD_START_FAILED');
 console.log(JSON.stringify({stage:'inspected',worldBuildHash:inspected.worldBuildHash,output}));
 const operation=service.start('world.playtest',id=>service.playtest(id));
 for(;;){const status=await service.getOperation(operation.operationId,25);console.log(JSON.stringify({stage:'playtest',status:status.status,elapsedSeconds:(status.progress as {elapsedSeconds?:number}|undefined)?.elapsedSeconds}));
  if(status.status==='failed')throw new Error(status.error);
  if(status.status==='succeeded'){if(status.result.status!=='passed')throw new Error(status.result.failure??'PLAYTEST_FAILED');break;}
 }
 await service.triviews();const receipt=await service.submit();
 await writeFile(path.join(output,'creator-receipt.json'),JSON.stringify(receipt,null,2));
 await service.close();
 const unpacked=path.join(output,'unpacked');await mkdir(unpacked);
 await promisify(execFile)('tar',['-xzf',receipt.archivePath,'-C',unpacked]);
 const source=await prepareEpisodeSource({payloadRoot:path.join(unpacked,'payload'),outputRoot:path.join(output,'episode-source'),worldId:'training-independent-local-smoke'});
 const session=await openEpisodeBrowser({playableRoot:source.playableRoot});
 try{
  const start={positionWorldMetersXYZ:[0,.03,0] as const,facingYawRadians:Math.PI,training:{vehicleInstanceId:'rover-instance-1',mounted:true,cameraMode:0 as const}};
  const probe=await session.probeStart(start);if(!probe.isValid)throw new Error(JSON.stringify(probe));
  const before=await session.prepareSegment(start,{widthPixels:1280,heightPixels:720});
  const after=await session.advance({training:{forward:1,steer:0,roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:false,slow:false,jump:false}},180);
  const frame=await session.frame('image/png');
  await writeFile(path.join(output,'episode-consumer.png'),Buffer.from(frame.imageDataUrl.split(',')[1]!,'base64'));
  if(after.training?.mountedInstanceId!=='rover-instance-1'||after.simulationTick-before.simulationTick!==180||after.errors.length||session.errors.length)throw new Error('EPISODE_CONSUMER_FAILED');
  await writeFile(path.join(output,'report.json'),JSON.stringify({kind:'local-authored-delivery-smoke',notCloudGenerated:true,receipt,episodeWorldBuildHash:source.worldBuildHash,probe,before,after,providerVideoSubmissionCount:0},null,2));
  console.log(JSON.stringify({stage:'complete',output,archive:receipt.archivePath,inputWallSeconds:receipt.inputWallSeconds,episodeWorldBuildHash:source.worldBuildHash}));
 }finally{await session.close();}
}finally{await service.close();}
