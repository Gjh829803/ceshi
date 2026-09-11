import type {ThreeWorld} from '@worldkit/three';

// Bind your authored model/body/movement to the existing ordinary SDK world.
declare const world: ThreeWorld;
declare const character: Parameters<ThreeWorld['addCharacter']>[0];
declare const follow: Parameters<ThreeWorld['setCameraFollow']>[0];
world.addCharacter(character);
world.setControlledEntity(character.id);
world.useAuthoredCamera();
world.setCameraFollow({...follow, targetEntityId: character.id, activateOnInput: true});
world.setCaptureTargets([character.id]);
