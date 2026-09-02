import { describe, expect, it, vi } from "vitest";
import { hashFormalWorldCaptureRequestV1 } from
  "@whitebox-world/runtime-contracts";

import { formalCaptureRequestFixtureV1 } from
  "@whitebox-world/runtime-babylon/testing";
import {
  createFormalCaptureCandidateCanvasV1,
  readHostedFormalCaptureRouteIdentityV1,
} from
  "./hosted-formal-capture-route.js";

const request = formalCaptureRequestFixtureV1();
const hash = hashFormalWorldCaptureRequestV1(request);

function routeSearch(mode: "shell" | "frame"): string {
  const query = new URLSearchParams({
    [mode === "shell"
      ? "hosted-formal-capture"
      : "hosted-formal-capture-frame"]: "1",
    runtimeSessionId: "runtime.formal-capture.route.001",
    sessionNonce: "nonce.formal-capture.route.001",
    formalRequestId: request.id,
    formalRequestHash: hash,
  });
  return `?${query.toString()}`;
}

describe("capture-only Hosted route identity", () => {
  it("allocates and activates one independent canvas for every Candidate", () => {
    const first = {
      setAttribute: vi.fn(),
    } as unknown as HTMLCanvasElement;
    const second = {
      setAttribute: vi.fn(),
    } as unknown as HTMLCanvasElement;
    const createElement = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const replaceChildren = vi.fn();
    const viewport = {
      ownerDocument: { createElement },
      replaceChildren,
    } as unknown as HTMLElement;

    expect(createFormalCaptureCandidateCanvasV1(viewport)).toBe(first);
    expect(createFormalCaptureCandidateCanvasV1(viewport)).toBe(second);
    expect(createElement).toHaveBeenNthCalledWith(1, "canvas");
    expect(createElement).toHaveBeenNthCalledWith(2, "canvas");
    expect(replaceChildren).toHaveBeenNthCalledWith(1, first);
    expect(replaceChildren).toHaveBeenNthCalledWith(2, second);
  });

  it.each(["shell", "frame"] as const)(
    "accepts one exact %s mode",
    (mode) => {
      expect(readHostedFormalCaptureRouteIdentityV1(
        routeSearch(mode),
        mode,
      )).toEqual({
        runtimeSessionId: "runtime.formal-capture.route.001",
        sessionNonce: "nonce.formal-capture.route.001",
        formalRequestId: request.id,
        formalRequestHash: hash,
      });
    },
  );

  it.each([
    ["wrong mode value", routeSearch("shell").replace(
      "hosted-formal-capture=1",
      "hosted-formal-capture=0",
    )],
    ["both modes", `${routeSearch("shell")}&hosted-formal-capture-frame=1`],
    ["duplicate identity", `${routeSearch("shell")}&sessionNonce=again`],
    ["unexpected parameter", `${routeSearch("shell")}&hosted=1`],
  ])("rejects %s", (_label, search) => {
    expect(() => readHostedFormalCaptureRouteIdentityV1(search, "shell"))
      .toThrow("ROUTE_PARAMETERS_INVALID");
  });
});
