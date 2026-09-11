/** Prepare GPU programs and camera/display caches without stepping or starting simulation. */
export async function preparePlaygroundRendering(options: {
  prepareVisuals: () => void;
  compile: () => Promise<unknown>;
  render: () => void;
  paint?: () => Promise<void>;
  signal?: AbortSignal;
}): Promise<void> {
  const paint = options.paint ?? (() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  options.signal?.throwIfAborted();
  await paint();
  options.signal?.throwIfAborted();
  options.prepareVisuals();
  await options.compile();
  options.signal?.throwIfAborted();
  options.render();
  await paint();
  options.signal?.throwIfAborted();
}
