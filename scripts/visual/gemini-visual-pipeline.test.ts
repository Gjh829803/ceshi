import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Gemini prompt synthesis and direct parallel ImageGen", () => {
  it("ships a self-contained project-local visual pipeline", async () => {
    const scriptPath = path.resolve("scripts/visual/run-gemini-visual-pipeline.py");
    const source = await readFile(scriptPath, "utf8");
    const result = spawnSync(
      process.platform === "win32" ? "python" : "python3",
      [scriptPath, "--smoke"],
      {
      encoding: "utf8",
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      prompt_model: "gemini-3-flash-preview",
      image_model: "gemini-3.1-flash-image",
      parallel_imagegen: true,
    });
    expect(source).toContain("ThreadPoolExecutor");
    expect(source).toContain("visual-generation-prompts.json");
    expect(source).not.toContain("/Users/oricter/Desktop/code/Agent/leap_flow");
  });

  it("rejects ambient Gemini credentials and reads only project runtime config", () => {
    const scriptPath = path.resolve("scripts/visual/run-gemini-visual-pipeline.py");
    const result = spawnSync(
      process.platform === "win32" ? "python" : "python3",
      [scriptPath, "--runtime-config-smoke"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GOOGLE_APPLICATION_CREDENTIALS: "/tmp/external-google.json",
          GCLOUD_PROJECT_ID: "external-project",
          WORLDKIT_GEMINI_PROMPT_MODEL: "external-model",
        },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      project_id_present: true,
      credential_file: ".codex-tmp/runtime-config/google-service-account.json",
      project_local_only: true,
    });
    expect(JSON.parse(result.stdout).prompt_model).not.toBe("external-model");
  });
});
