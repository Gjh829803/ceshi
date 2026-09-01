import { describe, expect, it } from "vitest";

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
