import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  entryThirdPersonValidationResultCanonicalBytesV1,
  hashEntryThirdPersonValidationResultV1,
  parseEntryThirdPersonValidationResultV1,
  validateFormalOpeningEntryThirdPersonV1,
  validateEntryThirdPersonPngV1,
} from "./entry-third-person.js";

const validator = path.resolve("scripts/visual/entry-third-person.ts");
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(arguments_: readonly string[]) {
  return spawnSync(pnpmExecutable, ["exec", "tsx", validator, ...arguments_], {
    cwd: path.resolve("."),
    encoding: "utf8",
  });
}

function snapshotV4(controllerEntityId = "controller-primary"): any {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    view: {
      camera: {
        mode: "tracking",
        targetEntityId: "player",
        positionMetersXYZ: [0, 3, 5],
        viewYawOffsetRadians: 0,
      },
    },
    world: {
      gameplayInspection: {
        relationshipStatesById: {
          possession: {
            id: "possession",
            type: "possessedBy",
            schemaVersion: 1,
            controllerEntityId,
            controlledEntityId: "player",
            establishedSimulationTick: 0,
          },
        },
      },
      subjectStatesByEntityId: {
        player: {
          entityState: {
            positionMetersXYZ: [0, 0, 0],
            rotationQuaternionXYZW: [0, 0, 0, 1],
          },
        },
      },
    },
  };
}

function formalOpeningObservation(
  controllerEntityId = "controller-primary",
  subjectEntityId = "player",
): any {
  return {
    controlledSubjectProjection: {
      subjectEntityId,
      centerXBasisPoints: 5_000,
      centerYBasisPoints: 5_000,
      widthBasisPoints: 1_500,
      heightBasisPoints: 4_000,
      coverageBasisPoints: 600,
    },
    resetReadySnapshot: snapshotV4(controllerEntityId),
  };
}

function diagnosticCodes(result: {
  readonly diagnostics: readonly { readonly code: string }[];
}): string[] {
  return result.diagnostics.map(({ code }) => code);
}

async function pngWithSubject(
  left: number,
  right: number,
  width = 100,
): Promise<Uint8Array> {
  const height = 100;
  const pixels = new Uint8Array(width * height * 3).fill(255);
  for (let y = 25; y <= 90; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = 0xE8;
      pixels[offset + 1] = 0x5D;
      pixels[offset + 2] = 0x5D;
    }
  }
  return new Uint8Array(await sharp(pixels, {
    raw: { width, height, channels: 3 },
  }).png().toBuffer());
}

