import { describe, expect, it } from "vitest";

import { consumeHostedInteractiveInputV1 } from
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
