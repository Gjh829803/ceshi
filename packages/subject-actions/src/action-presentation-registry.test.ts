import { describe, expect, it } from "vitest";

import {
  hashRootMotionSourceV1,
  type RootMotionSourceBodyV1,
} from "@whitebox-world/character-movement";

import {
  ACTION_PRESENTATION_BINDING_CAPACITY_V1,
  ACTION_PRESENTATION_ROOT_SAMPLES_PER_SOURCE_CAPACITY_V1,
  ACTION_PRESENTATION_ROOT_SAMPLES_TOTAL_CAPACITY_V1,
  ACTION_PRESENTATION_ROOT_SOURCE_CAPACITY_V1,
  createActionPresentationRegistryV1,
  hashActionPresentationBindingV1,
  parseActionPresentationBindingV1,
  type ActionPresentationBindingBodyV1,
} from "./action-presentation-registry.js";

const ACTION_HASH = `sha256:${"1".repeat(64)}` as const;

const rootMotionBody = {
  schemaVersion: 1,
  resourceRef: "worldkit://root-motion/vault@1",
  fixedDeltaSeconds: 1 / 60,
  samples: [
    { translationDeltaMetersXYZ: [0, 0, 0.1], facingYawDeltaRadians: 0 },
    { translationDeltaMetersXYZ: [0, 0, 0.2], facingYawDeltaRadians: 0.05 },
    { translationDeltaMetersXYZ: [0, 0, 0.3], facingYawDeltaRadians: 0.1 },
  ],
} as const satisfies RootMotionSourceBodyV1;

const ROOT_HASH = hashRootMotionSourceV1(rootMotionBody);

const bindingBody = {
  kind: "action-presentation-binding",
  schemaVersion: 1,
  resourceRef: "worldkit://action-presentation/vault@1",
  presentationKey: "action.vault",
  semanticActionRef: "worldkit://semantic-action/vault@1",
  semanticActionHash: ACTION_HASH,
  isInterruptible: true,
  clip: {
    sourceClipName: "Vault",
    loopMode: "once",
    playbackSpeedRatio: 1,
    blendDurationTicks: 3,
  },
  rootMotion: {
    mode: "locked",
    rootMotionSourceRef: rootMotionBody.resourceRef,
    rootMotionSourceHash: ROOT_HASH,
    priority: 100,
  },
} as const satisfies ActionPresentationBindingBodyV1;

function lockedBinding(
  body: ActionPresentationBindingBodyV1 = bindingBody,
) {
  return { ...body, contentHash: hashActionPresentationBindingV1(body) };
}

function lockedRootMotion() {
  return { ...rootMotionBody, contentHash: ROOT_HASH };
}

describe("ActionPresentationBindingV1", () => {
  it("parses and deeply freezes a hash-locked semantic binding", () => {
    const parsed = parseActionPresentationBindingV1(lockedBinding());

    expect(parsed).toEqual(lockedBinding());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.clip)).toBe(true);
    expect(Object.isFrozen(parsed.rootMotion)).toBe(true);
  });

  it.each([
    ["extra top-level field", { ...lockedBinding(), extra: true }],
    ["extra Clip field", {
      ...lockedBinding(),
      clip: { ...bindingBody.clip, sourceClipName: "Vault", extra: true },
    }],
    ["non-finite playback", {
      ...lockedBinding(),
      clip: { ...bindingBody.clip, playbackSpeedRatio: Number.NaN },
    }],
    ["non-canonical semantic Ref", {
      ...lockedBinding(),
      semanticActionRef: "worldkit://semantic-action/Vault@1",
    }],
    ["non-canonical binding Ref", {
      ...lockedBinding(),
      resourceRef: "worldkit://action-presentation/vault@01",
    }],
    ["malformed hash", { ...lockedBinding(), semanticActionHash: "sha256:1" }],
    ["negative zero priority", {
      ...lockedBinding(),
      rootMotion: { ...bindingBody.rootMotion, priority: -0 },
    }],
    ["wrong content hash", {
      ...lockedBinding(),
      contentHash: `sha256:${"f".repeat(64)}`,
    }],
  ] as const)("rejects %s", (_label, input) => {
    expect(() => parseActionPresentationBindingV1(input)).toThrow();
  });

  it("rejects non-NFC Unicode before canonical hashing", () => {
    expect(() => hashActionPresentationBindingV1({
      ...bindingBody,
      clip: { ...bindingBody.clip, sourceClipName: "Va\u0061\u0301ult" },
    })).toThrow("3C_INPUT_INVALID");
  });
});

