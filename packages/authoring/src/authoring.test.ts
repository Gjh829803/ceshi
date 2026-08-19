import { describe, expect, it } from "vitest";

import {
  parseAuthoringSpecJsonV2,
  validateAuthoringSpecV2,
  validatePackageSubjectDefinitionV1,
} from "./index";
import {
  createValidAuthoringSpecV2,
  createValidPackageSubjectWorldV2,
} from "./test-fixture";

const validSpec = createValidAuthoringSpecV2();

describe("AuthoringSpecV2", () => {
  it("strictly parses a valid canonical V2 document", () => {
    const result = parseAuthoringSpecJsonV2(JSON.stringify(validSpec));

    expect(result.ok).toBe(true);
    expect(result.value).toEqual(validSpec);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects duplicate JSON object keys before schema validation", () => {
    const result = parseAuthoringSpecJsonV2(
      '{"kind":"worldkit-authoring-spec","kind":"worldkit-authoring-spec","schemaVersion":2}',
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_JSON_DUPLICATE_KEY",
        instancePath: "/kind",
      }),
    );
  });

  it("rejects unknown Subject fields instead of silently ignoring them", () => {
    const subject = validSpec.nodes.find((node) => node.kind === "subject");
    expect(subject).toBeDefined();
    const result = validateAuthoringSpecV2({
      ...validSpec,
      nodes: validSpec.nodes.map((node) =>
        node === subject ? { ...node, unexpectedSubjectField: true } : node,
      ),
    });

    expect(result.ok).toBe(false);
  });

  it("rejects the unpublished schemaVersion 1 instead of migrating it", () => {
    const result = parseAuthoringSpecJsonV2(
      JSON.stringify({ ...validSpec, schemaVersion: 1 }),
    );

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
          instancePath: "/schemaVersion",
          details: { supportedSchemaVersions: [2] },
        },
      ],
    });
  });

  it("rejects unsupported non-integer schema versions with the same version diagnostic", () => {
    const result = parseAuthoringSpecJsonV2(
      JSON.stringify({ ...validSpec, schemaVersion: 2.5 }),
    );

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
          instancePath: "/schemaVersion",
          details: { supportedSchemaVersions: [2] },
        },
      ],
    });
  });

  it("rejects unknown V2 root fields and the removed kitRef field", () => {
    const subject = validSpec.nodes.find((node) => node.kind === "subject");
    expect(subject).toBeDefined();

    expect(validateAuthoringSpecV2({ ...validSpec, unexpectedRootField: true }).ok).toBe(false);
    expect(
      validateAuthoringSpecV2({
        ...validSpec,
        nodes: validSpec.nodes.map((node) =>
          node === subject
            ? { ...node, kitRef: "worldkit://kit/humanoid.third-person@1" }
            : node,
        ),
      }).ok,
    ).toBe(false);
  });

  it("rejects invalid or unversioned Subject Definition refs", () => {
    const subject = validSpec.nodes.find((node) => node.kind === "subject");
    expect(subject).toBeDefined();
    const result = validateAuthoringSpecV2({
      ...validSpec,
      nodes: validSpec.nodes.map((node) =>
        node === subject
          ? {
              ...node,
              subjectDefinitionRef:
                "worldkit://subject-definition/humanoid.third-person",
            }
          : node,
      ),
    });

    expect(result.ok).toBe(false);
  });

  it("validates Package Subject Definitions independently", () => {
    const packageWorld = createValidPackageSubjectWorldV2();
    const definition = packageWorld.resources.subjectDefinitions[0];
    expect(definition).toBeDefined();

    expect(validateAuthoringSpecV2(packageWorld).ok).toBe(true);
    expect(validatePackageSubjectDefinitionV1(definition)).toEqual({
      ok: true,
      value: definition,
      diagnostics: [],
    });
  });

  it("rejects attempts to author computed Definition fields", () => {
    const spec = createValidPackageSubjectWorldV2();
    const definition = spec.resources.subjectDefinitions[0];
    expect(definition).toBeDefined();
    const result = validatePackageSubjectDefinitionV1({
      ...definition,
      subjectDefinitionHash: `sha256:${"a".repeat(64)}`,
      resourceCost: { vertices: 1, triangles: 1, colliders: 1 },
    });

    expect(result.ok).toBe(false);
  });

  it("rejects non-finite primitive dimensions before semantic normalization", () => {
    const definition = createValidPackageSubjectWorldV2().resources.subjectDefinitions[0];
    expect(definition).toBeDefined();
    const firstPart = definition!.visualParts[0];
    expect(firstPart).toBeDefined();
    const result = validatePackageSubjectDefinitionV1({
      ...definition,
      visualParts: [
        {
          ...firstPart,
          shape: { kind: "sphere", radiusMeters: Number.NaN },
        },
      ],
    });

    expect(result.ok).toBe(false);
  });
});
