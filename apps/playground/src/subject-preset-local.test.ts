import { describe, expect, it } from "vitest";

import type { NumericProfileOverrideV1 } from "@whitebox-world/runtime-contracts";

import {
  SUBJECT_PRESET_LOCAL_STORAGE_KEY,
  compareSubjectPresetSemanticContentV1,
  createSubjectPresetLocalRepository,
  hashSubjectPresetSemanticContentV1,
  parseSubjectPresetWorkingDraftV1,
  type SubjectPresetLocalBaselineV1,
  type SubjectPresetSemanticContentV1,
  type SubjectPresetStorageV1,
  type SubjectPresetWorkingDraftV1,
} from "./subject-preset-local";

class MemoryStorage implements SubjectPresetStorageV1 {
  readonly #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#entries.clear();
  }

  getItem(key: string): string | null {
    return this.#entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#entries.set(key, value);
  }
}

const SUBJECT_REF = "worldkit://subject-definition/vehicle.four-wheel.arcade@1";
const SUBJECT_HASH = `sha256:${"1".repeat(64)}`;
const MOTION_REF = "worldkit://motion-profile/wheeled-arcade.four-wheel@1";
const MOTION_HASH = `sha256:${"2".repeat(64)}`;
const CONTROL_FEEL_REF = "worldkit://control-feel-profile/humanoid.medium-ground@1";
const CONTROL_FEEL_HASH = `sha256:${"6".repeat(64)}`;
const CONTROL_REF = "worldkit://control-profile/throttle-steer.subject-local@1";
const CONTROL_HASH = `sha256:${"3".repeat(64)}`;
const ORBIT_REF = "worldkit://camera-profile/orbit.medium@1";
const ORBIT_HASH = `sha256:${"4".repeat(64)}`;
const CHASE_REF = "worldkit://camera-profile/chase.surface-fast@1";
const CHASE_HASH = `sha256:${"5".repeat(64)}`;

function override(
  baseResourceRef: string,
  baseContentHash: string,
  values: Readonly<Record<string, number>>,
): NumericProfileOverrideV1 {
  return { baseResourceRef, baseContentHash, values };
}

function fixtureDraft(
  overrides: Partial<SubjectPresetWorkingDraftV1> = {},
): SubjectPresetWorkingDraftV1 {
  return {
    kind: "worldkit-subject-preset-working-draft",
    schemaVersion: 1,
    draftId: "draft-vehicle",
    subjectDefinitionId: "vehicle.four-wheel.arcade",
    baseSubjectDefinitionRef: SUBJECT_REF,
    baseSubjectDefinitionContentHash: SUBJECT_HASH,
    selectedMotionProfileRef: MOTION_REF,
    selectedControlFeelProfileRef: CONTROL_FEEL_REF,
    selectedControlProfileRef: CONTROL_REF,
    selectedCameraPreferenceRef: ORBIT_REF,
    controlFeelOverridesByProfileRef: {
      [CONTROL_FEEL_REF]: override(CONTROL_FEEL_REF, CONTROL_FEEL_HASH, {
        turnRateRadiansPerSecond: 0.8,
      }),
    },
    controlOverridesByProfileRef: {
      [CONTROL_REF]: override(CONTROL_REF, CONTROL_HASH, {
        responseExponent: 1.5,
      }),
    },
    cameraOverridesByProfileRef: {
      [ORBIT_REF]: override(ORBIT_REF, ORBIT_HASH, { distanceMeters: 5 }),
      [CHASE_REF]: override(CHASE_REF, CHASE_HASH, { distanceMeters: 7 }),
    },
    createdAtIso: "2026-08-21T08:00:00.000Z",
    updatedAtIso: "2026-08-21T08:00:00.000Z",
    ...overrides,
  };
}

