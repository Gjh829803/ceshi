import {createHumanoidWorld, type HumanoidWorldOptions, parseCameraDocument, type CameraOpeningConfiguration} from '@worldkit/three';

import cameraData from './config/camera.json';

// Supply the scene, canvas, map, chosen characterColor and initialMountId when the reference starts riding.
declare const options: HumanoidWorldOptions;
declare const opening: CameraOpeningConfiguration;
const world = await createHumanoidWorld({characterLoadOptions:{loadTextures:false},...options});
world.setCameraFollow({configuration:parseCameraDocument({...cameraData,binding:{targetEntityId:options.characterId??'player',mountTarget:'vehicle'},views:{'third-person':{...cameraData.views['third-person'],opening}}})});
world.setCaptureTargets([options.characterId ?? 'player']);
await world.start();
