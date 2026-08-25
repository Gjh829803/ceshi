import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpecV4 } from "@whitebox-world/authoring";
import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type { ExecutionSubjectCapabilityAssemblyV1 } from "@whitebox-world/runtime-contracts";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";

import {
  createValidAuthoringSpecV4 as createValidAuthoringSpec,
} from "../../authoring/src/test-fixture";
import { compileWorldV5 } from "./index";

const GAMEPLAY_BOOTSTRAP_LOCK =
  createGameplayBootstrapResourceLockEntryV1(createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: "capability-compile-test.gameplay",
    version: 1,
    resourceRef: "worldkit://gameplay-bootstrap/capability-compile-test@1",
    entityDescriptors: [],
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
  }));

const IMPLEMENTED_PACKAGES = [
  {
    subjectDefinitionRef:
      "worldkit://subject-definition/humanoid.g-bot@2",
    defaultMotionKernelRef: "worldkit://motion-kernel/free-ground@1",
    motionKernelRefs: ["worldkit://motion-kernel/free-ground@1"],
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
  },
] as const;

const UNAVAILABLE_RELATIONSHIP_PACKAGES = [
  [
    "worldkit://subject-definition/animal.quadruped.forward-steer@1",
    "mount",
  ],
  [
    "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
    "seat",
  ],
  [
    "worldkit://subject-definition/glider.paraglider.unpowered@1",
    "tether",
  ],
] as const;

function compilePackage(
  subjectDefinitionRef: string,
): {
  assembly: ExecutionSubjectCapabilityAssemblyV1;
  lockedResourceRefs: readonly string[];
} {
  const spec = createValidAuthoringSpec();
  const subject = spec.nodes.find((node) => node.kind === "subject");
  if (subject === undefined || subject.kind !== "subject") {
    throw new Error("Expected the valid fixture to contain a Subject node.");
  }
  subject.subjectDefinitionRef = subjectDefinitionRef;

  const normalized = normalizeAuthoringSpecV4(spec);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error(`Capability package failed to normalize: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock: GAMEPLAY_BOOTSTRAP_LOCK,
  });
  if (!compiled.ok || compiled.executionPlan === undefined) {
    throw new Error(`Capability package failed to compile: ${JSON.stringify(compiled.diagnostics)}`);
  }
  const assembly = compiled.executionPlan.subjects[0]?.capabilityAssembly;
  if (assembly === undefined) {
    throw new Error("Capability assembly was not projected into the Execution Plan.");
  }
  return {
    assembly,
    lockedResourceRefs: normalized.value.resources.resourceLock.map(
      (resource) => resource.resourceRef,
    ),
  };
}

describe("capability-driven Subject compilation", () => {
  it.each(IMPLEMENTED_PACKAGES)(
    "atomically compiles $subjectDefinitionRef into replaceable runtime resources",
    ({ subjectDefinitionRef, defaultMotionKernelRef, motionKernelRefs, controlProfileRef }) => {
      const { assembly, lockedResourceRefs } = compilePackage(subjectDefinitionRef);
      const projectedKernels = assembly.motionKernels;

      expect(projectedKernels.map((kernel) => kernel.resourceRef).sort()).toEqual(
        [...motionKernelRefs].sort(),
      );
      expect(
        motionKernelRefs.every((resourceRef) => lockedResourceRefs.includes(resourceRef)),
      ).toBe(true);
      expect(projectedKernels.every((kernel) => kernel.deterministic)).toBe(true);
      expect(assembly.controlProfile.resourceRef).toBe(controlProfileRef);
      expect(
        projectedKernels.find(
          (kernel) => kernel.resourceRef === defaultMotionKernelRef,
        )?.commandKind,
      ).toBe(assembly.controlProfile.commandKind);
      expect(assembly.cameraContext.cameraRigProfiles).toHaveLength(5);
      expect(assembly.cameraContext.cameraModifierProfiles).toHaveLength(5);
      expect(
        new Set(
          assembly.cameraContext.cameraRigProfiles.map(
            (profile) => profile.algorithmRef,
          ),
        ).size,
      ).toBe(4);
      expect(assembly.requiredHarnessCheckIds).toEqual([
        "H01",
        "H02",
        "H03",
        "H04",
        "H05",
        "H06",
        "H07",
        "H08",
        "H09",
      ]);
      expect(assembly.harnessProfileRef).toBe(
        "worldkit://harness-profile/subject.standard@1",
      );
    },
  );

  it.each(UNAVAILABLE_RELATIONSHIP_PACKAGES)(
    "rejects $0 because its $1 relationship behavior is unavailable",
    (subjectDefinitionRef) => {
      const spec = createValidAuthoringSpec();
      const subject = spec.nodes.find((node) => node.kind === "subject");
      if (subject === undefined || subject.kind !== "subject") {
        throw new Error("Expected the valid fixture to contain a Subject node.");
      }
      subject.subjectDefinitionRef = subjectDefinitionRef;

      const normalized = normalizeAuthoringSpecV4(spec);

      expect(normalized.ok).toBe(false);
      expect(normalized.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "SUBJECT_CAPABILITY_UNSATISFIED" }),
      ]));
    },
  );

  it("defensively rejects a reserved relationship Profile at the normalized-to-compiled boundary", () => {
    const spec = createValidAuthoringSpec();
    const subject = spec.nodes.find((node) => node.kind === "subject");
    if (subject === undefined || subject.kind !== "subject") {
      throw new Error("Expected the valid fixture to contain a Subject node.");
    }
    subject.subjectDefinitionRef = "worldkit://subject-definition/humanoid.g-bot@2";
    const normalized = normalizeAuthoringSpecV4(spec);
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error(`G Bot fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
    }
    const forged = structuredClone(normalized.value);
    const definition = forged.resources.subjectDefinitions[0] as typeof forged.resources.subjectDefinitions[number] & {
      capabilityAssembly: {
        relationshipProfiles: unknown[];
      };
    };
    const reservedSeat = builtInSubjectResourceRegistry.resolveRelationshipProfile(
      "worldkit://relationship-profile/seat.driver@1",
    );
    if (definition?.capabilityAssembly === undefined || reservedSeat === undefined) {
      throw new Error("Reserved relationship defense fixture is incomplete.");
    }
    definition.capabilityAssembly.relationshipProfiles = [reservedSeat];

    expect(compileWorldV5({
      normalizedWorldIr: forged,
      normalizedWorldIrHash: sha256CanonicalJson(forged),
      gameplayBootstrapResourceLock: GAMEPLAY_BOOTSTRAP_LOCK,
    })).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "COMPILER_NORMALIZED_IR_INVALID",
        message: expect.stringContaining("reserved Relationship Profile"),
      }],
    });
  });
});
