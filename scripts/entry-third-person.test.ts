import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const validator = path.resolve("scripts/validate-entry-third-person.py");

function run(arguments_: readonly string[]) {
  return spawnSync("python3", [validator, ...arguments_], {
    cwd: path.resolve("."),
    encoding: "utf8",
  });
}

describe("strict centered rear-third-person entry gate", () => {
  it("accepts a centered subject mask and rejects offset or diagonal entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-entry-camera-"));
    try {
      const centered = path.join(root, "centered.png");
      const offset = path.join(root, "offset.png");
      const imageFixture = spawnSync("python3", ["-c", [
        "from PIL import Image, ImageDraw",
        "import sys",
        "for path, box in [(sys.argv[1], (43, 25, 56, 90)), (sys.argv[2], (14, 25, 27, 90))]:",
        " image=Image.new('RGB',(100,100),'white')",
        " ImageDraw.Draw(image).rectangle(box,fill='#E85D5D')",
        " image.save(path)",
      ].join("\n"), centered, offset], { encoding: "utf8" });
      expect(imageFixture.status, imageFixture.stderr).toBe(0);

      const centeredResult = run(["--image", centered]);
      expect(centeredResult.status, centeredResult.stderr).toBe(0);
      expect(JSON.parse(centeredResult.stdout)).toMatchObject({
        status: "passed",
        imageMeasurements: { subjectCenterXRatio: 0.5 },
      });

      const offsetResult = run(["--image", offset]);
      expect(offsetResult.status).toBe(2);
      expect(JSON.parse(offsetResult.stdout).diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "ENTRY_SUBJECT_NOT_CENTERED" })]),
      );

      const snapshotPath = path.join(root, "runtime-snapshot.json");
      await writeFile(snapshotPath, JSON.stringify({
        controlledEntityId: "player",
        camera: {
          targetEntityId: "player",
          positionMetersXYZ: [0, 3, 5],
          viewYawOffsetRadians: 0,
        },
        subjectStatesByEntityId: {
          player: {
            positionMetersXYZ: [0, 0, 0],
            forwardXYZ: [0.3, 0, -0.9539392014],
          },
        },
      }));
      const diagonalResult = run(["--image", centered, "--snapshot", snapshotPath]);
      expect(diagonalResult.status).toBe(2);
      expect(JSON.parse(diagonalResult.stdout).diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "ENTRY_CAMERA_NOT_DIRECTLY_BEHIND" })]),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
