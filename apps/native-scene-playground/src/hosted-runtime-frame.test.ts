import { describe, expect, it } from "vitest";

import { consumeHostedInteractiveInputV1, renderHostedInteractiveFrameV1 } from
  "./hosted-interactive-input.js";
import { prepareHostedRuntimeFrameDocumentV1 } from
  "./hosted-runtime-frame.js";

describe("Hosted Runtime frame document", () => {
  it("removes Shell-owned chrome before the isolated Runtime becomes visible", () => {
    const rootClassNames = new Set<string>();
    const chromeElements = Array.from({ length: 4 }, () => ({
      isRemoved: false,
      remove() {
        this.isRemoved = true;
      },
    }));
    const frameDocument = {
      documentElement: {
        classList: {
          add(className: string) {
            rootClassNames.add(className);
          },
        },
      },
      querySelectorAll(selector: string) {
        expect(selector).toBe("[data-worldkit-shell-chrome]");
        return chromeElements;
      },
    } as unknown as Document;

    prepareHostedRuntimeFrameDocumentV1(frameDocument);

    expect(rootClassNames).toEqual(new Set(["hosted-runtime-surface"]));
    expect(chromeElements.every(({ isRemoved }) => isRemoved)).toBe(true);
  });
});

describe("Hosted Runtime interactive input", () => {
  it.each([
    ["free-ground", ["jump", "run", "handbrake", "aim"]],
    ["wheeled-arcade", ["boost", "brake", "handbrake", "aim"]],
    ["unpowered-glide", ["boost", "handbrake", "primary-action", "aim"]],
  ] as const)("maps physical keys for the actual %s kernel", (kernel, actions) => {
    const consumed = consumeHostedInteractiveInputV1({
      accumulatedSeconds: 1 / 60,
      pressedCodes: new Set(["ShiftLeft", "Space", "AltLeft", "KeyF"]),
      motionKernelRef: `worldkit://motion-kernel/${kernel}@1`,
    });
    expect(consumed.input?.actions).toEqual(actions);
  });

  it.each([30, 60, 120])("keeps one second at 60 fixed Ticks with a %i Hz display", (displayHz) => {
    let remainingSeconds = 0;
    let ticks = 0;
    for (let frame = 0; frame < displayHz; frame++) {
      const consumed = consumeHostedInteractiveInputV1({
        accumulatedSeconds: remainingSeconds + 1 / displayHz,
        pressedCodes: new Set(),
      });
      remainingSeconds = consumed.remainingSeconds;
      ticks += consumed.input?.ticks ?? 0;
    }
    expect(ticks).toBe(60);
    expect(remainingSeconds).toBeCloseTo(0, 12);
  });

  it("waits for committed input before rendering the remaining half-Tick", async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let committedTick = 0;
    const rendered: Array<{ tick: number; alpha: number }> = [];
    const task = renderHostedInteractiveFrameV1({
      accumulatedSeconds: 1 / 40, pressedCodes: new Set(),
      async runFixedInput(input) { await pending; committedTick += input.ticks; },
      renderFrame(alpha) { rendered.push({ tick: committedTick, alpha }); },
      isDisposed: () => false,
    });
    await Promise.resolve();
    expect(rendered).toEqual([]);
    release();
    expect(await task).toBeCloseTo(1 / 120, 12);
    expect(rendered).toHaveLength(1);
    expect(rendered[0]!.tick).toBe(1);
    expect(rendered[0]!.alpha).toBeCloseTo(0.5, 12);
  });

  it("renders sub-Tick time without submitting input", async () => {
    const rendered: number[] = [];
    await renderHostedInteractiveFrameV1({
      accumulatedSeconds: 1 / 120, pressedCodes: new Set(),
      async runFixedInput() { throw new Error("zero-Tick submission"); },
      renderFrame(alpha) { rendered.push(alpha); }, isDisposed: () => false,
    });
    expect(rendered).toEqual([0.5]);
  });

  it("does not render a disposed frame after an in-flight input completes", async () => {
    let disposed = false;
    const rendered: number[] = [];
    await renderHostedInteractiveFrameV1({
      accumulatedSeconds: 1 / 60, pressedCodes: new Set(),
      async runFixedInput() { disposed = true; },
      renderFrame(alpha) { rendered.push(alpha); }, isDisposed: () => disposed,
    });
    expect(rendered).toEqual([]);
  });

  it("propagates rejected input without rendering an uncommitted frame", async () => {
    const rendered: number[] = [];
    await expect(renderHostedInteractiveFrameV1({
      accumulatedSeconds: 1 / 60, pressedCodes: new Set(),
      async runFixedInput() { throw new Error("input rejected"); },
      renderFrame(alpha) { rendered.push(alpha); }, isDisposed: () => false,
    })).rejects.toThrow("input rejected");
    expect(rendered).toEqual([]);
  });

  it("discards long-frame backlog after the old five-Tick display budget", () => {
    const consumed = consumeHostedInteractiveInputV1({
      accumulatedSeconds: 0.5, pressedCodes: new Set(["KeyW"]),
    });
    expect(consumed.input?.ticks).toBe(5);
    expect(consumed.remainingSeconds).toBe(0);
  });

  it("consumes a floating-point Tick boundary without delaying it a display frame", () => {
    const consumed = consumeHostedInteractiveInputV1({
      accumulatedSeconds: 1 / 60 - 1e-13, pressedCodes: new Set(),
    });
    expect(consumed.input?.ticks).toBe(1);
    expect(consumed.remainingSeconds).toBe(0);
  });
  it("continues advancing with empty input after all keys are released", () => {
    const pressedCodes = new Set(["KeyW"]);
    const moving = consumeHostedInteractiveInputV1({
      accumulatedSeconds: 1 / 60,
      pressedCodes,
    });
    expect(moving).toEqual({
      input: { actions: ["move-forward"], ticks: 1 },
      remainingSeconds: 0,
    });

    pressedCodes.clear();
    const released = consumeHostedInteractiveInputV1({
      accumulatedSeconds: 1 / 60,
      pressedCodes,
    });
    expect(released).toEqual({
      input: { actions: [], ticks: 1 },
      remainingSeconds: 0,
    });
  });

  it("retains sub-tick time without submitting a zero-tick request", () => {
    expect(consumeHostedInteractiveInputV1({
      accumulatedSeconds: 1 / 120,
      pressedCodes: new Set(),
    })).toEqual({
      remainingSeconds: 1 / 120,
    });
  });
});
