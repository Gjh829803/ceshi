import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

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
});
