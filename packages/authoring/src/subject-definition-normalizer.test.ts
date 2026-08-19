import { describe, expect, it } from "vitest";

import {
  builtInSubjectResourceRegistry,
  type SubjectResourceRegistryV2,
} from "@whitebox-world/subject-registry";

import {
  normalizeAuthoringSpecV2,
  type NormalizeAuthoringResultV2,
} from "./index";
import { createValidPackageSubjectWorldV2 } from "./test-fixture";

function packageDefinitionHash(result: NormalizeAuthoringResultV2): string {
  return result.value!.resources.subjectDefinitions.find(
    (definition) => definition.source === "package",
  )!.subjectDefinitionHash;
}

describe("Package Subject Definition normalization", () => {
  it("normalizes one Package Definition once for two Subject instances", () => {
    const result = normalizeAuthoringSpecV2(createValidPackageSubjectWorldV2());

    expect(result.ok).toBe(true);
    expect(result.value?.resources.subjectDefinitions).toHaveLength(2);
    expect(
      result.value?.resources.subjectDefinitions.find(
        (definition) => definition.source === "package",
      ),
    ).toMatchObject({
      subjectDefinitionRef: "package://subject-definition/coastal-pack-animal@1",
      subjectDefinitionHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      source: "package",
      collider: {
        kind: "capsule",
        radiusMeters: 0.7,
        heightMeters: 1.4,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
      },
      resourceCost: { vertices: 304, triangles: 524, colliders: 1 },
    });
    expect(
      result.value?.nodes.filter(
        (node) =>
          node.kind === "subject" &&
          node.subjectDefinitionRef ===
            "package://subject-definition/coastal-pack-animal@1",
      ),
    ).toHaveLength(2);
  });

  it("makes Definition and world hashes insensitive to order-only changes", () => {
    const first = normalizeAuthoringSpecV2(createValidPackageSubjectWorldV2());
    const reordered = normalizeAuthoringSpecV2(
      createValidPackageSubjectWorldV2({ reverseDefinitionCollections: true }),
    );

    expect(first.ok).toBe(true);
    expect(reordered.ok).toBe(true);
    expect(packageDefinitionHash(reordered)).toBe(packageDefinitionHash(first));
    expect(reordered.normalizedWorldIrHash).toBe(first.normalizedWorldIrHash);
  });

  it("changes Definition Hash for semantic geometry changes", () => {
    const first = normalizeAuthoringSpecV2(createValidPackageSubjectWorldV2());
    const changed = normalizeAuthoringSpecV2(
      createValidPackageSubjectWorldV2({ bodyWidthMeters: 1.1 }),
    );

    expect(first.ok).toBe(true);
    expect(changed.ok).toBe(true);
    expect(packageDefinitionHash(changed)).not.toBe(packageDefinitionHash(first));
  });

  it("emits a stable, de-duplicated Resource Lock", () => {
    const result = normalizeAuthoringSpecV2(createValidPackageSubjectWorldV2());

    expect(result.ok).toBe(true);
    const lock = result.value!.resources.resourceLock;
    expect(lock.map((entry) => entry.resourceRef)).toEqual([
      "package://subject-definition/coastal-pack-animal@1",
      "worldkit://capability/locomotion.ground@1",
      "worldkit://collider-derivation-profile/vertical-character-capsule@1",
      "worldkit://locomotion-profile/ground.standard@1",
      "worldkit://physics-body-profile/character.medium@1",
      "worldkit://subject-definition/humanoid.third-person@1",
    ]);
    expect(lock.every((entry) => /^sha256:[a-f0-9]{64}$/.test(entry.contentHash))).toBe(
      true,
    );
    expect(result.value!.resources.resourceLockHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects duplicate Package Definition identity", () => {
    const spec = createValidPackageSubjectWorldV2();
    spec.resources = {
      ...spec.resources,
      subjectDefinitions: [
        ...spec.resources.subjectDefinitions,
        structuredClone(spec.resources.subjectDefinitions[0]!),
      ],
    };

    expect(normalizeAuthoringSpecV2(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_DEFINITION_DUPLICATE",
        instancePath: "/resources/subjectDefinitions/1",
      }),
    );
  });

  it("does not fall back when an exact Package Definition ref is missing", () => {
    const spec = createValidPackageSubjectWorldV2();
    spec.nodes = spec.nodes.map((node) =>
      node.id === "pack-animal-a" && node.kind === "subject"
        ? {
            ...node,
            subjectDefinitionRef:
              "package://subject-definition/missing-pack-animal@1",
          }
        : node,
    );

    expect(normalizeAuthoringSpecV2(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_DEFINITION_NOT_FOUND",
        instancePath: "/nodes/8/subjectDefinitionRef",
      }),
    );
  });

  it("rejects a missing exact Profile ref", () => {
    const spec = createValidPackageSubjectWorldV2();
    const definition = spec.resources.subjectDefinitions[0]!;
    spec.resources = {
      ...spec.resources,
      subjectDefinitions: [
        {
          ...definition,
          profiles: {
            ...definition.profiles,
            locomotionProfileRef:
              "worldkit://locomotion-profile/ground.missing@1",
          },
        },
      ],
    };

    expect(normalizeAuthoringSpecV2(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_CAPABILITY_UNSATISFIED",
        instancePath:
          "/resources/subjectDefinitions/0/profiles/locomotionProfileRef",
      }),
    );
  });

  it("maps support-center failures to the Package Definition path", () => {
    const spec = createValidPackageSubjectWorldV2();
    const definition = spec.resources.subjectDefinitions[0]!;
    spec.resources = {
      ...spec.resources,
      subjectDefinitions: [
        {
          ...definition,
          visualParts: definition.visualParts.map((part) => ({
            ...part,
            localTransform: {
              ...part.localTransform,
              positionMetersXYZ: [
                part.localTransform.positionMetersXYZ[0],
                part.localTransform.positionMetersXYZ[1] + 1,
                part.localTransform.positionMetersXYZ[2],
              ],
            },
          })),
        },
      ],
    };

    expect(normalizeAuthoringSpecV2(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_SUPPORT_ORIGIN_INVALID",
        instancePath: "/resources/subjectDefinitions/0/visualParts",
      }),
    );
  });

  it("rejects a composition that cannot derive the selected Collider", () => {
    const spec = createValidPackageSubjectWorldV2();
    const definition = spec.resources.subjectDefinitions[0]!;
    spec.resources = {
      ...spec.resources,
      subjectDefinitions: [
        {
          ...definition,
          visualParts: definition.visualParts.map((part) => ({
            ...part,
            colliderContribution: "exclude" as const,
          })),
        },
      ],
    };

    expect(normalizeAuthoringSpecV2(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_COLLIDER_DERIVATION_FAILED",
        instancePath: "/resources/subjectDefinitions/0/colliderPolicy",
      }),
    );
  });

  it("rejects Registry content that conflicts with its immutable hash", () => {
    const conflictingRegistry: SubjectResourceRegistryV2 = {
      ...builtInSubjectResourceRegistry,
      resolveCapability(resourceRef) {
        const resource = builtInSubjectResourceRegistry.resolveCapability(resourceRef);
        return resource === undefined
          ? undefined
          : { ...resource, contentHash: `sha256:${"f".repeat(64)}` };
      },
    };

    expect(
      normalizeAuthoringSpecV2(createValidPackageSubjectWorldV2(), {
        subjectResourceRegistry: conflictingRegistry,
      }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_RESOURCE_LOCK_CONFLICT",
      }),
    );
  });
});
