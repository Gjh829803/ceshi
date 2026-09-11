import {createHumanoidWorld, type HumanoidWorldOptions, type CameraOpening} from '@worldkit/three';

// Supply the scene, canvas, map, chosen characterColor and initialMountId when the reference starts riding.
declare const options: HumanoidWorldOptions;
declare const opening: CameraOpening;
const world = await createHumanoidWorld({characterLoadOptions:{loadTextures:false},...options});
world.setCameraFollow({opening, activateOnInput:true, headingFollow:'vehicle'});
world.setCaptureTargets([options.characterId ?? 'player']);
await world.start();
