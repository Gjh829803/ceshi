import { isNil } from "lodash-es";

export interface PageExitLifecycleOptionsV1 {
  readonly target: EventTarget;
  readonly dispose: () => void | Promise<void>;
  readonly reportDisposeError?: (error: unknown) => void;
}

export interface PageExitLifecycleInstallationV1 {
  dispose(): Promise<void>;
  uninstall(): void;
}

/** Disposes page resources only after a non-BFCache page exit is committed. */
export function installPageExitDisposal(
  options: PageExitLifecycleOptionsV1,
): PageExitLifecycleInstallationV1 {
  let disposalPromise: Promise<void> | undefined;
  let disposalFailureReported = false;
  let installed = true;

  const dispose = (): Promise<void> => {
    if (isNil(disposalPromise)) {
      disposalPromise = Promise.resolve().then(() => options.dispose());
    }
    return disposalPromise;
  };
  const reportDisposalFailure = (error: unknown): void => {
    if (disposalFailureReported) return;
    disposalFailureReported = true;
    if (isNil(options.reportDisposeError)) {
      console.error("WORLDKIT_PAGE_EXIT_DISPOSE_FAILED", error);
      return;
    }
    options.reportDisposeError(error);
  };
  const handlePageHide = (event: Event): void => {
    const persisted = (event as Event & { readonly persisted?: boolean }).persisted;
    if (persisted === true) return;
    void dispose().catch(reportDisposalFailure);
  };

  options.target.addEventListener("pagehide", handlePageHide);
  return Object.freeze({
    dispose,
    uninstall(): void {
      if (!installed) return;
      installed = false;
      options.target.removeEventListener("pagehide", handlePageHide);
    },
  });
}
