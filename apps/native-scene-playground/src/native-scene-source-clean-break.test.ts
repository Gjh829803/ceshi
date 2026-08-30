import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";

import {
  CLOUD_RIDGE_GAMEPLAY_BOOTSTRAP_V1,
  CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1,
} from "./native-bootstrap.js";

const nativeBootstrapSource = await readFile(
  new URL("./native-bootstrap.ts", import.meta.url),
  "utf8",
);
const mainSource = await readFile(new URL("./main.ts", import.meta.url), "utf8");
const cloudRidgeSource = await readFile(
  new URL("./scene.ts", import.meta.url),
  "utf8",
);

describe("Cloud Ridge Native Scene Source clean break", () => {
  it("does not load, forge, hash, or pass a Canonical Execution Plan", () => {
    const removedPlanType = ["Execution", "Plan"].join("");
    const removedCompilerImport = ["@whitebox-world/", "compiler"].join("");
    const removedPlanHashField = ["execution", "Plan", "Hash"].join("");
    const removedPlanField = ["execution", "Plan"].join("");
    for (const source of [nativeBootstrapSource, mainSource]) {
      expect(source).not.toMatch(new RegExp(removedPlanType));
      expect(source).not.toMatch(new RegExp(removedCompilerImport));
      expect(source).not.toMatch(new RegExp(removedPlanHashField));
      expect(source).not.toMatch(new RegExp(`${removedPlanField}\\s*:`));
    }
  });

  it("loads the exact Plan-independent Runtime and Gameplay startup closure", () => {
    expect(CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.kind).toBe(
      "world-runtime-bootstrap",
    );
    expect(CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.gameplayBootstrapRef).toBe(
      CLOUD_RIDGE_GAMEPLAY_BOOTSTRAP_V1.resourceRef,
    );
    expect(CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.gameplayBootstrapHash).toBe(
      CLOUD_RIDGE_GAMEPLAY_BOOTSTRAP_V1.contentHash,
    );
    expect(CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1).not.toHaveProperty("terrain");
    expect(CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1).not.toHaveProperty("objects");
    expect(CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1).not.toHaveProperty("traversal");
  });

  it("keeps one default pure Module and deletes Controller/debug ownership", async () => {
    const namespace = await import("./scene.js");
    expect(Reflect.ownKeys(namespace)).toEqual([
      "default",
      Symbol.toStringTag,
    ]);
    expect(defineBabylonNativeScene(namespace.default)).toStrictEqual(
      namespace.default,
    );
    expect(Object.isFrozen(namespace.default)).toBe(true);

    for (const removed of [
      ["CloudRidge", "NativeSceneControllerV1"].join(""),
      ["createCloudRidge", "NativeSceneControllerV1"].join(""),
      ["collisionDebug", "Snapshot"].join(""),
      ["setCollisionDebug", "Visible"].join(""),
      ["collision", "Meshes"].join(""),
    ]) {
      expect(cloudRidgeSource).not.toContain(removed);
      expect(mainSource).not.toContain(removed);
    }
  });
});
