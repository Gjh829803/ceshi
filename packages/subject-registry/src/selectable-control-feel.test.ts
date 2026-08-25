import { describe, expect, it } from "vitest";

import {
  GROUND_HUMANOID_CONTROL_FEEL_HEAVY_REF,
  GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF,
  isSelectableControlFeelProfileRefV1,
  selectableControlFeelProfileRefsV1,
} from "./selectable-control-feel";
import { builtInSubjectResourceRegistry } from "./built-in-subject-resource-registry";
import { resolveSubjectPresetClosureV1 } from "./subject-preset-closure";

const QUADRUPED_SPECIFIC_FEEL_REF =
  "worldkit://control-feel-profile/subject.animal.quadruped.forward-steer.default@1";

describe("selectable Control Feel authority", () => {
  it("puts the default first and keeps remaining allowed refs in declaration order", () => {
    expect(selectableControlFeelProfileRefsV1({
      controlFeelProfileRef: GROUND_HUMANOID_CONTROL_FEEL_HEAVY_REF,
      allowedControlFeelProfileRefs: [
        GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF,
        GROUND_HUMANOID_CONTROL_FEEL_HEAVY_REF,
      ],
    })).toEqual([
      GROUND_HUMANOID_CONTROL_FEEL_HEAVY_REF,
      GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF,
    ]);
  });

  it("rejects a default that is not in the allowed set", () => {
    expect(() => selectableControlFeelProfileRefsV1({
      controlFeelProfileRef: GROUND_HUMANOID_CONTROL_FEEL_HEAVY_REF,
      allowedControlFeelProfileRefs: [GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF],
    })).toThrow(/SUBJECT_CONTROL_FEEL_DEFAULT_NOT_ALLOWED/);
  });

  it("rejects an empty or duplicate allowed set", () => {
    expect(() => selectableControlFeelProfileRefsV1({
      controlFeelProfileRef: GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF,
      allowedControlFeelProfileRefs: [],
    })).toThrow(/SUBJECT_CONTROL_FEEL_ALLOWED_REQUIRED/);
    expect(() => selectableControlFeelProfileRefsV1({
      controlFeelProfileRef: GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF,
      allowedControlFeelProfileRefs: [
        GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF,
        GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF,
      ],
    })).toThrow(/SUBJECT_CONTROL_FEEL_ALLOWED_DUPLICATE/);
  });

  it("does not treat the whole Control Feel catalog as G Bot's selectable set", () => {
    const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
      "worldkit://subject-definition/humanoid.g-bot@2",
    );
    if (definition === undefined || !("schemaVersion" in definition)) {
      throw new Error("Expected G Bot Subject Definition.");
    }
    const catalogFeelRefs = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "control-feel-profile" })
      .map((resource) => resource.resourceRef)
      .sort();
    const selectable = selectableControlFeelProfileRefsV1(definition.profiles);
    expect(catalogFeelRefs).toEqual([
      GROUND_HUMANOID_CONTROL_FEEL_HEAVY_REF,
      GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF,
      QUADRUPED_SPECIFIC_FEEL_REF,
    ].sort());
    expect(selectable).toEqual([
      GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF,
      GROUND_HUMANOID_CONTROL_FEEL_HEAVY_REF,
    ]);
    expect(selectable).not.toContain(QUADRUPED_SPECIFIC_FEEL_REF);
    expect(isSelectableControlFeelProfileRefV1(
      definition.profiles,
      GROUND_HUMANOID_CONTROL_FEEL_HEAVY_REF,
    )).toBe(true);
    expect(isSelectableControlFeelProfileRefV1(
      definition.profiles,
      QUADRUPED_SPECIFIC_FEEL_REF,
    )).toBe(false);
  });

  it("locks every allowed G Bot Control Feel into the ResourceLock closure", () => {
    const closure = resolveSubjectPresetClosureV1(
      builtInSubjectResourceRegistry,
      "worldkit://subject-definition/humanoid.g-bot@2",
    );
    const lockedFeelRefs = closure.entries
      .filter((entry) => entry.resourceKind === "control-feel-profile")
      .map((entry) => entry.resourceRef)
      .sort();
    expect(lockedFeelRefs).toEqual([
      GROUND_HUMANOID_CONTROL_FEEL_HEAVY_REF,
      GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF,
    ].sort());
    expect(lockedFeelRefs).not.toContain(QUADRUPED_SPECIFIC_FEEL_REF);
  });
});
