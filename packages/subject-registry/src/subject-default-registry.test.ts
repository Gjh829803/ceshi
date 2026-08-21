import { describe, expect, it } from "vitest";

import defaultCatalog from "../../../assets/registry/subject-defaults/catalog.json";

import {
  builtInSubjectDefaultRegistry,
  builtInSubjectResourceRegistry,
  createSubjectDefaultRegistryV1,
} from "./index";

const VEHICLE_DEFINITION_REF =
  "worldkit://subject-definition/vehicle.four-wheel.arcade@1";

function validVehicleDefault() {
  const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
    VEHICLE_DEFINITION_REF,
  );
  if (definition === undefined) throw new Error("Fixture definition is missing.");
  return {
    subjectDefinitionId: definition.id,
    subjectDefinitionRef: definition.resourceRef,
    subjectDefinitionContentHash: definition.contentHash,
  };
}

describe("subject public-default registry", () => {
  it("loads all six exact built-in defaults in canonical id order", () => {
    const defaults = builtInSubjectDefaultRegistry.listPublicDefaults();

    expect(defaults).toHaveLength(6);
    expect(defaults.map((entry) => entry.subjectDefinitionId)).toEqual([
      "animal.quadruped.forward-steer",
      "glider.paraglider.unpowered",
      "humanoid.g-bot",
      "surface-craft.ice-skimmer",
      "vehicle.four-wheel.arcade",
      "watercraft.kayak.surface",
    ]);
    expect(
      builtInSubjectDefaultRegistry.resolvePublicDefault(
        "vehicle.four-wheel.arcade",
      ),
    ).toEqual(validVehicleDefault());
    expect(builtInSubjectDefaultRegistry.resolvePublicDefault("missing.subject"))
      .toBeUndefined();
    expect(Object.isFrozen(defaults)).toBe(true);
    expect(defaults.every(Object.isFrozen)).toBe(true);
  });

  it("publishes the P1.5 quadruped default with Motion and Control Feel authority separated", () => {
    const entry = builtInSubjectDefaultRegistry.resolvePublicDefault(
      "animal.quadruped.forward-steer",
    );
    expect(entry?.subjectDefinitionRef).toBe(
      "worldkit://subject-definition/animal.quadruped.forward-steer@2",
    );
    const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
      entry!.subjectDefinitionRef,
    );
    expect(definition && "schemaVersion" in definition && definition.profiles.motion)
      .toBeTruthy();
    if (definition === undefined || !("schemaVersion" in definition)) return;
    const motion = builtInSubjectResourceRegistry.resolveMotionProfile(
      definition.profiles.motion.defaultMotionProfileRef,
    );
    const controlFeel = builtInSubjectResourceRegistry.resolveControlFeelProfile(
      definition.profiles.controlFeelProfileRef,
    );
    expect(motion).not.toHaveProperty("parameters");
    expect(controlFeel).toMatchObject({
      turnRateRadiansPerSecond: 2.4,
      jumpSpeedMetersPerSecond: 3.1,
    });
  });

  it.each([
    {
      label: "definition id",
      entry: { ...validVehicleDefault(), subjectDefinitionId: "wrong-id" },
    },
    {
      label: "content hash",
      entry: {
        ...validVehicleDefault(),
        subjectDefinitionContentHash: `sha256:${"0".repeat(64)}`,
      },
    },
  ])("rejects a default whose exact $label does not match", ({ entry }) => {
    expect(() => createSubjectDefaultRegistryV1({
      schemaVersion: 1,
      defaults: [entry],
    }, builtInSubjectResourceRegistry)).toThrow("SUBJECT_DEFAULT_ENTRY_INVALID");
  });

  it("rejects unknown catalog and entry fields", () => {
    expect(() => createSubjectDefaultRegistryV1({
      schemaVersion: 1,
      defaults: [validVehicleDefault()],
      unexpected: true,
    }, builtInSubjectResourceRegistry)).toThrow("SUBJECT_DEFAULT_CATALOG_UNKNOWN_FIELD");

    expect(() => createSubjectDefaultRegistryV1({
      schemaVersion: 1,
      defaults: [{ ...validVehicleDefault(), unexpected: true }],
    }, builtInSubjectResourceRegistry)).toThrow("SUBJECT_DEFAULT_ENTRY_UNKNOWN_FIELD");
  });

  it("rejects unsorted or duplicate subject ids", () => {
    const vehicle = validVehicleDefault();
    const humanoid = builtInSubjectResourceRegistry.resolveSubjectDefinition(
      "worldkit://subject-definition/humanoid.g-bot@1",
    );
    if (humanoid === undefined) throw new Error("Fixture definition is missing.");
    const humanoidEntry = {
      subjectDefinitionId: humanoid.id,
      subjectDefinitionRef: humanoid.resourceRef,
      subjectDefinitionContentHash: humanoid.contentHash,
    };

    expect(() => createSubjectDefaultRegistryV1({
      schemaVersion: 1,
      defaults: [vehicle, humanoidEntry],
    }, builtInSubjectResourceRegistry)).toThrow("SUBJECT_DEFAULT_CATALOG_NOT_SORTED");
    expect(() => createSubjectDefaultRegistryV1({
      schemaVersion: 1,
      defaults: [vehicle, vehicle],
    }, builtInSubjectResourceRegistry)).toThrow("SUBJECT_DEFAULT_CATALOG_DUPLICATE_ID");
  });

  it("constructs the built-in registry from the checked-in catalog", () => {
    expect(() => createSubjectDefaultRegistryV1(
      defaultCatalog,
      builtInSubjectResourceRegistry,
    )).not.toThrow();
  });
});
