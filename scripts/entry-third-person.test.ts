import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const validator = path.resolve("scripts/validate-entry-third-person.py");
const pythonExecutable = process.platform === "win32" ? "python" : "python3";

function run(arguments_: readonly string[]) {
  return spawnSync(pythonExecutable, [validator, ...arguments_], {
    cwd: path.resolve("."),
    encoding: "utf8",
  });
}

function snapshotV4(): any {
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
        possessedByRelationshipsById: {
          possession: {
            controllerEntityId: "controller-primary",
            controlledEntityId: "player",
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

function diagnosticCodes(result: ReturnType<typeof run>): string[] {
  return JSON.parse(result.stdout).diagnostics.map(({ code }: { code: string }) => code);
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
    const imageFixture = spawnSync(pythonExecutable, ["-c", [
      "from PIL import Image, ImageDraw",
      "import sys",
      "for path, box in [(sys.argv[1], (43, 25, 56, 90)), (sys.argv[2], (14, 25, 27, 90))]:",
      " image=Image.new('RGB',(100,100),'white')",
      " ImageDraw.Draw(image).rectangle(box,fill='#E85D5D')",
      " image.save(path)",
    ].join("\n"), centered, offset], { encoding: "utf8" });
    expect(imageFixture.status, imageFixture.stderr).toBe(0);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("accepts a centered subject mask and rejects an offset mask", () => {
    const centeredResult = run(["--image", centered]);
    expect(centeredResult.status, centeredResult.stderr).toBe(0);
    expect(JSON.parse(centeredResult.stdout)).toMatchObject({
      status: "passed",
      imageMeasurements: { subjectCenterXRatio: 0.5 },
    });

    const offsetResult = run(["--image", offset]);
    expect(offsetResult.status).toBe(2);
    expect(diagnosticCodes(offsetResult)).toContain("ENTRY_SUBJECT_NOT_CENTERED");
  });

  it("accepts Snapshot V4 and detects target, yaw, and quaternion rear-alignment errors", async () => {
    const snapshot = snapshotV4();
    const outputPath = path.join(root, "entry-third-person-validation.json");
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    const passed = run([
      "--image", centered,
      "--snapshot", snapshotPath,
      "--output", outputPath,
    ]);
    expect(passed.status, passed.stderr).toBe(0);
    const expected = {
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

    snapshot.view.camera.targetEntityId = "other";
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    expect(diagnosticCodes(run(["--image", centered, "--snapshot", snapshotPath])))
      .toContain("ENTRY_CAMERA_TARGET_MISMATCH");

    snapshot.view.camera.targetEntityId = "player";
    snapshot.view.camera.viewYawOffsetRadians = 0.01;
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    expect(diagnosticCodes(run(["--image", centered, "--snapshot", snapshotPath])))
      .toContain("ENTRY_CAMERA_YAW_OFFSET");

    snapshot.view.camera.viewYawOffsetRadians = 0;
    snapshot.world.subjectStatesByEntityId.player.entityState
      .rotationQuaternionXYZW = [0, Math.sin(0.15), 0, Math.cos(0.15)];
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    expect(diagnosticCodes(run(["--image", centered, "--snapshot", snapshotPath])))
      .toContain("ENTRY_CAMERA_NOT_DIRECTLY_BEHIND");
  });

  it("persists the validation report through the exact main pipeline shell invocation", async () => {
    const launcher = await readFile(path.resolve("scripts/run-spatial-world-agent.sh"), "utf8");
    const invocation = launcher.match(
      /python3 "\$project_root\/scripts\/validate-entry-third-person\.py" \\\r?\n\s+--image "\$artifact_root\/opening-frame\.png" \\\r?\n\s+--snapshot "\$artifact_root\/runtime-snapshot\.json" \\\r?\n\s+--output "\$artifact_root\/entry-third-person-validation\.json"/,
    )?.[0];
    expect(invocation).toBeDefined();

    await copyFile(centered, path.join(root, "opening-frame.png"));
    await writeFile(snapshotPath, JSON.stringify(snapshotV4()));
    const shell = process.platform === "win32"
      ? run([
          "--image", path.join(root, "opening-frame.png"),
          "--snapshot", snapshotPath,
          "--output", path.join(root, "entry-third-person-validation.json"),
        ])
      : spawnSync("bash", ["-c", [
      "set -euo pipefail",
      invocation!,
    ].join("\n")], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        project_root: path.resolve("."),
        artifact_root: root,
      },
    });
    expect(shell.status, shell.stderr).toBe(0);
    expect(JSON.parse(await readFile(
      path.join(root, "entry-third-person-validation.json"),
      "utf8",
    ))).toMatchObject({
      kind: "worldkit-entry-third-person-validation",
      status: "passed",
      runtimeMeasurements: { controlledEntityId: "player" },
    });
  });

  it("rejects legacy, missing-possession, missing-state, and invalid-quaternion snapshots", async () => {
    const cases = [
      {
        snapshot: {
          controlledEntityId: "player",
          camera: { targetEntityId: "player", positionMetersXYZ: [0, 3, 5] },
          subjectStatesByEntityId: {},
        },
        message: "Snapshot V4",
      },
      {
        snapshot: (() => {
          const value = snapshotV4();
          value.world.gameplayInspection.possessedByRelationshipsById = {};
          return value;
        })(),
        message: "primary possession binding",
      },
      {
        snapshot: (() => {
          const value = snapshotV4();
          value.world.subjectStatesByEntityId = {};
          return value;
        })(),
        message: "controlled Subject state",
      },
      {
        snapshot: (() => {
          const value = snapshotV4();
          value.world.subjectStatesByEntityId.player.entityState
            .rotationQuaternionXYZW = [0, 0, 0, 0];
          return value;
        })(),
        message: "quaternion is degenerate",
      },
    ];

    for (const row of cases) {
      await writeFile(snapshotPath, JSON.stringify(row.snapshot));
      const result = run(["--image", centered, "--snapshot", snapshotPath]);
      expect(result.status).toBe(2);
      expect(JSON.parse(result.stdout)).toMatchObject({
        diagnostics: [expect.objectContaining({
          code: "ENTRY_RUNTIME_CAMERA_INVALID",
          message: expect.stringContaining(row.message),
        })],
      });
    }
  });
});
