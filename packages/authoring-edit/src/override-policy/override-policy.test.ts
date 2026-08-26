import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1,
  FIRST_BATCH_OVERRIDE_RESOURCE_KIND_BY_PATH_V1,
  effectiveAllowedOverridePathsV1,
  validateDefinitionResourceRefOverrideV1,
} from "../index.js";

const FIRST_BATCH = [...FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1];
const FEEL_PATH = "profiles.controlFeelProfileRef";
const CONTROL_PATH = "profiles.controlProfileRef";
const MOTION_PATH = "profiles.motion.defaultMotionProfileRef";
const FEEL_REF = "worldkit://control-feel-profile/humanoid.heavy-ground@1";
const GROUND_CAPABILITY = "worldkit://capability/locomotion.ground@1";
const MEDIUM_REF = "worldkit://medium-profile/ground-air.standard@1";

function lockEntry(overrides: {
  readonly resourceRef?: string;
  readonly resourceKind?: string;
  readonly runtimeStatus?: "implemented" | "reserved";
  readonly requiredCapabilityRefs?: readonly string[];
  readonly supportedBodyTopologies?: readonly string[];
  readonly mediumProfileRef?: string;
}): Record<string, unknown> {
  return {
    resourceRef: overrides.resourceRef ?? FEEL_REF,
    resourceKind: overrides.resourceKind ?? "control-feel-profile",
    contentHash: sha256CanonicalJson({
      resourceRef: overrides.resourceRef ?? FEEL_REF,
    }),
    requiredCapabilityRefs: [...(overrides.requiredCapabilityRefs ?? [])],
    runtimeStatus: overrides.runtimeStatus ?? "implemented",
    ...(overrides.supportedBodyTopologies === undefined
      ? {}
      : { supportedBodyTopologies: [...overrides.supportedBodyTopologies] }),
    ...(overrides.mediumProfileRef === undefined
      ? {}
      : { mediumProfileRef: overrides.mediumProfileRef }),
  };
}

function owner(overrides: {
  readonly definitionKind?: string;
  readonly definitionRef?: string;
  readonly allowedOverridePaths?: readonly string[];
  readonly compatibleResourceRefsByPath?: Readonly<
    Record<string, readonly string[]>
  >;
  readonly bodyTopology?: string;
  readonly mediumProfileRef?: string;
} = {}): Record<string, unknown> {
  return {
    definitionKind: overrides.definitionKind ?? "subject-definition",
    definitionRef:
      overrides.definitionRef ??
      "worldkit://subject-definition/humanoid.g-bot@2",
    allowedOverridePaths: [...(overrides.allowedOverridePaths ?? FIRST_BATCH)],
    ...(overrides.compatibleResourceRefsByPath === undefined
      ? {}
      : { compatibleResourceRefsByPath: overrides.compatibleResourceRefsByPath }),
    ...(overrides.bodyTopology === undefined
      ? {}
      : { bodyTopology: overrides.bodyTopology }),
    ...(overrides.mediumProfileRef === undefined
      ? {}
      : { mediumProfileRef: overrides.mediumProfileRef }),
  };
}

function overrideRecord(overrides: {
  readonly path?: string;
  readonly resourceRef?: string;
} = {}): Record<string, unknown> {
  return {
    id: "override.feel.heavy",
    kind: "resource-ref",
    path: overrides.path ?? FEEL_PATH,
    resourceRef: overrides.resourceRef ?? FEEL_REF,
  };
}

function validate(
  overrides: {
    readonly definition?: Record<string, unknown>;
    readonly projectionAllowedOverridePaths?: readonly string[];
    readonly hostPolicyAllowedOverridePaths?: readonly string[];
    readonly override?: unknown;
    readonly registryLockEntries?: readonly unknown[];
    readonly allowedCapabilityRefs?: readonly string[];
  } = {},
) {
  return validateDefinitionResourceRefOverrideV1({
    definition: overrides.definition ?? owner(),
    projectionAllowedOverridePaths:
      overrides.projectionAllowedOverridePaths ?? FIRST_BATCH,
    hostPolicyAllowedOverridePaths:
      overrides.hostPolicyAllowedOverridePaths ?? FIRST_BATCH,
    override: overrides.override ?? overrideRecord(),
    registryLockEntries: overrides.registryLockEntries ?? [lockEntry({})],
    allowedCapabilityRefs: overrides.allowedCapabilityRefs ?? [GROUND_CAPABILITY],
  });
}

