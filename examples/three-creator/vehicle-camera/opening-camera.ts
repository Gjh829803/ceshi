import type {ThreeWorld} from '@worldkit/three';

// Optional scene policy: keep an authored opening until a movement, jump or
// boarding key is pressed on the focused gameplay surface. No input is consumed
// or reimplemented here; the SDK receives the same key and owns movement/camera.
export function installOpeningCameraHandoff(world: ThreeWorld, surface: HTMLElement): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== surface || surface.ownerDocument.activeElement !== surface ||
        event.repeat || !world.isRunning || world.cameraMode !== 'authored') return;
    const bindings = world.getKeyBindings();
    const beginsPlay = (['forward', 'backward', 'left', 'right', 'jump', 'vehicle'] as const)
      .some(action => bindings[action].includes(event.code));
    if (!beginsPlay) return;
    const runtime = world.humanoid!;
    runtime.setCameraMode(runtime.exportProfile().view?.defaultPerspective === 'first-person' ? 1 : 0);
  };
  surface.addEventListener('keydown', onKeyDown);
  const remove = () => surface.removeEventListener('keydown', onKeyDown);
  const unsubscribeDispose = world.onDispose(remove);
  return () => { remove(); unsubscribeDispose(); };
}
