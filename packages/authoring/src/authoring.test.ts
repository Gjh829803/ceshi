import { describe, expect, it } from "vitest";

import { BIPED_BONE_IDS_V1 } from "@whitebox-world/subject-contracts";

import subjectDefinitionV1Schema from "./subject-definition-v1.schema.json";
import {
  parseAuthoringSpecV4,
  parseCanonicalJson,
  validateAuthoringSpecV4,
  validatePackageSubjectDefinition,
} from "./index";
import {
  createValidAuthoringSpec,
  createValidMountedOnAuthoringSpec,
  createValidPackageSubjectWorld,
  createValidRiggedPackageDefinition,
} from "./test-fixture";

const validSpec = createValidAuthoringSpec();

describe("current AuthoringSpec", () => {
  it("strictly parses a valid canonical V4 document", () => {
    const result = parseAuthoringSpecV4(JSON.stringify(validSpec));

    expect(result.ok).toBe(true);
    expect(result.value).toEqual(validSpec);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects duplicate JSON object keys before schema validation", () => {
    const result = parseAuthoringSpecV4(
      '{"kind":"worldkit-authoring-spec","kind":"worldkit-authoring-spec","schemaVersion":3}',
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_JSON_DUPLICATE_KEY",
        instancePath: "/kind",
      }),
    );
  });

  it.each(["-0", "-0.0", "-0e2"])(
    "rejects forbidden negative-zero token %s before schema validation",
    (negativeZero) => {
      const result = parseCanonicalJson(
        `{"nested":{"value":${negativeZero}}}`,
      );

      expect(result).toMatchObject({
        ok: false,
        diagnostics: [{
          severity: "error",
          code: "AUTHORING_JSON_NEGATIVE_ZERO",
          instancePath: "/nested/value",
        }],
      });
    },
  );

  it("materializes validated JSON as nested plain objects", () => {
    const result = parseCanonicalJson('{"nested":{"value":1}}');

    expect(result.ok).toBe(true);
    expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
    expect(
      Object.getPrototypeOf((result.value as { nested: object }).nested),
    ).toBe(Object.prototype);
  });

  it("rejects unknown Subject fields instead of silently ignoring them", () => {
    const subject = validSpec.nodes.find((node) => node.kind === "subject");
    expect(subject).toBeDefined();
    const result = validateAuthoringSpecV4({
      ...validSpec,
      nodes: validSpec.nodes.map((node) =>
        node === subject ? { ...node, unexpectedSubjectField: true } : node,
      ),
    });

    expect(result.ok).toBe(false);
  });

  it("rejects the unpublished schemaVersion 1 instead of migrating it", () => {
    const result = parseAuthoringSpecV4(
      JSON.stringify({ ...validSpec, schemaVersion: 1 }),
    );

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
          instancePath: "/schemaVersion",
          details: { supportedSchemaVersions: [4] },
        },
      ],
    });
  });

  it("rejects unsupported non-integer schema versions with the same version diagnostic", () => {
    const result = parseAuthoringSpecV4(
      JSON.stringify({ ...validSpec, schemaVersion: 3.5 }),
    );

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
          instancePath: "/schemaVersion",
          details: { supportedSchemaVersions: [4] },
        },
      ],
    });
  });

  it("rejects unknown V4 root fields and the removed legacy subject reference field", () => {
    const subject = validSpec.nodes.find((node) => node.kind === "subject");
    const legacySubjectReferenceField = ["kit", "Ref"].join("");
    expect(subject).toBeDefined();

    expect(validateAuthoringSpecV4({ ...validSpec, unexpectedRootField: true }).ok).toBe(false);
    expect(
      validateAuthoringSpecV4({
        ...validSpec,
        nodes: validSpec.nodes.map((node) =>
          node === subject
            ? {
                ...node,
                [legacySubjectReferenceField]:
                  "worldkit://kit/humanoid.third-person@1",
              }
            : node,
        ),
      }).ok,
    ).toBe(false);
  });

  it("rejects invalid or unversioned Subject Definition refs", () => {
    const subject = validSpec.nodes.find((node) => node.kind === "subject");
    expect(subject).toBeDefined();
    const result = validateAuthoringSpecV4({
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
    const packageWorld = createValidPackageSubjectWorld();
    const definition = packageWorld.resources.subjectDefinitions[0];
    expect(definition).toBeDefined();

    expect(validateAuthoringSpecV4(packageWorld).ok).toBe(true);
    expect(validatePackageSubjectDefinition(definition)).toEqual({
      ok: true,
      value: definition,
      diagnostics: [],
    });
  });

  it("accepts an exact stand Mount slot owned by a Package Subject Definition", () => {
    const definition = createValidPackageSubjectWorld().resources
      .subjectDefinitions[0]!;
    const input = {
      ...definition,
      sockets: [
        ...definition.sockets,
        {
          id: "MountStand",
          kind: "local",
          localTransform: { positionMetersXYZ: [0, 0.25, 0] },
          semanticTags: ["mounted-on", "stand"],
        },
      ],
      mountSlots: [{
        id: "stand",
        kind: "mount-slot",
        mode: "stand",
        mountSocketId: "MountStand",
        riderSubjectOriginOffsetMetersXYZ: [0, 0.2, 0],
        dismountCandidateOffsetsMetersXYZ: [
          [0.8, 0, 0],
          [-0.8, 0, 0],
        ],
      }],
    };

    expect(validatePackageSubjectDefinition(input)).toEqual({
      ok: true,
      value: input,
      diagnostics: [],
    });
  });

  it("accepts only the closed mountedOn Relationship shape", () => {
    const validMountedOn = createValidMountedOnAuthoringSpec();
    expect(validateAuthoringSpecV4(validMountedOn).ok).toBe(true);

    const relationship = validMountedOn.relationships[0]!;
    expect(validateAuthoringSpecV4({
      ...validMountedOn,
      relationships: [{ ...relationship, unexpected: true }],
    }).ok).toBe(false);
    expect(validateAuthoringSpecV4({
      ...validMountedOn,
      relationships: [{
        id: relationship.id,
        type: "mount",
        schemaVersion: 1,
        sourceEntityId: relationship.riderEntityId,
        targetEntityId: relationship.mountEntityId,
        params: { mountSlotId: relationship.mountSlotId },
      }],
    }).ok).toBe(false);
  });

  it("rejects attempts to author computed Definition fields", () => {
    const spec = createValidPackageSubjectWorld();
    const definition = spec.resources.subjectDefinitions[0];
    expect(definition).toBeDefined();
    const result = validatePackageSubjectDefinition({
      ...definition,
      subjectDefinitionHash: `sha256:${"a".repeat(64)}`,
      resourceCost: { vertices: 1, triangles: 1, colliders: 1 },
    });

    expect(result.ok).toBe(false);
  });

  it("rejects non-finite primitive dimensions before semantic normalization", () => {
    const definition = createValidPackageSubjectWorld().resources.subjectDefinitions[0];
    expect(definition).toBeDefined();
    const firstPart = definition!.visualParts[0];
    expect(firstPart).toBeDefined();
    const result = validatePackageSubjectDefinition({
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

  it("accepts one rigged Asset Part with exact Profiles", () => {
    const result = validatePackageSubjectDefinition(
      createValidRiggedPackageDefinition(),
    );

    expect(result).toEqual({
      ok: true,
      value: createValidRiggedPackageDefinition(),
      diagnostics: [],
    });
  });

  it("keeps the Biped bone Schema in exact parity and rejects stale root", () => {
    const socketBranches = (
      subjectDefinitionV1Schema.$defs.socket as {
        oneOf: Array<{
          properties: {
            kind: { const: string };
            boneId?: { enum: string[] };
          };
        }>;
      }
    ).oneOf;
    const boneIdEnum = socketBranches.find(
      (branch) => branch.properties.kind.const === "bone",
    )?.properties.boneId?.enum;

    expect(boneIdEnum).toEqual(BIPED_BONE_IDS_V1);

    const definition = structuredClone(
      createValidRiggedPackageDefinition(),
    ) as unknown as {
      sockets: Array<{ boneId: string }>;
    };
    definition.sockets[0]!.boneId = "root";
    expect(validatePackageSubjectDefinition(definition)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ instancePath: "/sockets/0/boneId" }),
      ]),
    });
  });

  it("accepts one static Asset Part without rigged-only resources", () => {
    const definition = createValidRiggedPackageDefinition();
    const staticDefinition = {
      ...definition,
      visualBinding: { mode: "static" as const },
      sockets: [],
    };

    expect(validatePackageSubjectDefinition(staticDefinition)).toEqual({
      ok: true,
      value: staticDefinition,
      diagnostics: [],
    });
  });

  it.each([
    ["asset part with colliderContribution", "/visualParts/0/colliderContribution"],
    ["rigged binding without animationSetRef", "/visualBinding/animationSetRef"],
    ["bone socket without boneId", "/sockets/0/boneId"],
  ])("rejects %s at the exact property path", (_label, instancePath) => {
    const definition = structuredClone(
      createValidRiggedPackageDefinition(),
    ) as unknown as Record<string, unknown>;
    const visualParts = definition.visualParts as Array<Record<string, unknown>>;
    const visualBinding = definition.visualBinding as Record<string, unknown>;
    const sockets = definition.sockets as Array<Record<string, unknown>>;

    switch (instancePath) {
      case "/visualParts/0/colliderContribution":
        visualParts[0]!.colliderContribution = "include";
        break;
      case "/visualBinding/animationSetRef":
        delete visualBinding.animationSetRef;
        break;
      case "/sockets/0/boneId":
        delete sockets[0]!.boneId;
        break;
    }

    const result = validatePackageSubjectDefinition(definition);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "error", instancePath }),
      ]),
    );
  });

  it("requires sorted first-batch allowedOverridePaths on Package Definitions", () => {
    const definition = createValidPackageSubjectWorld().resources
      .subjectDefinitions[0]!;
    expect(validatePackageSubjectDefinition({
      ...definition,
      allowedOverridePaths: [],
    }).ok).toBe(true);
    expect(validatePackageSubjectDefinition({
      ...definition,
      allowedOverridePaths: [
        "profiles.motion.defaultMotionProfileRef",
        "profiles.controlFeelProfileRef",
      ],
    }).ok).toBe(false);
    expect(validatePackageSubjectDefinition({
      ...definition,
      allowedOverridePaths: ["id"],
    }).ok).toBe(false);
  });

  it("accepts optional Subject instance Resource Ref overrides and rejects duplicate ids", () => {
    const spec = createValidPackageSubjectWorld();
    const subject = spec.nodes.find((node) => node.kind === "subject");
    expect(subject).toBeDefined();
    const override = {
      id: "override.feel.heavy",
      kind: "resource-ref" as const,
      path: "profiles.controlFeelProfileRef",
      resourceRef: "worldkit://control-feel-profile/humanoid.heavy-ground@1",
    };
    expect(validateAuthoringSpecV4({
      ...spec,
      nodes: spec.nodes.map((node) =>
        node === subject ? { ...node, overrides: [override] } : node,
      ),
    }).ok).toBe(true);
    expect(validateAuthoringSpecV4({
      ...spec,
      nodes: spec.nodes.map((node) =>
        node === subject
          ? { ...node, overrides: [override, { ...override, path: "profiles.controlProfileRef" }] }
          : node,
      ),
    }).ok).toBe(false);
    expect(validateAuthoringSpecV4({
      ...spec,
      nodes: spec.nodes.map((node) =>
        node === subject
          ? {
              ...node,
              overrides: [
                override,
                { ...override, id: "override.feel.duplicate-path" },
              ],
            }
          : node,
      ),
    }).ok).toBe(false);
  });
});
