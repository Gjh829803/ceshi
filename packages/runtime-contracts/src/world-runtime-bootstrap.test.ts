import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import worldRuntimeBootstrapSchema from "./world-runtime-bootstrap-v1.schema.json";
import { createWorldRuntimeBootstrapV1, hashWorldRuntimeBootstrapBodyV1,
  parseWorldRuntimeBootstrapV1, worldRuntimeBootstrapCanonicalBytesV1,
  type WorldRuntimeBootstrapBodyV1 } from "./world-runtime-bootstrap.js";
import { createWorldRuntimeBootstrapBodyFixtureV1 } from "./world-runtime-bootstrap.test-support.js";

const HASH_B = `sha256:${"b".repeat(64)}` as const;

function expectInvalid(input: unknown): void {
  expect(() => parseWorldRuntimeBootstrapV1(input)).toThrow(
    /WorldRuntimeBootstrapV1/,
  );
}

describe("WorldRuntimeBootstrapV1", () => {
  it("uses the Camera package as the sole CameraContextRuleV2 owner", () => {
    const source = readFileSync(
      new URL("./world-runtime-bootstrap.ts", import.meta.url),
      "utf8",
    );

    expect(source).toMatch(
      /import \{[\s\S]*type CameraContextRuleV2,[\s\S]*\} from "@whitebox-world\/camera";/,
    );
    expect(source).not.toMatch(
      /export interface RuntimeCameraContextRuleV[12]\s*\{/,
    );
  });

  it("requires one canonical jump variant policy in every runtime control feel", () => {
    const valid = createWorldRuntimeBootstrapV1(createWorldRuntimeBootstrapBodyFixtureV1());
    expect(valid.subjectRuntimeDescriptors[0]?.controlFeel.jumpVariantPolicy).toEqual({
      mode: "hold-height",
    });
    const descriptor = valid.subjectRuntimeDescriptors[0]!;
    const { jumpVariantPolicy: _removed, ...legacyControlFeel } = descriptor.controlFeel;
    expectInvalid({
      ...valid,
      subjectRuntimeDescriptors: [{
        ...descriptor,
        controlFeel: legacyControlFeel,
      }],
    });
  });

  it("keeps the Draft 2020-12 Schema and exact Parser aligned for serialized shape cases", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      worldRuntimeBootstrapSchema,
    );
    const valid = createWorldRuntimeBootstrapV1(createWorldRuntimeBootstrapBodyFixtureV1());
    const cases = [
      valid,
      { ...valid, terrain: {} },
      { ...valid, waters: [] },
      { ...valid, objects: [] },
      { ...valid, staticColliders: [] },
      { ...valid, layout: {} },
      { ...valid, traversal: {} },
      { ...valid, babylonScene: {} },
      { ...valid, havokWorld: {} },
      { ...valid, providerHandle: 1 },
      { ...valid, initialCamera: { ...valid.initialCamera, aspectRatio: 16 / 9 } },
      {
        ...valid,
        subjectRuntimeDescriptors: [{
          ...valid.subjectRuntimeDescriptors[0]!,
          spawnAnchorEntityId: "spawn-main",
        }],
      },
    ];
    for (const candidate of cases) {
      const schemaAccepted = validate(candidate);
      let parserAccepted = true;
      try {
        parseWorldRuntimeBootstrapV1(candidate);
      } catch {
        parserAccepted = false;
      }
      expect(parserAccepted, JSON.stringify(validate.errors)).toBe(schemaAccepted);
    }
  });

  it("keeps every serialized nested DTO closed in both Schema and Parser", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      worldRuntimeBootstrapSchema,
    );
    const paths: readonly (readonly (string | number)[])[] = [
      ["initialCamera"],
      ["subjectAssets", 0],
      ["subjectAssets", 0, "inventory"],
      ["rigProfiles", 0],
      ["animationSets", 0],
      ["animationSets", 0, "animationBindings", 0],
      ["colliderProfiles", 0],
      ["colliderProfiles", 0, "collider"],
      ["actionPresentationRegistry"],
      ["actionPresentationRegistry", "bindings", 0],
      ["actionPresentationRegistry", "bindings", 0, "clip"],
      ["actionPresentationRegistry", "bindings", 0, "rootMotion"],
      ["actionPresentationRegistry", "rootMotionSources", 0],
      ["actionPresentationRegistry", "rootMotionSources", 0, "samples", 0],
      ["subjectRuntimeDescriptors", 0],
      ["subjectRuntimeDescriptors", 0, "visualParts", 0],
      ["subjectRuntimeDescriptors", 0, "visualParts", 0, "localTransform"],
      ["subjectRuntimeDescriptors", 0, "visualParts", 0, "appearance"],
      ["subjectRuntimeDescriptors", 0, "visualBinding"],
      ["subjectRuntimeDescriptors", 0, "sockets", 0],
      ["subjectRuntimeDescriptors", 0, "sockets", 0, "localTransform"],
      ["subjectRuntimeDescriptors", 0, "sockets", 1],
      ["subjectRuntimeDescriptors", 0, "sockets", 1, "offsetTransform"],
      ["subjectRuntimeDescriptors", 0, "mountSlots", 0],
      ["subjectRuntimeDescriptors", 0, "collider"],
      ["subjectRuntimeDescriptors", 0, "locomotion"],
      ["subjectRuntimeDescriptors", 0, "controlFeel"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "defaultMotionProfile"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "motionKernels", 0],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "controlProfile"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "cameraContext"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "cameraContext", "rules", 0],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "cameraContext", "rules", 0, "when"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "cameraContext", "cameraRigProfiles", 0],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "cameraContext", "cameraModifierProfiles", 0],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "mediumProfile"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "mediumProfile", "air"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "relationshipProfiles", 0],
      ["runtimeResourceLockEntries", 0],
    ];

    for (const path of paths) {
      const candidate = structuredClone(
        createWorldRuntimeBootstrapV1(createWorldRuntimeBootstrapBodyFixtureV1()),
      ) as unknown as Record<string, unknown>;
      let target: unknown = candidate;
      for (const segment of path) {
        target = (target as Record<string | number, unknown>)[segment];
      }
      (target as Record<string, unknown>).unknownField = true;
      expect(validate(candidate), path.join(".")).toBe(false);
      expectInvalid(candidate);
    }
  });

  it("keeps signed zero as an exact-Parser invariant beyond JSON Schema equality", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      worldRuntimeBootstrapSchema,
    );
    const valid = createWorldRuntimeBootstrapV1(createWorldRuntimeBootstrapBodyFixtureV1());
    const candidate = {
      ...valid,
      gravityMetersPerSecondSquaredXYZ: [-0, -9.81, 0],
    };

    expect(validate(candidate)).toBe(true);
    expectInvalid(candidate);
  });

  it("creates canonical, detached, deeply frozen bytes and binds the body hash", () => {
    const source = createWorldRuntimeBootstrapBodyFixtureV1();
    const body = {
      ...source,
      runtimeResourceLockEntries: [...source.runtimeResourceLockEntries].reverse(),
    };
    const bootstrap = createWorldRuntimeBootstrapV1(body);

    expect(bootstrap.contentHash).toBe(hashWorldRuntimeBootstrapBodyV1(body));
    expect(bootstrap.runtimeResourceLockEntries.map(({ resourceKind }) => resourceKind))
      .toEqual(["gameplay-bootstrap", "subject-asset"]);
    expect(Object.isFrozen(bootstrap)).toBe(true);
    expect(Object.isFrozen(bootstrap.subjectRuntimeDescriptors[0]?.capabilityAssembly)).toBe(true);
    expect(new TextDecoder().decode(worldRuntimeBootstrapCanonicalBytesV1(bootstrap)))
      .toContain(bootstrap.contentHash);

    (body.gravityMetersPerSecondSquaredXYZ as unknown as number[])[1] = -1;
    expect(bootstrap.gravityMetersPerSecondSquaredXYZ[1]).toBe(-9.81);
  });

  it("rejects duplicate Subjects, absent controlled/Camera targets, and Gameplay lock mismatch", () => {
    const valid = createWorldRuntimeBootstrapV1(createWorldRuntimeBootstrapBodyFixtureV1());
    expectInvalid({
      ...valid,
      subjectRuntimeDescriptors: [
        valid.subjectRuntimeDescriptors[0],
        { ...valid.subjectRuntimeDescriptors[0], semanticClassId: "duplicate" },
      ],
    });
    expectInvalid({ ...valid, initialControlledEntityId: "missing" });
    expectInvalid({
      ...valid,
      initialCamera: { ...valid.initialCamera, targetEntityId: "missing" },
    });
    expect(() => createWorldRuntimeBootstrapV1({
      ...createWorldRuntimeBootstrapBodyFixtureV1(),
      gameplayBootstrapHash: HASH_B,
    })).toThrow(/WorldRuntimeBootstrapV1/);
    expect(() => createWorldRuntimeBootstrapV1({
      ...createWorldRuntimeBootstrapBodyFixtureV1(),
      gameplayBootstrapRef: "worldkit://gameplay-bootstrap/other@1",
    })).toThrow(/WorldRuntimeBootstrapV1/);
  });

  it("rejects the removed Camera relationship role condition alias", () => {
    const body = createWorldRuntimeBootstrapBodyFixtureV1();
    const rules = body.subjectRuntimeDescriptors[0]!.capabilityAssembly.cameraContext.rules;
    const candidate = {
      ...body,
      subjectRuntimeDescriptors: [{
        ...body.subjectRuntimeDescriptors[0]!,
        capabilityAssembly: {
          ...body.subjectRuntimeDescriptors[0]!.capabilityAssembly,
          cameraContext: {
            ...body.subjectRuntimeDescriptors[0]!.capabilityAssembly.cameraContext,
            rules: [{
              ...rules[0]!,
              when: { relationshipRoles: ["rider"] },
            }],
          },
        },
      }],
    };

    expect(() => createWorldRuntimeBootstrapV1(
      candidate as unknown as WorldRuntimeBootstrapBodyV1,
    )).toThrow(/WorldRuntimeBootstrapV1/);
  });

  it.each(["motionKernelRefs", "requiredMotionTags"] as const)(
    "rejects the removed Camera rule field %s",
    (fieldName) => {
      const body = createWorldRuntimeBootstrapBodyFixtureV1();
      const descriptor = body.subjectRuntimeDescriptors[0]!;
      const rule = descriptor.capabilityAssembly.cameraContext.rules[0]!;
      const candidate = {
        ...body,
        subjectRuntimeDescriptors: [{
          ...descriptor,
          capabilityAssembly: {
            ...descriptor.capabilityAssembly,
            cameraContext: {
              ...descriptor.capabilityAssembly.cameraContext,
              rules: [{
                ...rule,
                when: {
                  ...rule.when,
                  [fieldName]: ["legacy"],
                },
              }],
            },
          },
        }],
      };

      expect(() => createWorldRuntimeBootstrapV1(
        candidate as unknown as WorldRuntimeBootstrapBodyV1,
      )).toThrow(/WorldRuntimeBootstrapV1/);
    },
  );

  it.each([
    ["water medium", { movementMediums: ["water"] }],
    ["unknown mobility mode", { mobilityModes: ["flying"] }],
    ["duplicate gait", { gaits: ["walk", "walk"] }],
    ["non-canonical Action ref", { requiredActiveActionRefs: ["action.ride"] }],
    ["invalid Socket id", { requiredSocketIds: ["camera target"] }],
    ["invalid Camera tag", { requiredCameraContextTags: ["Aim Mode"] }],
    ["negative speed", { minimumSpeedMetersPerSecond: -1 }],
    ["incoherent speed bounds", {
      minimumSpeedMetersPerSecond: 4,
      maximumSpeedMetersPerSecond: 3,
    }],
    ["oversized condition array", {
      requiredCameraContextTags: Array.from(
        { length: 65 },
        (_, index) => `tag-${index}`,
      ),
    }],
  ])("rejects Camera V2 rule schema drift: %s", (_label, when) => {
    const body = createWorldRuntimeBootstrapBodyFixtureV1();
    const descriptor = body.subjectRuntimeDescriptors[0]!;
    const rule = descriptor.capabilityAssembly.cameraContext.rules[0]!;
    const candidate = {
      ...body,
      subjectRuntimeDescriptors: [{
        ...descriptor,
        capabilityAssembly: {
          ...descriptor.capabilityAssembly,
          cameraContext: {
            ...descriptor.capabilityAssembly.cameraContext,
            rules: [{ ...rule, when }],
          },
        },
      }],
    };

    expect(() => createWorldRuntimeBootstrapV1(
      candidate as unknown as WorldRuntimeBootstrapBodyV1,
    )).toThrow(/WorldRuntimeBootstrapV1/);
  });

  it("rejects stale hashes, noncanonical serialized order, nested unknown fields, and accessors", () => {
    const valid = createWorldRuntimeBootstrapV1(createWorldRuntimeBootstrapBodyFixtureV1());
    expectInvalid({ ...valid, id: "changed" });
    expectInvalid({
      ...valid,
      runtimeResourceLockEntries: [...valid.runtimeResourceLockEntries].reverse(),
    });
    expectInvalid({
      ...valid,
      subjectRuntimeDescriptors: [{
        ...valid.subjectRuntimeDescriptors[0]!,
        collider: {
          ...valid.subjectRuntimeDescriptors[0]!.collider,
          impostor: "havok",
        },
      }],
    });

    const getter = vi.fn(() => "player");
    const hostile = { ...valid } as Record<string, unknown>;
    Object.defineProperty(hostile, "initialControlledEntityId", {
      enumerable: true,
      get: getter,
    });
    expectInvalid(hostile);
    expect(getter).not.toHaveBeenCalled();
  });
});
