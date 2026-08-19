import { describe, expect, it } from "vitest";

import { parseAuthoringSpecJson, validateAuthoringSpec } from "./index";
import { createValidAuthoringSpec } from "./test-fixture";

const validSpec = createValidAuthoringSpec();

describe("AuthoringSpecV1", () => {
  it("strictly parses a valid canonical authoring document", () => {
    const result = parseAuthoringSpecJson(JSON.stringify(validSpec));

    expect(result.ok).toBe(true);
    expect(result.value).toEqual(validSpec);
    expect(result.diagnostics).toEqual([]);
  });

  it("accepts the optional role-qualified subject spawn anchor field", () => {
    const spec = createValidAuthoringSpec();
    const subject = spec.nodes.find((node) => node.kind === "subject");
    if (subject === undefined || subject.kind !== "subject") throw new Error("fixture subject missing");
    subject.spawnAnchorEntityId = "spawn-main";

    expect(validateAuthoringSpec(spec)).toEqual({ ok: true, value: spec, diagnostics: [] });
  });

  it("rejects duplicate JSON object keys before schema validation", () => {
    const result = parseAuthoringSpecJson(
      '{"kind":"worldkit-authoring-spec","kind":"other"}',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_JSON_DUPLICATE_KEY",
        instancePath: "/kind",
      }),
    );
  });

  it("rejects unknown public fields instead of silently ignoring them", () => {
    const result = validateAuthoringSpec({ ...validSpec, unexpected: true });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_SCHEMA_INVALID",
        instancePath: "",
      }),
    );
  });

  it("rejects comments and trailing commas as non-JSON input", () => {
    const result = parseAuthoringSpecJson(`{
      // comments are not canonical JSON
      "kind": "worldkit-authoring-spec",
    }`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toEqual(
      expect.objectContaining({ code: "AUTHORING_JSON_SYNTAX_INVALID" }),
    );
  });
});
