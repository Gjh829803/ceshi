import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpec } from "@whitebox-world/authoring";
import type { ExecutionSubjectCapabilityAssemblyV1 } from "@whitebox-world/runtime-contracts";

import { createValidAuthoringSpec } from "../../authoring/src/test-fixture";
import { compileWorld } from "./index";

const PACKAGES = [
  {
    subjectDefinitionRef:
      "worldkit://subject-definition/humanoid.g-bot@1",
    defaultMotionKernelRef: "worldkit://motion-kernel/free-ground@1",
    motionKernelRefs: ["worldkit://motion-kernel/free-ground@1"],
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
  },
  {
    subjectDefinitionRef:
      "worldkit://subject-definition/animal.quadruped.forward-steer@1",
    defaultMotionKernelRef: "worldkit://motion-kernel/forward-steer@1",
    motionKernelRefs: [
      "worldkit://motion-kernel/forward-steer@1",
      "worldkit://motion-kernel/free-ground@1",
    ],
    controlProfileRef:
      "worldkit://control-profile/throttle-steer.subject-local@1",
  },
  {
    subjectDefinitionRef:
      "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
    defaultMotionKernelRef: "worldkit://motion-kernel/wheeled-arcade@1",
    motionKernelRefs: [
      "worldkit://motion-kernel/forward-steer@1",
      "worldkit://motion-kernel/wheeled-arcade@1",
    ],
    controlProfileRef:
      "worldkit://control-profile/throttle-steer.subject-local@1",
  },
  {
    subjectDefinitionRef:
      "worldkit://subject-definition/surface-craft.ice-skimmer@1",
    defaultMotionKernelRef: "worldkit://motion-kernel/surface-slide@1",
    motionKernelRefs: [
      "worldkit://motion-kernel/forward-steer@1",
      "worldkit://motion-kernel/surface-slide@1",
    ],
    controlProfileRef:
      "worldkit://control-profile/throttle-steer.subject-local@1",
  },
  {
    subjectDefinitionRef:
      "worldkit://subject-definition/watercraft.kayak.surface@1",
    defaultMotionKernelRef: "worldkit://motion-kernel/water-surface@1",
    motionKernelRefs: ["worldkit://motion-kernel/water-surface@1"],
    controlProfileRef:
      "worldkit://control-profile/throttle-steer.subject-local@1",
  },
  {
    subjectDefinitionRef:
      "worldkit://subject-definition/glider.paraglider.unpowered@1",
    defaultMotionKernelRef: "worldkit://motion-kernel/unpowered-glide@1",
    motionKernelRefs: ["worldkit://motion-kernel/unpowered-glide@1"],
    controlProfileRef: "worldkit://control-profile/flight-attitude@1",
  },
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

  const normalized = normalizeAuthoringSpec(spec);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error(`Capability package failed to normalize: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const compiled = compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
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
  it.each(PACKAGES)(
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
      expect(assembly.cameraContext.cameraRigProfiles).toHaveLength(7);
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
});
