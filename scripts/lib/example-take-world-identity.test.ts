import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compileSimulationTakeV1,
  type SimulationTakeV1,
} from "@whitebox-world/control-capture";
import { describe, expect, it } from "vitest";

import { bindSimulationTakeWorldIdentityV1 } from "./example-take-world-identity";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const TAKE_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/takes/coastal-walk-opening.take.json",
);
const CURRENT_WORLD_PACKAGE_ROOT_HASH =
  `sha256:${"a".repeat(64)}` as const;

describe("bindSimulationTakeWorldIdentityV1", () => {
  it("rebuilds a validated immutable Take with the current WorldPackage identity", async () => {
    const source = JSON.parse(
      await readFile(TAKE_PATH, "utf8"),
    ) as SimulationTakeV1;
    const sourceSnapshot = structuredClone(source);

    const rebound = bindSimulationTakeWorldIdentityV1(
      source,
      CURRENT_WORLD_PACKAGE_ROOT_HASH,
    );

    expect(rebound.worldPackageRootHash).toBe(
      CURRENT_WORLD_PACKAGE_ROOT_HASH,
    );
    expect({
      ...rebound,
      worldPackageRootHash: source.worldPackageRootHash,
    }).toEqual(compileSimulationTakeV1(source).take);
    expect(source).toEqual(sourceSnapshot);
    expect(Object.isFrozen(rebound)).toBe(true);
  });
});