function fixtureBaseline(): SubjectPresetLocalBaselineV1 {
  return {
    subjectDefinitionId: "vehicle.four-wheel.arcade",
    subjectDefinitionRef: SUBJECT_REF,
    subjectDefinitionContentHash: SUBJECT_HASH,
    defaultMotionProfile: {
      resourceRef: MOTION_REF,
      contentHash: MOTION_HASH,
    },
    controlFeelProfile: {
      resourceRef: CONTROL_FEEL_REF,
      contentHash: CONTROL_FEEL_HASH,
    },
    controlProfile: {
      resourceRef: CONTROL_REF,
      contentHash: CONTROL_HASH,
    },
    cameraProfiles: [
      { resourceRef: ORBIT_REF, contentHash: ORBIT_HASH },
      { resourceRef: CHASE_REF, contentHash: CHASE_HASH },
    ],
    defaultCameraProfileRef: CHASE_REF,
  };
}

function createRepository(storage: SubjectPresetStorageV1 = new MemoryStorage()) {
  let id = 0;
  return createSubjectPresetLocalRepository(storage, {
    createId: (prefix) => `${prefix}-${++id}`,
    nowIso: () => "2026-08-21T09:00:00.000Z",
  });
}

describe("subject preset local repository", () => {
  it("round-trips named versions with independent exact camera profile overrides", () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage);

    const saved = repository.saveVersion(fixtureDraft(), {
      displayName: "Vehicle calm",
      notes: "baseline",
    });

    expect(saved.status).toBe("persisted");
    expect(saved.value.content.cameraOverridesByProfileRef).toEqual({
      [ORBIT_REF]: {
        baseResourceRef: ORBIT_REF,
        baseContentHash: ORBIT_HASH,
        values: { distanceMeters: 5 },
      },
      [CHASE_REF]: {
        baseResourceRef: CHASE_REF,
        baseContentHash: CHASE_HASH,
        values: { distanceMeters: 7 },
      },
    });
    const reloadedRepository = createRepository(storage);
    expect(reloadedRepository.getVersion(saved.value.localVersionId)).toEqual(saved.value);
    expect(reloadedRepository.listVersions("vehicle.four-wheel.arcade")).toEqual([saved.value]);
  });

  it("hashes semantic content independently from map insertion order and version metadata", () => {
    const repository = createRepository();
    const first = repository.saveVersion(fixtureDraft(), {
      displayName: "First name",
      notes: "first notes",
    }).value;
    const reorderedCameraOverrides = {
      [CHASE_REF]: override(CHASE_REF, CHASE_HASH, { distanceMeters: 7 }),
      [ORBIT_REF]: override(ORBIT_REF, ORBIT_HASH, { distanceMeters: 5 }),
    };
    const second = repository.saveVersion(
      fixtureDraft({
        draftId: "draft-reordered",
        cameraOverridesByProfileRef: reorderedCameraOverrides,
        createdAtIso: "2026-08-21T10:00:00.000Z",
        updatedAtIso: "2026-08-21T11:00:00.000Z",
      }),
      { displayName: "Renamed", notes: "different notes" },
    ).value;

    expect(second.contentHash).toBe(first.contentHash);
    expect(second.contentHash).toBe(hashSubjectPresetSemanticContentV1(second.content));
  });

  it("keeps a working draft in memory and reports when browser storage rejects the write", () => {
    class RejectingStorage extends MemoryStorage {
      override setItem(): void {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
    }
    const repository = createRepository(new RejectingStorage());

    const receipt = repository.saveWorkingDraft(fixtureDraft());

    expect(receipt).toMatchObject({
      status: "memory-only",
      diagnostic: { code: "SUBJECT_PRESET_STORAGE_UNAVAILABLE" },
    });
    expect(repository.getWorkingDraft(fixtureBaseline())).toEqual(receipt.value);
  });

  it("applies a local default only to the exact subject definition ref and hash", () => {
    const repository = createRepository();
    const saved = repository.saveVersion(fixtureDraft(), {
      displayName: "Public-feel candidate",
      notes: "",
    }).value;
    const pointerReceipt = repository.setLocalDefault({
      schemaVersion: 1,
      subjectDefinitionId: "vehicle.four-wheel.arcade",
      baseSubjectDefinitionRef: SUBJECT_REF,
      baseSubjectDefinitionContentHash: SUBJECT_HASH,
      localVersionId: saved.localVersionId,
    });

    expect(pointerReceipt.status).toBe("persisted");
    expect(repository.resolveLocalDefault(fixtureBaseline())).toEqual({
      status: "applicable",
      pointer: pointerReceipt.value,
      version: saved,
    });
    expect(repository.resolveLocalDefault({
      ...fixtureBaseline(),
      subjectDefinitionContentHash: `sha256:${"f".repeat(64)}`,
    })).toEqual({
      status: "baseline-mismatch",
      pointer: pointerReceipt.value,
    });
    expect(repository.getLocalDefault("vehicle.four-wheel.arcade")).toEqual(
      pointerReceipt.value,
    );
  });

  it("strictly rejects unknown fields, non-finite numbers and mismatched exact profile refs", () => {
    expect(() => parseSubjectPresetWorkingDraftV1({
      ...fixtureDraft(),
      unexpected: true,
    })).toThrow(/unexpected/);

    expect(() => parseSubjectPresetWorkingDraftV1(fixtureDraft({
      cameraOverridesByProfileRef: {
        [ORBIT_REF]: override(CHASE_REF, ORBIT_HASH, { distanceMeters: 5 }),
      },
    }))).toThrow(/exact map key/);

    expect(() => parseSubjectPresetWorkingDraftV1(fixtureDraft({
      controlFeelOverridesByProfileRef: {
        [CONTROL_FEEL_REF]: override(CONTROL_FEEL_REF, CONTROL_FEEL_HASH, {
          turnRateRadiansPerSecond: Number.NaN,
        }),
      },
    }))).toThrow(/must be finite/);
  });

  it("rejects a duplicated persisted version id without deleting the malformed bytes", () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage);
    repository.saveVersion(fixtureDraft(), { displayName: "One", notes: "" });
    const raw = storage.getItem(SUBJECT_PRESET_LOCAL_STORAGE_KEY)!;
    const parsed = JSON.parse(raw) as { versions: unknown[] };
    parsed.versions.push(structuredClone(parsed.versions[0]));
    const malformedRaw = JSON.stringify(parsed);
    storage.setItem(SUBJECT_PRESET_LOCAL_STORAGE_KEY, malformedRaw);

    const recovered = createRepository(storage);

    expect(recovered.listVersions("vehicle.four-wheel.arcade")).toEqual([]);
    expect(recovered.getDiagnostics()).toEqual([
      expect.objectContaining({ code: "SUBJECT_PRESET_LOCAL_STORAGE_INVALID" }),
    ]);
    expect(storage.getItem(SUBJECT_PRESET_LOCAL_STORAGE_KEY)).toBe(malformedRaw);
  });

  it("compares selections and inherited versus overridden numeric values deterministically", () => {
    const before = createRepository().saveVersion(fixtureDraft(), {
      displayName: "Before",
      notes: "",
    }).value.content;
    const after: SubjectPresetSemanticContentV1 = {
      ...structuredClone(before),
      selectedCameraPreferenceRef: CHASE_REF,
      controlFeelOverridesByProfileRef: {
        [CONTROL_FEEL_REF]: override(CONTROL_FEEL_REF, CONTROL_FEEL_HASH, {
          turnRateRadiansPerSecond: 0.6,
        }),
      },
      cameraOverridesByProfileRef: {
        [CHASE_REF]: override(CHASE_REF, CHASE_HASH, {
          distanceMeters: 7,
          lookAheadSeconds: 0,
        }),
      },
    };

    expect(compareSubjectPresetSemanticContentV1(before, after, {
      runtimeParameterNamesByProfileRef: {
        [CONTROL_FEEL_REF]: ["turnRateRadiansPerSecond"],
        [CHASE_REF]: ["distanceMeters"],
      },
    })).toEqual({
      baselineStatus: "same",
      isEqual: false,
      selectionChanges: [{
        field: "selectedCameraPreferenceRef",
        before: ORBIT_REF,
        after: CHASE_REF,
      }],
      parameterChanges: [
        {
          profileKind: "camera",
          profileRef: CHASE_REF,
          parameterName: "lookAheadSeconds",
          before: { source: "inherited" },
          after: { source: "override", value: 0 },
          runtimeSupport: "draft-only",
        },
        {
          profileKind: "camera",
          profileRef: ORBIT_REF,
          parameterName: "distanceMeters",
          before: { source: "override", value: 5 },
          after: { source: "inherited" },
          runtimeSupport: "unknown",
        },
        {
          profileKind: "control-feel",
          profileRef: CONTROL_FEEL_REF,
          parameterName: "turnRateRadiansPerSecond",
          before: { source: "override", value: 0.8 },
          after: { source: "override", value: 0.6 },
          runtimeSupport: "supported",
        },
      ],
    });
  });

  it("duplicates, renames, restores and deletes named versions without mutating semantic hashes", () => {
    const repository = createRepository();
    const original = repository.saveVersion(fixtureDraft(), {
      displayName: "Original",
      notes: "first",
    }).value;
    const renamed = repository.renameVersion(original.localVersionId, {
      displayName: "Official feel",
      notes: "reviewed",
    }).value;
    const duplicate = repository.duplicateVersion(original.localVersionId, {
      displayName: "Variant",
      notes: "copy",
    }).value;
    const restored = repository.restoreVersion(duplicate.localVersionId).value;
    repository.setLocalDefault({
      schemaVersion: 1,
      subjectDefinitionId: original.content.subjectDefinitionId,
      baseSubjectDefinitionRef: original.content.baseSubjectDefinitionRef,
      baseSubjectDefinitionContentHash: original.content.baseSubjectDefinitionContentHash,
      localVersionId: duplicate.localVersionId,
    });
    const deleted = repository.deleteVersion(duplicate.localVersionId);

    expect(renamed).toMatchObject({
      displayName: "Official feel",
      notes: "reviewed",
      contentHash: original.contentHash,
    });
    expect(duplicate.localVersionId).not.toBe(original.localVersionId);
    expect(duplicate.contentHash).toBe(original.contentHash);
    expect(restored).toMatchObject({
      kind: "worldkit-subject-preset-working-draft",
      subjectDefinitionId: original.content.subjectDefinitionId,
    });
    expect("sourceDraftId" in restored).toBe(false);
    expect(restored.draftId).not.toBe(original.sourceDraftId);
    expect(repository.getWorkingDraft(fixtureBaseline())).toEqual(restored);
    expect(deleted.value).toEqual({
      deletedLocalVersionId: duplicate.localVersionId,
      clearedLocalDefault: true,
    });
    expect(repository.getVersion(duplicate.localVersionId)).toBeUndefined();
    expect(repository.getLocalDefault("vehicle.four-wheel.arcade")).toBeUndefined();
  });

  it("reads only the current repository envelope and ignores unrelated browser storage", () => {
    class ReadTrackingStorage extends MemoryStorage {
      readonly readKeys: string[] = [];

      override getItem(key: string): string | null {
        this.readKeys.push(key);
        return super.getItem(key);
      }
    }
    const storage = new ReadTrackingStorage();
    storage.setItem("worldkit.subject-preset-migration.v1", "{broken-json");
    storage.setItem("worldkit.camera-preference", "first-person");

    const repository = createRepository(storage);

    expect(storage.readKeys).toEqual([SUBJECT_PRESET_LOCAL_STORAGE_KEY]);
    expect(repository.listVersions("vehicle.four-wheel.arcade")).toEqual([]);
    expect(repository.getDiagnostics()).toEqual([]);
  });
});
