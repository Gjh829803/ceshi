import { createServer } from "node:http";
import { once } from "node:events";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { formalCaptureRequestFixtureV1 } from "@whitebox-world/runtime-babylon/testing";
import { startCaptureOnlyHostedTransportV1 } from "../reconstruction/hosted-session-capture.js";
import { launchChromiumWithSystemFallback } from "../lib/playwright-browser-launch.js";

// Real Browser/transport startup regression, synthetic server only. This is NOT
// a generation, Havok, WorldPackage admission, rendered-quality, or Case receipt.
const request = formalCaptureRequestFixtureV1();
let mode: "progress" | "stall" | "error" = "progress";
const runtime = createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end(`<script>
    window.__WORLDKIT_FORMAL_CAPTURE_STARTUP__={phase:'loading',stage:'package',revision:0};
    ${mode === "progress" ? `
      let revision=0;
      const stages=['module','admission','runtime-engine','runtime-scene','runtime-havok','runtime-subjects','bridge'];
      const timer=setInterval(()=>{
        window.__WORLDKIT_FORMAL_CAPTURE_STARTUP__={phase:'loading',stage:stages[revision],revision:++revision};
        if(revision===7){clearInterval(timer); parent.postMessage('ready','*');}
      },5000);
    ` : mode === "error" ? "window.__WORLDKIT_FORMAL_CAPTURE_STARTUP__.phase='error';" : ""}
  </script>`);
});
runtime.listen(0, "127.0.0.1"); await once(runtime, "listening");
const runtimeAddress = runtime.address();
assert(runtimeAddress && typeof runtimeAddress !== "string");
const runtimeOrigin = `http://127.0.0.1:${runtimeAddress.port}`;
const shell = createServer((incoming, response) => {
  const url = new URL(incoming.url!, "http://127.0.0.1");
  url.searchParams.delete("hosted-formal-capture"); url.searchParams.set("hosted-formal-capture-frame", "1");
  response.setHeader("Content-Type", "text/html");
  response.end(`<script>
    let phase='bootstrapping';
    window.__WORLDKIT_HOSTED_FORMAL_CAPTURE__={phase:()=>phase};
    addEventListener('message',event=>{if(event.origin===${JSON.stringify(runtimeOrigin)} && event.data==='ready') phase='ready';});
  </script><iframe src="${runtimeOrigin}/${url.search}"></iframe>`);
});
shell.listen(0, "127.0.0.1"); await once(shell, "listening");
const shellAddress = shell.address(); assert(shellAddress && typeof shellAddress !== "string");
const browser = await launchChromiumWithSystemFallback();
const results: unknown[] = [];
try {
  for (mode of ["progress", "stall", "error"] as const) {
    const started = performance.now();
    const starting = startCaptureOnlyHostedTransportV1({ packageDirectoryPath: "/synthetic-capture-startup-fixture",
      request, readyTimeoutMilliseconds: 60_000,
      startupStallTimeoutMilliseconds: mode === "progress" ? 45_000 : 1500,
    }, {
      randomUUID, resolveSdkOwnerIdentities: async () => [],
      startServer: async () => ({ url: `http://127.0.0.1:${shellAddress.port}`, port: shellAddress.port,
        sceneSourceKind: "babylon-native-scene", worldPackageRootHash: request.worldPackageRootHash,
        waitForExit: () => new Promise(() => undefined), stop: async () => {} }),
      // One shared owned Browser across scenarios; each transport owns/closes its
      // context and page. The harness closes the Browser in its finalizer.
      launchBrowser: async () => new Proxy(browser, { get(target, key) {
        if (key === "close") return async () => {};
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } }),
    });
    if (mode === "progress") {
      const transport = await starting;
      const elapsedMilliseconds = Math.round(performance.now() - started);
      assert(elapsedMilliseconds > 30_000, "fixture must exceed removed 30s fixed startup timeout");
      assert.deepEqual(await transport.dispose(), { hostedBrowserSession: "completed", viteServer: "completed" });
      results.push({ mode, outcome: "ready", elapsedMilliseconds });
    } else {
      await assert.rejects(starting, mode === "stall" ? /STARTUP_STALLED/ : /STARTUP_FAILED/);
      results.push({ mode, outcome: "expected-failure", elapsedMilliseconds: Math.round(performance.now() - started) });
    }
    assert.equal(browser.contexts().length, 0, "startup must clean each owned context");
  }
  process.stdout.write(JSON.stringify({ kind: "capture-startup-browser-regression", results }) + "\n");
} finally {
  await browser.close();
  await Promise.all([new Promise<void>((resolve) => shell.close(() => resolve())), new Promise<void>((resolve) => runtime.close(() => resolve()))]);
}
