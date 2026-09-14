import {parseCameraDocument,type ThreeWorld} from '@worldkit/three';
import cameraData from './config/camera.json';

// Bind your authored model/body/movement to the existing ordinary SDK world.
// Supply eyePositionLocalMetersXYZ on character when using an eye-based view.
declare const world: ThreeWorld;
declare const character: Parameters<ThreeWorld['addCharacter']>[0];
world.addCharacter(character);
world.setControlledEntity(character.id);
const cameraDocument=parseCameraDocument({...cameraData,binding:{...cameraData.binding,targetEntityId:character.id}});
world.setCameraFollow({configuration:cameraDocument});
world.setCaptureTargets([character.id]);
