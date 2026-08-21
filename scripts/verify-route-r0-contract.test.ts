import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runRouteR0ContractVerification } from "./verify-route-r0-contract";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

describe("route R0 contract verifier", () => {
  it("validates frozen contracts without claiming runtime gates", async () => {
    const result = await runRouteR0ContractVerification({ repositoryRoot });
    expect(result).toEqual({
      ok: true,
      checks: [
        "authoring-v4-connectivity",
        "planner-route-projection",
        "traversal-surface-identity",
        "resolved-traversal-lock",
        "driver-profile-whitelist",
        "canonical-graph-bytes",
        "route-validation-vocabulary",
        "lock-mismatch-diagnostic",
      ],
    });
  });
});