describe("strict centered rear-third-person entry gate", () => {
  let root: string;
  let centered: string;
  let offset: string;
  let snapshotPath: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "worldkit entry camera-"));
    centered = path.join(root, "centered.png");
    offset = path.join(root, "offset.png");
    snapshotPath = path.join(root, "runtime-snapshot.json");
    await Promise.all([
      writeFile(centered, await pngWithSubject(43, 56)),
      writeFile(offset, await pngWithSubject(14, 27)),
    ]);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("uses one TypeScript algorithm for centered-mask and Native formal-opening inputs", async () => {
    const centeredResult = await validateEntryThirdPersonPngV1({
      imageBytes: new Uint8Array(await readFile(centered)),
    });
    expect(centeredResult).toMatchObject({
      status: "passed",
      imageMeasurements: { subjectCenterXRatio: 0.5 },
    });

    const offsetResult = await validateEntryThirdPersonPngV1({
      imageBytes: new Uint8Array(await readFile(offset)),
    });
    expect(diagnosticCodes(offsetResult)).toContain("ENTRY_SUBJECT_NOT_CENTERED");

    const nativeBoundary = await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes: await pngWithSubject(96, 109, 200),
      openingObservation: formalOpeningObservation(
        "native-isolation-controller",
      ),
    });
    expect(nativeBoundary.status).toBe("passed");
    expect(nativeBoundary.imageMeasurements.subjectCenterXRatio).toBeCloseTo(
      0.515,
      12,
    );
    expect(nativeBoundary.imageMeasurements.subjectCenterErrorRatio).toBeCloseTo(
      0.015,
      12,
    );

    const nativeOutside = await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes: new Uint8Array(await readFile(offset)),
      openingObservation: formalOpeningObservation(
        "native-isolation-controller",
      ),
    });
    expect(diagnosticCodes(nativeOutside)).toEqual(["ENTRY_SUBJECT_NOT_CENTERED"]);
  });

  it("canonicalizes only the closed current entry-validation receipt", async () => {
    const result = await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes: await pngWithSubject(43, 56),
      openingObservation: formalOpeningObservation(),
    });
    const bytes = entryThirdPersonValidationResultCanonicalBytesV1(result);
    expect(parseEntryThirdPersonValidationResultV1(
      JSON.parse(new TextDecoder().decode(bytes)),
    )).toEqual(result);
    expect(hashEntryThirdPersonValidationResultV1(result))
      .toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => parseEntryThirdPersonValidationResultV1({
      ...result,
      legacyStatus: "accepted",
    })).toThrow("unknown or missing fields");
    expect(() => parseEntryThirdPersonValidationResultV1({
      ...result,
      imageMeasurements: {
        subjectCenterXRatio: 0.5,
        subjectCenterErrorRatio: 0,
        maximumCenterErrorRatio: 0.015,
      },
    })).toThrow("image measurements are invalid");
  });

  it("preserves the old target, yaw, and one-degree rear-alignment success boundary", async () => {
    const opening = formalOpeningObservation();
    const openingPngBytes = new Uint8Array(await readFile(centered));
    expect((await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes,
      openingObservation: opening,
    })).status).toBe("passed");

    const targetMismatch = structuredClone(opening as any);
    targetMismatch.resetReadySnapshot.view.camera.targetEntityId = "other";
    expect(diagnosticCodes(await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes,
      openingObservation: targetMismatch,
    })))
      .toContain("ENTRY_CAMERA_TARGET_MISMATCH");

    const yawBoundary = structuredClone(opening as any);
    yawBoundary.resetReadySnapshot.view.camera.viewYawOffsetRadians = 1e-6;
    expect((await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes,
      openingObservation: yawBoundary,
    })).status).toBe("passed");
    yawBoundary.resetReadySnapshot.view.camera.viewYawOffsetRadians = 1.000001e-6;
    expect(diagnosticCodes(await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes,
      openingObservation: yawBoundary,
    })))
      .toContain("ENTRY_CAMERA_YAW_OFFSET");

    const rearBoundary = structuredClone(opening as any);
    const halfBoundaryRadians = (0.5 * Math.PI) / 180;
    rearBoundary.resetReadySnapshot.world.subjectStatesByEntityId.player.entityState
      .rotationQuaternionXYZW = [
        0,
        Math.sin(halfBoundaryRadians),
        0,
        Math.cos(halfBoundaryRadians),
      ];
    expect((await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes,
      openingObservation: rearBoundary,
    })).status).toBe("passed");

    const diagonal = structuredClone(opening as any);
    const halfOutsideRadians = (0.50005 * Math.PI) / 180;
    diagonal.resetReadySnapshot.world.subjectStatesByEntityId.player.entityState
      .rotationQuaternionXYZW = [
        0,
        Math.sin(halfOutsideRadians),
        0,
        Math.cos(halfOutsideRadians),
      ];
    expect(diagnosticCodes(await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes,
      openingObservation: diagonal,
    })))
      .toContain("ENTRY_CAMERA_NOT_DIRECTLY_BEHIND");
  });

  it("fails closed for invalid runtime authority instead of adding quality vetoes", async () => {
    const invalid = snapshotV4();
    invalid.world.gameplayInspection.relationshipStatesById = {};
    const result = await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes: new Uint8Array(await readFile(centered)),
      openingObservation: {
        ...formalOpeningObservation(),
        resetReadySnapshot: invalid,
      },
    });
    expect(diagnosticCodes(result)).toEqual(["ENTRY_RUNTIME_CAMERA_INVALID"]);
    expect(diagnosticCodes(result)).not.toEqual(expect.arrayContaining([
      "ENTRY_SUBJECT_SCALE_INVALID",
      "ENTRY_CAMERA_RETRACTED",
      "ENTRY_CAMERA_FOV_DRIFT",
      "ENTRY_CAMERA_PITCH_DRIFT",
    ]));

    const mismatchedSubject = formalOpeningObservation(
      "native-isolation-controller",
      "other-subject",
    );
    expect(diagnosticCodes(await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes: new Uint8Array(await readFile(centered)),
      openingObservation: mismatchedSubject,
    }))).toEqual(["ENTRY_RUNTIME_CAMERA_INVALID"]);

    const multiplePossessions = formalOpeningObservation(
      "native-isolation-controller",
    );
    multiplePossessions.resetReadySnapshot.world.gameplayInspection
      .relationshipStatesById.otherPossession = {
        id: "otherPossession",
        type: "possessedBy",
        schemaVersion: 1,
        controllerEntityId: "other-controller",
        controlledEntityId: "other-subject",
        establishedSimulationTick: 0,
      };
    expect(diagnosticCodes(await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes: new Uint8Array(await readFile(centered)),
      openingObservation: multiplePossessions,
    }))).toEqual(["ENTRY_RUNTIME_CAMERA_INVALID"]);
  });

  it("persists the report through the exact current-only Canonical launcher", async () => {
    const launcher = await readFile(
      path.resolve("scripts/agents/run-canonical-world-agent.sh"),
      "utf8",
    );
    const invocation = launcher.match(
      /"\$pnpm_bin" exec tsx "\$project_root\/scripts\/visual\/entry-third-person\.ts" \\\r?\n\s+--image "\$artifact_root\/opening-frame\.png" \\\r?\n\s+--snapshot "\$artifact_root\/runtime-snapshot\.json" \\\r?\n\s+--output "\$artifact_root\/entry-third-person-validation\.json"/,
    )?.[0];
    expect(invocation).toBeDefined();
    expect(launcher).not.toContain("validate-entry-third-person.py");
    await expect(access(path.resolve("scripts/visual/validate-entry-third-person.py")))
      .rejects.toMatchObject({ code: "ENOENT" });

    await writeFile(snapshotPath, JSON.stringify(snapshotV4()));
    const outputPath = path.join(root, "entry-third-person-validation.json");
    const passed = run([
      "--image", centered,
      "--snapshot", snapshotPath,
      "--output", outputPath,
    ]);
    expect(passed.status, passed.stderr).toBe(0);
    const expected = {
      kind: "worldkit-entry-third-person-validation",
      schemaVersion: 1,
      status: "passed",
      runtimeMeasurements: {
        controlledEntityId: "player",
        cameraTargetEntityId: "player",
        cameraTargetsControlledSubject: true,
        rearAlignmentDegrees: 0,
        viewYawOffsetRadians: 0,
      },
    };
    expect(JSON.parse(passed.stdout)).toMatchObject(expected);
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject(expected);
  });
});
