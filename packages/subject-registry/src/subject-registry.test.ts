import { describe, expect, it } from "vitest";

import {
  builtInSubjectDefinitionRegistry,
  createSubjectDefinitionRegistry,
} from "./index";

describe("subject definition registry", () => {
  it("returns built-in definitions in stable ID and version order", () => {
    expect(builtInSubjectDefinitionRegistry.list().map((kit) => `${kit.id}@${kit.version}`)).toEqual([
      "humanoid.third-person@1",
      "quadruped.ground-proxy@1",
    ]);
  });

  it("resolves immutable automatic collider and locomotion profiles", () => {
    const definition = builtInSubjectDefinitionRegistry.resolve(
      "worldkit://kit/quadruped.ground-proxy@1",
    );

    expect(definition).toMatchObject({
      bodyTopology: "quadruped",
      collider: { kind: "capsule" },
      locomotion: { mode: "ground" },
    });
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition?.visualParts)).toBe(true);
    expect(Object.isFrozen(definition?.visualParts[0]?.primitive)).toBe(true);
  });

  it("returns undefined for an unregistered resource reference", () => {
    expect(
      builtInSubjectDefinitionRegistry.resolve("worldkit://kit/unknown@1"),
    ).toBeUndefined();
  });

  it("rejects duplicate resource references", () => {
    const definition = builtInSubjectDefinitionRegistry.list()[0];
    expect(definition).toBeDefined();
    expect(() => createSubjectDefinitionRegistry([definition!, definition!])).toThrowError(
      /SUBJECT_REGISTRY_DUPLICATE_REF/,
    );
  });
});