describe("ActionPresentationRegistryV1", () => {
  it("resolves both semantic lock and presentation key without consulting Clip names", () => {
    const registry = createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [lockedBinding()],
      rootMotionSources: [lockedRootMotion()],
    });

    expect(registry.resolveAction(bindingBody.semanticActionRef, ACTION_HASH))
      .toEqual(lockedBinding());
    expect(registry.resolvePresentation("action.vault")).toEqual(lockedBinding());
    expect(registry.resolveBinding(bindingBody.resourceRef, lockedBinding().contentHash))
      .toEqual(lockedBinding());
    expect(registry.resolveBinding(
      bindingBody.resourceRef,
      `sha256:${"2".repeat(64)}`,
    )).toBeUndefined();
    expect(registry.resolveAction(bindingBody.semanticActionRef, `sha256:${"2".repeat(64)}`))
      .toBeUndefined();
    expect(registry.resolveAction("worldkit://semantic-action/Vault@1", ACTION_HASH))
      .toBeUndefined();
    expect(registry.resolveAction("Vault", ACTION_HASH)).toBeUndefined();
  });

  it.each([
    ["duplicate binding Ref", [lockedBinding(), lockedBinding()]],
    ["ambiguous semantic Action", [
      lockedBinding(),
      lockedBinding({
        ...bindingBody,
        resourceRef: "worldkit://action-presentation/vault-alt@1",
        presentationKey: "action.vault-alt",
      }),
    ]],
    ["ambiguous presentation key", [
      lockedBinding(),
      lockedBinding({
        ...bindingBody,
        resourceRef: "worldkit://action-presentation/climb@1",
        semanticActionRef: "worldkit://semantic-action/climb@1",
      }),
    ]],
  ] as const)("rejects %s", (_label, bindings) => {
    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings,
      rootMotionSources: [lockedRootMotion()],
    })).toThrow("3C_INPUT_INVALID");
  });

  it("rejects a missing, wrong-hash, or duplicate locked Root Motion source", () => {
    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [lockedBinding()],
      rootMotionSources: [],
    })).toThrow("3C_LAYERED_MOVE_SOURCE_UNRESOLVED");

    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [lockedBinding()],
      rootMotionSources: [{
        ...lockedRootMotion(),
        contentHash: `sha256:${"f".repeat(64)}`,
      }],
    })).toThrow("3C_ROOT_MOTION_HASH_MISMATCH");

    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [lockedBinding()],
      rootMotionSources: [lockedRootMotion(), lockedRootMotion()],
    })).toThrow("3C_INPUT_INVALID");
  });

  it("rejects non-canonical registry data instead of coercing it", () => {
    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [lockedBinding()],
      rootMotionSources: [lockedRootMotion()],
      extra: true,
    } as never)).toThrow("3C_INPUT_INVALID");
  });

  it("fails before parsing collections that exceed the frozen registry capacities", () => {
    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: new Array(ACTION_PRESENTATION_BINDING_CAPACITY_V1 + 1).fill(
        lockedBinding(),
      ),
      rootMotionSources: [],
    })).toThrow("3C_INPUT_INVALID: Action presentation binding capacity exceeded");
    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [],
      rootMotionSources: new Array(
        ACTION_PRESENTATION_ROOT_SOURCE_CAPACITY_V1 + 1,
      ).fill(lockedRootMotion()),
    })).toThrow("3C_INPUT_INVALID: Root Motion source capacity exceeded");
  });

  it("rejects top-level capacity before enumerating hostile collection contents", () => {
    const hostileBindings = new Proxy(
      new Array(ACTION_PRESENTATION_BINDING_CAPACITY_V1 + 1),
      { ownKeys: () => { throw new Error("HOSTILE_BINDINGS_ENUMERATED"); } },
    );
    const hostileSources = new Proxy(
      new Array(ACTION_PRESENTATION_ROOT_SOURCE_CAPACITY_V1 + 1),
      { ownKeys: () => { throw new Error("HOSTILE_SOURCES_ENUMERATED"); } },
    );

    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: hostileBindings,
      rootMotionSources: [],
    })).toThrow("3C_INPUT_INVALID: Action presentation binding capacity exceeded");
    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [],
      rootMotionSources: hostileSources,
    })).toThrow("3C_INPUT_INVALID: Root Motion source capacity exceeded");

    const hostileLengthDescriptor = new Proxy([], {
      getOwnPropertyDescriptor: (_target, key) => {
        if (key === "length") throw new Error("HOSTILE_LENGTH_DESCRIPTOR");
        return undefined;
      },
    });
    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: hostileLengthDescriptor,
      rootMotionSources: [],
    })).toThrow("3C_INPUT_INVALID");

    let getterExecuted = false;
    const accessorLength = Object.create(Array.prototype) as object;
    Object.defineProperty(accessorLength, "length", {
      enumerable: false,
      get: () => {
        getterExecuted = true;
        return ACTION_PRESENTATION_BINDING_CAPACITY_V1 + 1;
      },
    });
    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: accessorLength,
      rootMotionSources: [],
    })).toThrow("3C_INPUT_INVALID");
    expect(getterExecuted).toBe(false);
  });

  it("rejects per-source and aggregate Root Motion sample budgets before deep parsing", () => {
    const hostileSamples = new Proxy(new Array(4_097), {
      ownKeys: () => { throw new Error("HOSTILE_SAMPLES_ENUMERATED"); },
    });
    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [],
      rootMotionSources: [{
        ...lockedRootMotion(),
        samples: hostileSamples,
      }],
    })).toThrow("3C_INPUT_INVALID: Root Motion samples-per-source capacity exceeded");

    const aggregateBody = {
      ...rootMotionBody,
      samples: new Array(65).fill(rootMotionBody.samples[0]),
    };
    const aggregateSource = {
      ...aggregateBody,
      contentHash: hashRootMotionSourceV1(aggregateBody),
    };
    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [],
      rootMotionSources: new Array(256).fill(aggregateSource),
    })).toThrow("3C_INPUT_INVALID: aggregate Root Motion sample capacity exceeded");
  });

  it("uses one samples snapshot so a stateful length descriptor cannot bypass per-source capacity", () => {
    const samples = new Array(
      ACTION_PRESENTATION_ROOT_SAMPLES_PER_SOURCE_CAPACITY_V1 + 1,
    ).fill(rootMotionBody.samples[0]);
    const body = { ...rootMotionBody, samples };
    let lengthReads = 0;
    const statefulSamples = new Proxy(samples, {
      getOwnPropertyDescriptor: (target, key) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (key === "length" && lengthReads++ === 0 && descriptor !== undefined) {
          return { ...descriptor, value: 1 };
        }
        return descriptor;
      },
    });

    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [],
      rootMotionSources: [{
        ...body,
        samples: statefulSamples,
        contentHash: hashRootMotionSourceV1(body),
      }],
    })).toThrow("3C_INPUT_INVALID");
    expect(lengthReads).toBe(1);
  });

  it("uses the same immutable snapshots for aggregate capacity and publication", () => {
    const counts = [4_096, 4_096, 4_096, 4_096, 2] as const;
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(
      ACTION_PRESENTATION_ROOT_SAMPLES_TOTAL_CAPACITY_V1 + 2,
    );
    const sources = counts.map((count, index) => {
      const samples = new Array(count).fill(rootMotionBody.samples[0]);
      const body = {
        ...rootMotionBody,
        resourceRef: `worldkit://root-motion/stateful-${index}@1`,
        samples,
      };
      let firstLengthRead = true;
      return {
        ...body,
        samples: new Proxy(samples, {
          getOwnPropertyDescriptor: (target, key) => {
            const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
            if (key === "length" && firstLengthRead && descriptor !== undefined) {
              firstLengthRead = false;
              return { ...descriptor, value: 1 };
            }
            return descriptor;
          },
        }),
        contentHash: hashRootMotionSourceV1(body),
      };
    });

    expect(() => createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [],
      rootMotionSources: sources,
    })).toThrow("3C_INPUT_INVALID");
  });

  it.each([
    ["playback speed", {
      ...bindingBody,
      clip: { ...bindingBody.clip, playbackSpeedRatio: 16.000_001 },
    }],
    ["blend duration", {
      ...bindingBody,
      clip: { ...bindingBody.clip, blendDurationTicks: 601 },
    }],
  ] as const)("rejects an excessive %s before binding hashing", (_label, body) => {
    expect(() => hashActionPresentationBindingV1(body)).toThrow("3C_INPUT_INVALID");
  });
});
