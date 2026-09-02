import { describe, expect, it } from "vitest";

import { presentPageFailureV1 } from "./page-failure.js";

interface FailureElementFixtureV1 {
  hidden: boolean;
  textContent: string | null;
}

function documentFixture(input: {
  readonly errorElement: FailureElementFixtureV1;
  readonly stateElement?: FailureElementFixtureV1;
}): Document {
  return {
    querySelector(selector: string) {
      if (selector === "[data-error]") return input.errorElement;
      if (selector === "[data-state]") return input.stateElement ?? null;
      return null;
    },
  } as unknown as Document;
}

describe("page failure presentation", () => {
  it("preserves the original failure when Hosted Frame chrome has been removed", () => {
    const errorElement = { hidden: true, textContent: null };

    expect(() => presentPageFailureV1(
      documentFixture({ errorElement }),
      new Error("WORLDKIT_HOSTED_RUNTIME_FRAME_PARAMETERS_MISSING"),
    )).not.toThrow();

    expect(errorElement).toEqual({
      hidden: false,
      textContent:
        "Error\nWORLDKIT_HOSTED_RUNTIME_FRAME_PARAMETERS_MISSING",
    });
  });

  it("marks the route failed when its state chrome is present", () => {
    const errorElement = { hidden: true, textContent: null };
    const stateElement = { hidden: false, textContent: "LOADING" };

    presentPageFailureV1(
      documentFixture({ errorElement, stateElement }),
      new Error("WORLDKIT_NATIVE_SCENE_RUNTIME_FAILED"),
    );

    expect(stateElement.textContent).toBe("FAILED");
  });
});
