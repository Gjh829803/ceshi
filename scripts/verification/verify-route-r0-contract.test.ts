import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runRouteR0ContractVerification } from "./verify-route-r0-contract";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("route R0 contract verifier", () => {
  it("validates frozen contracts without claiming runtime gates", async () => {
    const result = await runRouteR0ContractVerification({ repositoryRoot });
    const frozenContract = JSON.parse(await readFile(path.join(
      repositoryRoot,
      "examples/traversal/route-r0-contract.json",
    ), "utf8")) as {
      readonly lock: { readonly resourceLockHash: string };
      readonly graph: {
        readonly kind: string;
        readonly schemaVersion: number;
        readonly resourceLockHash: string;
        readonly resolvedTraversalLockHash: string;
      };
      readonly traversalGraphHash: string;
    };
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
    expect(frozenContract.lock.resourceLockHash).toBe(
      frozenContract.graph.resourceLockHash,
    );
    expect(frozenContract.graph).toMatchObject({
      kind: "traversal-graph",
      schemaVersion: 2,
      resourceLockHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      resolvedTraversalLockHash:
        "sha256:8bb93add235d04fa2e2c31b25c42456da450a09f3c2b09e0dffb90a69dc98d5f",
    });
    expect(frozenContract.traversalGraphHash).toBe(
      "sha256:dada70388e0436f84feccd17d5fbe1b9135fc4bc6eb25ef3c7ea1c1f26b5f1d9",
    );
  });
});
