import { isNil } from "lodash-es";

type MaybePromise<T> = T | PromiseLike<T>;

export interface ArtifactRendererLifecyclePortV1 {
  mount(container: HTMLElement): MaybePromise<void>;
  dispose(): MaybePromise<void>;
}

export interface StartArtifactRendererOptionsV1<
  Renderer extends ArtifactRendererLifecyclePortV1,
> {
  readonly create: () => Promise<Renderer>;
  readonly container: HTMLElement;
  readonly setupPageState: (renderer: Renderer) => MaybePromise<void>;
  readonly rollbackPageState?: () => MaybePromise<void>;
}

export interface StartedArtifactRendererLifecycleV1<Renderer> {
  readonly renderer: Renderer;
  dispose(): Promise<void>;
}

function preservePrimaryFailure(
  primaryError: unknown,
  cleanup: () => Promise<void>,
): Promise<never> {
  return cleanup().then(
    () => Promise.reject(primaryError),
    () => Promise.reject(primaryError),
  );
}

/**
 * Starts an artifact-only renderer without transferring raw lifecycle ownership
 * to page code. The returned handle is the sole normal disposal authority.
 */
export async function createAndStartArtifactRenderer<
  Renderer extends ArtifactRendererLifecyclePortV1,
>(
  options: StartArtifactRendererOptionsV1<Renderer>,
): Promise<StartedArtifactRendererLifecycleV1<Renderer>> {
  const renderer = await options.create();
  let rendererDisposal: Promise<void> | undefined;

  const disposeRenderer = (): Promise<void> => {
    if (!isNil(rendererDisposal)) return rendererDisposal;
    rendererDisposal = Promise.resolve().then(() => renderer.dispose());
    return rendererDisposal;
  };

  let lifecycleDisposal: Promise<void> | undefined;
  const dispose = (): Promise<void> => {
    if (!isNil(lifecycleDisposal)) return lifecycleDisposal;
    lifecycleDisposal = (async () => {
      let firstFailure: unknown;
      try {
        await options.rollbackPageState?.();
      } catch (error) {
        firstFailure = error;
      }
      try {
        await disposeRenderer();
      } catch (error) {
        if (isNil(firstFailure)) firstFailure = error;
      }
      if (!isNil(firstFailure)) throw firstFailure;
    })();
    return lifecycleDisposal;
  };

  try {
    await renderer.mount(options.container);
  } catch (error) {
    return preservePrimaryFailure(error, disposeRenderer);
  }

  try {
    await options.setupPageState(renderer);
  } catch (error) {
    return preservePrimaryFailure(error, dispose);
  }

  return Object.freeze({ renderer, dispose });
}
