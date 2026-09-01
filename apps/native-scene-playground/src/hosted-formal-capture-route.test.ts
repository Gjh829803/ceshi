import { describe, expect, it } from "vitest";
import { hashFormalWorldCaptureRequestV1 } from
  "@whitebox-world/runtime-contracts";

import { formalCaptureRequestFixtureV1 } from
  "./hosted-formal-capture-test-fixture.js";
import { readHostedFormalCaptureRouteIdentityV1 } from
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
