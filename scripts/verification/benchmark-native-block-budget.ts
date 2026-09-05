import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer } from "vite";
import { launchChromiumWithSystemFallback } from "../lib/playwright-browser-launch.js";
import { sha256Bytes } from "@whitebox-world/protocol";
import { NATIVE_BLOCK_BUDGET_SAMPLE_COUNTS } from "./native-block-budget/workload.js";

const counts = process.argv.slice(2).length === 0 ? NATIVE_BLOCK_BUDGET_SAMPLE_COUNTS : process.argv.slice(2).map(Number);
assert.ok(counts.length > 0 && new Set(counts).size === counts.length && counts.every((n) =>
  NATIVE_BLOCK_BUDGET_SAMPLE_COUNTS.some((allowed) => n === allowed)));
const output = path.resolve(process.env.WORLDKIT_NATIVE_BUDGET_OUTPUT_DIRECTORY ??
  `output/playwright/native-block-budget-${Date.now()}`);

async function main() {
  await mkdir(output, { recursive: true });
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm");
  const server = await createServer({
    root: path.resolve("scripts/verification/native-block-budget"), logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false, fs: { allow: [process.cwd()] } },
    plugins: [{ name: "budget-fixture-assets", configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        if (request.url?.endsWith("HavokPhysics.wasm")) {
          response.setHeader("Content-Type", "application/wasm"); response.end(await readFile(wasmPath));
        } else if (request.url === "/budget-g-bot.glb") {
          response.setHeader("Content-Type", "model/gltf-binary");
          response.end(await readFile("apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb"));
        } else next();
      });
    } }],
  });
  let browser: Awaited<ReturnType<typeof launchChromiumWithSystemFallback>> | undefined;
  try {
    await server.listen();
    const url = server.resolvedUrls?.local[0]; assert.ok(url);
    browser = await launchChromiumWithSystemFallback();
    const common = { kind: "native-block-budget-measurement", schemaVersion: 1,
      scope: "synthetic-native-package-real-babylon-runtime-not-formal-case",
      host: { platform: os.platform(), architecture: os.arch(), cpu: os.cpus()[0]?.model, totalMemoryBytes: os.totalmem() },
      head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      trackedDiffHash: sha256Bytes(execFileSync("git", ["diff", "HEAD", "--", "."])),
      workloadHash: sha256Bytes(await readFile("scripts/verification/native-block-budget/workload.ts")),
      measurementSourceHashes: Object.fromEntries(await Promise.all([
        "scripts/verification/benchmark-native-block-budget.ts",
        "scripts/verification/native-block-budget/fixture.ts",
        "scripts/verification/native-block-budget/package-fixture.ts",
        "scripts/verification/native-block-budget/index.html",
        "pnpm-lock.yaml",
      ].map(async (file) => [file, sha256Bytes(await readFile(file))]))),
      browserVersion: browser.version(), counts,
    };
    for (const count of counts) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      process.stdout.write(`Measuring ${count} Blocks\n`);
      try {
        // Workload admission is intentionally synchronous CPU work; do not
        // mistake time spent inside it for a network-navigation timeout.
        await page.goto(`${url}?blocks=${count}`, { waitUntil: "commit", timeout: 30_000 });
        await page.waitForFunction(() => ["ready", "failed"].includes(window.__NATIVE_BUDGET_MEASUREMENT__?.status ?? ""), undefined, { timeout: 180_000 });
        const state = await page.evaluate(() => window.__NATIVE_BUDGET_MEASUREMENT__!);
        assert.equal(state.status, "ready", state.error);
        const session = await context.newCDPSession(page);
        await session.send("Performance.enable");
        const timing = await page.evaluate(() => window.__NATIVE_BUDGET_MEASUREMENT__!.measureFrames!());
        const metrics = await session.send("Performance.getMetrics");
        const pngPath = path.join(output, `${count}-opening.png`);
        await page.locator("canvas").screenshot({ path: pngPath });
        assert.deepEqual(errors, []);
        const report = { ...common, count, result: state.result, timing,
          browserMetrics: metrics.metrics, screenshotHash: sha256Bytes(await readFile(pngPath)) };
        await writeFile(path.join(output, `${count}.json`), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
        process.stdout.write(JSON.stringify({ count, result: state.result, output }) + "\n");
      } catch (error) {
        const state = await page.evaluate(() => window.__NATIVE_BUDGET_MEASUREMENT__).catch(() => undefined);
        await writeFile(path.join(output, `${count}-failed.json`), JSON.stringify({ ...common, count, state, errors,
          error: error instanceof Error ? error.stack : String(error) }, null, 2) + "\n", { flag: "wx" });
        throw error;
      } finally { await context.close(); }
    }
  } finally { await Promise.allSettled([browser?.close(), server.close()]); }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
