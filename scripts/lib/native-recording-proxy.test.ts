import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { createNativeRecordingProxy } from "./native-recording-proxy.js";

it("streams only scoped requests and bytes without forwarding cookies, passwords or upstream cookies", async () => {
  const requests: { url: string; headers: Record<string, unknown>; body: string }[] = [];
  const studio = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ url: request.url!, headers: request.headers, body: Buffer.concat(chunks).toString() });
    response.writeHead(200, { "content-type": "video/webm", "set-cookie": "must-not-escape=1" }); response.end("original-output");
  });
  await new Promise<void>(resolve => studio.listen(0, "127.0.0.1", resolve));
  const shell = createServer(); await new Promise<void>(resolve => shell.listen(0, "127.0.0.1", resolve));
  const shellOrigin = `http://127.0.0.1:${(shell.address() as AddressInfo).port}`;
  const capability = "b".repeat(64);
  const middleware = createNativeRecordingProxy({ shellOrigin, binding: { sceneId: "palace", capability,
    worldPackageRootHash: `sha256:${"a".repeat(64)}`, studioOrigin: `http://127.0.0.1:${(studio.address() as AddressInfo).port}` } });
  shell.on("request", (req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  try {
    const response = await fetch(`${shellOrigin}/api/recording-worlds/palace/recordings`, { method: "POST",
      headers: { "content-type": "video/webm", "x-worldkit-recording-duration-ms": "5000", authorization: "Basic must-not-forward", cookie: "private=1", origin: shellOrigin }, body: "original-input" });
    expect(await response.text()).toBe("original-output");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(requests[0]).toMatchObject({ body: "original-input", headers: { "x-worldkit-native-recording-capability": capability } });
    expect(requests[0]!.headers.authorization).toBeUndefined(); expect(requests[0]!.headers.cookie).toBeUndefined();
    for (const path of ["/api/worlds", "/api/recording-worlds/another/recordings", "/api/worlds/palace/retry"]) {
      expect((await fetch(`${shellOrigin}${path}`)).status).toBe(404);
    }
    expect((await fetch(`${shellOrigin}/api/recording-worlds/palace/recordings`, { headers: { origin: "http://127.0.0.1:9999" } })).status).toBe(404);
    expect(requests).toHaveLength(1);
  } finally {
    await Promise.all([new Promise<void>(resolve => shell.close(() => resolve())), new Promise<void>(resolve => studio.close(() => resolve()))]);
  }
});
