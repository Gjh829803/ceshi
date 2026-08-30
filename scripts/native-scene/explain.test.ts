import {
  parseNativeSceneCheckResultV1,
  parseNativeSceneDiagnosticV1,
} from "@whitebox-world/native-babylon";
import { describe, expect, it } from "vitest";

import { explainNativeSceneCheckResultV1 } from "./explain.js";

describe("explainNativeSceneCheckResultV1", () => {
  it("renders the same DTO as deterministic newline-terminated text", () => {
    const diagnostic = parseNativeSceneDiagnosticV1({
      kind: "native-scene-diagnostic",
      schemaVersion: 1,
      id: "explain.source-failure",
      severity: "error",
      stage: "source-admission",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
      location: {
        kind: "source",
        sourcePath: "src/scene.ts",
        lineNumber: 4,
        columnNumber: 7,
      },
      measurement: { kind: "none" },
      message: "Native source requested a forbidden capability.",
      repairHint: "Remove the forbidden call.",
    });
    const result = parseNativeSceneCheckResultV1({
      kind: "native-scene-check-result",
      schemaVersion: 1,
      id: "explain.check",
      checkedInput: {
        kind: "native-scene-module",
        sceneModuleRef: "worldkit://native-scene/explain@1",
      },
      outcome: "rejected",
      diagnostics: [diagnostic],
    });

    expect(explainNativeSceneCheckResultV1(result)).toBe(
      "outcome: rejected\n" +
      "stage: source-admission | code: WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN | location: src/scene.ts:4:7 | message: Native source requested a forbidden capability. | repairHint: Remove the forbidden call.\n",
    );
  });

  it("renders a passing result without inventing diagnostics", () => {
    const result = parseNativeSceneCheckResultV1({
      kind: "native-scene-check-result",
      schemaVersion: 1,
      id: "explain.passed",
      checkedInput: {
        kind: "native-scene-module",
        sceneModuleRef: "worldkit://native-scene/explain@1",
      },
      outcome: "passed",
      diagnostics: [],
    });

    expect(explainNativeSceneCheckResultV1(result)).toBe("outcome: passed\n");
  });
});