describe("P16-O1 definition override policy", () => {
  it("keeps first-batch paths aligned with the Resource Ref kind map", () => {
    expect(FIRST_BATCH).toEqual([
      FEEL_PATH,
      CONTROL_PATH,
      MOTION_PATH,
    ]);
    expect(Object.keys(FIRST_BATCH_OVERRIDE_RESOURCE_KIND_BY_PATH_V1)).toEqual(
      FIRST_BATCH,
    );
  });

  it("intersects Definition, Projection, and Host Policy without widening", () => {
    expect(
      effectiveAllowedOverridePathsV1(
        [FEEL_PATH],
        FIRST_BATCH,
        FIRST_BATCH,
      ),
    ).toEqual([FEEL_PATH]);
    expect(
      effectiveAllowedOverridePathsV1(
        FIRST_BATCH,
        [FEEL_PATH],
        FIRST_BATCH,
      ),
    ).toEqual([FEEL_PATH]);
    expect(
      effectiveAllowedOverridePathsV1(
        FIRST_BATCH,
        FIRST_BATCH,
        [MOTION_PATH],
      ),
    ).toEqual([MOTION_PATH]);
    expect(
      effectiveAllowedOverridePathsV1([], FIRST_BATCH, FIRST_BATCH),
    ).toEqual([]);
  });

  it("accepts a first-batch Resource Ref that is locked and compatible", () => {
    const result = validate({
      definition: owner({
        compatibleResourceRefsByPath: { [FEEL_PATH]: [FEEL_REF] },
        bodyTopology: "biped",
        mediumProfileRef: MEDIUM_REF,
      }),
      registryLockEntries: [
        lockEntry({
          requiredCapabilityRefs: [GROUND_CAPABILITY],
          supportedBodyTopologies: ["biped", "quadruped"],
          mediumProfileRef: MEDIUM_REF,
        }),
      ],
    });

    expect(result).toMatchObject({
      status: "accepted",
      override: overrideRecord(),
      effectiveAllowedOverridePaths: FIRST_BATCH,
    });
  });

  it("reuses the same validator for two Definition kinds", () => {
    const shared = {
      allowedOverridePaths: [FEEL_PATH],
      compatibleResourceRefsByPath: { [FEEL_PATH]: [FEEL_REF] },
      bodyTopology: "biped",
      mediumProfileRef: MEDIUM_REF,
    } as const;
    const lock = [
      lockEntry({
        requiredCapabilityRefs: [GROUND_CAPABILITY],
        supportedBodyTopologies: ["biped"],
        mediumProfileRef: MEDIUM_REF,
      }),
    ];
    const subject = validate({
      definition: owner({
        definitionKind: "subject-definition",
        definitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
        ...shared,
      }),
      projectionAllowedOverridePaths: FIRST_BATCH,
      hostPolicyAllowedOverridePaths: FIRST_BATCH,
      registryLockEntries: lock,
    });
    const custom = validate({
      definition: owner({
        definitionKind: "custom-definition",
        definitionRef: "package://custom-definition/probe@1",
        ...shared,
      }),
      projectionAllowedOverridePaths: FIRST_BATCH,
      hostPolicyAllowedOverridePaths: FIRST_BATCH,
      registryLockEntries: lock,
    });

    expect(subject.status).toBe("accepted");
    expect(custom.status).toBe("accepted");
    expect(subject).toEqual({
      ...custom,
      // definitionKind is not part of the accepted result
    });
  });

  it.each([
    { name: "Definition", definitionPaths: [FEEL_PATH], projection: FIRST_BATCH, host: FIRST_BATCH },
    { name: "Projection", definitionPaths: FIRST_BATCH, projection: [FEEL_PATH], host: FIRST_BATCH },
    { name: "Host Policy", definitionPaths: FIRST_BATCH, projection: FIRST_BATCH, host: [FEEL_PATH] },
  ])("rejects a path that $name did not open", ({ definitionPaths, projection, host }) => {
    const result = validate({
      definition: owner({ allowedOverridePaths: definitionPaths }),
      projectionAllowedOverridePaths: projection,
      hostPolicyAllowedOverridePaths: host,
      override: overrideRecord({ path: MOTION_PATH }),
    });

    expect(result).toMatchObject({
      status: "rejected",
      diagnostics: [
        expect.objectContaining({
          code: "DEFINITION_OVERRIDE_PATH_FORBIDDEN",
          instancePath: "/override/path",
        }),
      ],
    });
  });

  it.each([
    "id",
    "kind",
    "schemaVersion",
    "version",
    "resourceRef",
    "contentHash",
    "parameters.walkSpeedMetersPerSecond",
    "provider.babylonMesh",
    "collider.radiusMeters",
    "sockets.hand",
  ])("rejects first-batch-forbidden path %s", (path) => {
    const result = validate({
      override: overrideRecord({ path }),
    });

    expect(result.status).toBe("rejected");
    expect(result).toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: "DEFINITION_OVERRIDE_PATH_FORBIDDEN",
        }),
      ],
    });
  });

  it.each([
    "profiles[0].controlFeelProfileRef",
    "profiles.*.controlFeelProfileRef",
    "profiles.**",
    "/profiles/controlFeelProfileRef",
    "../profiles.controlFeelProfileRef",
  ])("rejects illegal path grammar %s", (path) => {
    const result = validate({
      override: overrideRecord({ path }),
    });

    expect(result).toMatchObject({
      status: "rejected",
      diagnostics: [
        expect.objectContaining({
          code: "DEFINITION_OVERRIDE_PATH_FORBIDDEN",
        }),
      ],
    });
  });

  it("rejects an unlocked Resource Ref", () => {
    const result = validate({
      registryLockEntries: [
        lockEntry({
          resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
        }),
      ],
    });

    expect(result).toMatchObject({
      status: "rejected",
      diagnostics: [
        expect.objectContaining({
          code: "DEFINITION_OVERRIDE_VALUE_INVALID",
          instancePath: "/override/resourceRef",
        }),
      ],
    });
  });

  it("rejects a reserved Resource Ref", () => {
    const result = validate({
      registryLockEntries: [lockEntry({ runtimeStatus: "reserved" })],
    });

    expect(result).toMatchObject({
      status: "rejected",
      diagnostics: [
        expect.objectContaining({
          code: "DEFINITION_OVERRIDE_VALUE_INVALID",
          instancePath: "/override/resourceRef",
        }),
      ],
    });
  });

  it("rejects a locked Ref whose kind does not match the path", () => {
    const result = validate({
      registryLockEntries: [
        lockEntry({ resourceKind: "control-profile" }),
      ],
    });

    expect(result).toMatchObject({
      status: "rejected",
      diagnostics: [
        expect.objectContaining({
          code: "DEFINITION_OVERRIDE_VALUE_INVALID",
          instancePath: "/override/resourceRef",
        }),
      ],
    });
  });

  it("rejects a Ref that requires a Capability outside the current set", () => {
    const result = validate({
      registryLockEntries: [
        lockEntry({ requiredCapabilityRefs: [GROUND_CAPABILITY] }),
      ],
      allowedCapabilityRefs: [],
    });

    expect(result).toMatchObject({
      status: "rejected",
      diagnostics: [
        expect.objectContaining({
          code: "DEFINITION_OVERRIDE_VALUE_INVALID",
          instancePath: "/override/resourceRef",
        }),
      ],
    });
  });

  it("rejects a Ref outside Definition-specific compatibility", () => {
    const result = validate({
      definition: owner({
        compatibleResourceRefsByPath: {
          [FEEL_PATH]: ["worldkit://control-feel-profile/humanoid.medium-ground@1"],
        },
      }),
    });

    expect(result).toMatchObject({
      status: "rejected",
      diagnostics: [
        expect.objectContaining({
          code: "DEFINITION_OVERRIDE_VALUE_INVALID",
          instancePath: "/override/resourceRef",
        }),
      ],
    });
  });

  it("rejects a Ref that does not support the Definition body topology", () => {
    const result = validate({
      definition: owner({ bodyTopology: "quadruped" }),
      registryLockEntries: [
        lockEntry({ supportedBodyTopologies: ["biped"] }),
      ],
    });

    expect(result).toMatchObject({
      status: "rejected",
      diagnostics: [
        expect.objectContaining({
          code: "DEFINITION_OVERRIDE_VALUE_INVALID",
          instancePath: "/override/resourceRef",
        }),
      ],
    });
  });

  it("rejects a Ref that does not match the Definition Medium", () => {
    const result = validate({
      definition: owner({ mediumProfileRef: MEDIUM_REF }),
      registryLockEntries: [
        lockEntry({
          mediumProfileRef: "worldkit://medium-profile/water-surface.standard@1",
        }),
      ],
    });

    expect(result).toMatchObject({
      status: "rejected",
      diagnostics: [
        expect.objectContaining({
          code: "DEFINITION_OVERRIDE_VALUE_INVALID",
          instancePath: "/override/resourceRef",
        }),
      ],
    });
  });
});
