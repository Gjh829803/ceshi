import type {ThreeWorld} from '@worldkit/three';

// SDK input activates follow without changing the authored framing or FOV.
// Presentation supplies the input surface; this wrapper installs no listeners.
export function installOpeningCameraHandoff(world: ThreeWorld, surface: HTMLElement): () => void {
  void surface;
  world.setCameraFollow({activateOnInput: true});
  return () => {};
}
