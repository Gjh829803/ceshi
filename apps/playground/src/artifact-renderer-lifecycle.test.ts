import { describe, expect, it, vi } from "vitest";

import { createAndStartArtifactRenderer } from "./artifact-renderer-lifecycle.js";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function rendererFixture(): {
  mount: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  return {
    mount: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("createAndStartArtifactRenderer", () => {
  it("returns an explicit handle whose disposal cleans page state and renderer exactly once", async () => {
    const renderer = rendererFixture();
    const rollbackPageState = vi.fn();
    const lifecycle = await createAndStartArtifactRenderer({
      create: async () => renderer,
      container: {} as HTMLElement,
      setupPageState: vi.fn(),
      rollbackPageState,
    });

    expect(lifecycle.renderer).toBe(renderer);

    await lifecycle.dispose();
    await lifecycle.dispose();

    expect(rollbackPageState).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it("joins concurrent disposal and invokes asynchronous cleanup exactly once", async () => {
    const renderer = rendererFixture();
    const cleanup = deferred();
    renderer.dispose.mockImplementationOnce(() => cleanup.promise);
    const rollbackPageState = vi.fn();
    const lifecycle = await createAndStartArtifactRenderer({
      create: async () => renderer,
      container: {} as HTMLElement,
      setupPageState: vi.fn(),
      rollbackPageState,
    });

    const first = lifecycle.dispose();
    const second = lifecycle.dispose();
    cleanup.resolve();
    await Promise.all([first, second]);

    expect(rollbackPageState).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it("disposes a partially mounted renderer exactly once and preserves the mount failure", async () => {
    const renderer = rendererFixture();
    renderer.mount.mockImplementationOnce(() => {
      throw new Error("mount failed");
    });
    renderer.dispose.mockImplementationOnce(() => {
      throw new Error("dispose failed");
    });
    const rollbackPageState = vi.fn();

    await expect(createAndStartArtifactRenderer({
      create: async () => renderer,
      container: {} as HTMLElement,
      setupPageState: vi.fn(),
      rollbackPageState,
    })).rejects.toThrow("mount failed");

    expect(rollbackPageState).not.toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it("rolls back partial page setup and disposes the renderer while preserving the setup failure", async () => {
    const renderer = rendererFixture();
    renderer.dispose.mockImplementationOnce(() => {
      throw new Error("dispose failed");
    });
    const rollbackPageState = vi.fn(() => {
      throw new Error("rollback failed");
    });

    await expect(createAndStartArtifactRenderer({
      create: async () => renderer,
      container: {} as HTMLElement,
      setupPageState: () => {
        throw new Error("setup failed");
      },
      rollbackPageState,
    })).rejects.toThrow("setup failed");

    expect(rollbackPageState).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it("attempts renderer disposal when normal page rollback throws and reuses the same rejection", async () => {
    const renderer = rendererFixture();
    const rollbackPageState = vi.fn(() => {
      throw new Error("rollback failed");
    });
    const lifecycle = await createAndStartArtifactRenderer({
      create: async () => renderer,
      container: {} as HTMLElement,
      setupPageState: vi.fn(),
      rollbackPageState,
    });

    const first = lifecycle.dispose();
    const second = lifecycle.dispose();

    await expect(first).rejects.toThrow("rollback failed");
    await expect(second).rejects.toThrow("rollback failed");
    expect(rollbackPageState).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
