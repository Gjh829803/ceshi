import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startWorldkitServer, type WorldkitServerHandle } from "./worldkit-server";

const INPUT_PATH = fileURLToPath(
  new URL("../../examples/authoring/rigged-subject-world.json", import.meta.url),
);
const handles: WorldkitServerHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).reverse().map((handle) => handle.stop()));
});

describe("startWorldkitServer", () => {
  it("proves readiness belongs to its nonce and reuses stop/exit promises", async () => {
    const handle = await startWorldkitServer({ inputPath: INPUT_PATH });
    handles.push(handle);
    const response = await fetch(
      new URL("/__worldkit/authoring-spec", handle.url),
      { method: "HEAD", cache: "no-store" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-worldkit-server-nonce")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
    expect(handle.waitForExit()).toBe(handle.waitForExit());
    const firstStop = handle.stop();
    expect(handle.stop()).toBe(firstStop);
    await firstStop;
    await expect(handle.waitForExit()).resolves.toSatisfy(
      (code) => code === null || code === 143,
    );
  }, 30_000);

  it("rejects an explicitly occupied port without stopping its owner", async () => {
    const owner = createServer();
    await new Promise<void>((resolve) => owner.listen(0, "127.0.0.1", resolve));
    try {
      const address = owner.address();
      if (address === null || typeof address === "string") {
        throw new Error("Test server did not receive a TCP port.");
      }
      await expect(startWorldkitServer({
        inputPath: INPUT_PATH,
        port: address.port,
        startupTimeoutMilliseconds: 1_000,
      })).rejects.toMatchObject({ code: "WORLDKIT_SERVER_PORT_UNAVAILABLE" });
      expect(owner.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => owner.close((error) => {
        if (error === undefined) resolve();
        else reject(error);
      }));
    }
  });

  it("lets a successful start and stop subprocess exit promptly", async () => {
    const source = `
      import { startWorldkitServer } from ${JSON.stringify(
        new URL("./worldkit-server.ts", import.meta.url).href,
      )};
      const handle = await startWorldkitServer({
        inputPath: ${JSON.stringify(INPUT_PATH)},
        startupTimeoutMilliseconds: 30000,
      });
      await handle.stop();
    `;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--eval", source],
      { cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: "ignore" },
    );
    const outcome = await new Promise<
      | { kind: "exit"; code: number | null }
      | { kind: "timeout" }
    >((resolve) => {
      const timer = setTimeout(() => resolve({ kind: "timeout" }), 3_000);
      child.once("exit", (code) => {
        clearTimeout(timer);
        resolve({ kind: "exit", code });
      });
    });
    if (outcome.kind === "timeout") {
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
    expect(outcome).toEqual({ kind: "exit", code: 0 });
  }, 10_000);

  it("settles cleanup when spawning the owned process emits error without exit", async () => {
    const realExecutablePath = process.execPath;
    try {
      process.execPath = path.join(
        fileURLToPath(new URL("../../", import.meta.url)),
        ".missing-node-executable",
      );
      const outcome = await Promise.race([
        startWorldkitServer({
          inputPath: INPUT_PATH,
          startupTimeoutMilliseconds: 1_000,
        }).then(
          () => ({ kind: "resolved" as const }),
          (error: unknown) => ({
            kind: "rejected" as const,
            code: (error as { code?: string }).code,
          }),
        ),
        new Promise<{ kind: "timeout" }>((resolve) =>
          setTimeout(() => resolve({ kind: "timeout" }), 1_500),
        ),
      ]);
      expect(outcome).toEqual({
        kind: "rejected",
        code: "WORLDKIT_SERVER_PROCESS_ERROR",
      });
    } finally {
      process.execPath = realExecutablePath;
    }
  }, 5_000);
});
