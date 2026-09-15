import {createHumanoidWorld, type HumanoidWorldOptions, parseCameraDocument, type CameraOpeningConfiguration} from '@worldkit/three';

import cameraData from './config/camera.json';

// This starter follows its primary human. Use the same instance ID in JSON and the world.
// Supply the scene, canvas, map, chosen characterColor and initialMountId when the reference starts riding.
declare const options: Omit<HumanoidWorldOptions, 'characterId'>;
declare const opening: CameraOpeningConfiguration;
const cameraDocument = parseCameraDocument(cameraData);
const characterId = cameraDocument.binding.targetEntityId;
const world = await createHumanoidWorld({characterLoadOptions:{loadTextures:false},...options,characterId});
world.setCameraFollow({configuration:parseCameraDocument({...cameraDocument,
  views:{...cameraDocument.views,'third-person':{...cameraDocument.views['third-person'],opening}},
})});
world.setCaptureTargets([characterId]);
await world.start();
