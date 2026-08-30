import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { startStudioPublicServer } from "./public-server.mjs";

const studioSourceRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(studioSourceRoot, "../../..");

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function waitForJson(filePath, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for ${filePath}.`);
}

async function availablePorts(count) {
  const servers = Array.from({ length: count }, () => createServer());
  try {
    await Promise.all(servers.map((server) => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    })));
    return servers.map((server) => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      return address.port;
    });
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
}

function waitForOutput(stream, child, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => finish(new Error(`Timed out waiting for output matching ${pattern}.`)), timeoutMs);
    const onData = (chunk) => {
      output += chunk.toString("utf8");
      const match = pattern.exec(output);
      if (match) finish(null, match);
    };
    const onExit = (code, signal) => finish(
      new Error(`Process exited before expected output (code ${code}, signal ${signal}).`),
    );
    const finish = (error, match) => {
      clearTimeout(timer);
      stream.off("data", onData);
      child.off("exit", onExit);
      if (error) reject(error);
      else resolve(match);
    };
    stream.on("data", onData);
    child.once("exit", onExit);
  });
}

function authorization(accessKey) {
  return `Basic ${Buffer.from(`worldkit:${accessKey}`).toString("base64")}`;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForProcessExit(pid, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (isProcessAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return !isProcessAlive(pid);
}

async function forceKillProcessGroup(pid) {
  if (!pid || !isProcessAlive(pid)) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  const deadline = Date.now() + 1_000;
  while (isProcessAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const healthyStudioProgram = [
  "const { writeFileSync } = require('node:fs');",
  "const { createServer } = require('node:http');",
  "const nonce = process.env.WORLDKIT_STUDIO_READINESS_NONCE;",
  "const recordPath = process.env.TEST_CHILD_RECORD_PATH;",
  "const record = {",
  "  pid: process.pid,",
  "  accessKey: process.env.WORLDKIT_ACCESS_KEY ?? null,",
  "  publicVariables: Object.keys(process.env).filter((name) => name.startsWith('WORLDKIT_PUBLIC_')).sort(),",
  "  readinessNonceLength: nonce?.length ?? 0,",
  "  readinessNonceEqualsAccessKey: nonce === process.env.WORLDKIT_ACCESS_KEY,",
  "  authorization: 'not-requested',",
  "};",
  "const persist = () => writeFileSync(recordPath, JSON.stringify(record));",
  "const server = createServer((request, response) => {",
  "  if (request.url === '/__worldkit/studio-ready') {",
  "    if (request.headers['x-worldkit-readiness-nonce'] !== nonce) { response.writeHead(404); response.end(); return; }",
  "    response.writeHead(200, { 'content-type': 'application/json' });",
  "    response.end(JSON.stringify({ status: 'ready', nonce, pid: process.pid }));",
  "    return;",
  "  }",
  "  if (request.url === '/api/health') {",
  "    record.authorization = request.headers.authorization ?? null;",
  "    persist();",
  "    response.writeHead(200, { 'content-type': 'application/json' });",
  "    response.end(JSON.stringify({ ok: true, pid: process.pid }));",
  "    return;",
  "  }",
  "  response.writeHead(404); response.end();",
  "});",
  "server.listen(Number(process.env.WORLDKIT_STUDIO_PORT), '127.0.0.1', persist);",
  "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
].join("\n");

function readinessFixtureProgram(mode) {
  return [
    "const { writeFileSync } = require('node:fs');",
    "const { createServer } = require('node:http');",
    `const mode = ${JSON.stringify(mode)};`,
    "const nonce = process.env.WORLDKIT_STUDIO_READINESS_NONCE;",
    "const recordPath = process.env.TEST_CHILD_RECORD_PATH;",
    "writeFileSync(recordPath, JSON.stringify({ pid: process.pid }));",
    "if (mode === 'early-exit') process.exit(23);",
    "const server = createServer((request, response) => {",
    "  if (request.url !== '/__worldkit/studio-ready' || mode === 'timeout') { response.writeHead(404); response.end(); return; }",
    "  const responseNonce = mode === 'wrong-nonce' ? 'f'.repeat(64) : nonce;",
    "  response.writeHead(200, { 'content-type': 'application/json' });",
    "  response.end(JSON.stringify({ status: 'ready', nonce: responseNonce, pid: process.pid }));",
    "});",
    "server.listen(Number(process.env.WORLDKIT_STUDIO_PORT), '127.0.0.1');",
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
  ].join("\n");
}

const crashingStudioProgram = [
  "const { spawn } = require('node:child_process');",
  "const { writeFileSync } = require('node:fs');",
  "const { createServer } = require('node:http');",
  "const nonce = process.env.WORLDKIT_STUDIO_READINESS_NONCE;",
  "const grandchildProgram = \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\";",
  "const grandchild = spawn(process.execPath, ['-e', grandchildProgram], { stdio: 'ignore' });",
  "writeFileSync(process.env.TEST_CHILD_RECORD_PATH, JSON.stringify({ pid: process.pid, grandchildPid: grandchild.pid }));",
  "const server = createServer((request, response) => {",
  "  if (request.url === '/__worldkit/studio-ready') {",
  "    response.writeHead(200, { 'content-type': 'application/json' });",
  "    response.end(JSON.stringify({ status: 'ready', nonce, pid: process.pid }));",
  "    return;",
  "  }",
  "  if (request.url === '/api/health') {",
  "    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: true }));",
  "    setTimeout(() => process.exit(29), 10);",
  "    return;",
  "  }",
  "  response.writeHead(404); response.end();",
  "});",
  "server.listen(Number(process.env.WORLDKIT_STUDIO_PORT), '127.0.0.1');",
].join("\n");

const stubbornStudioProgram = [
  "const { spawn } = require('node:child_process');",
  "const { writeFileSync } = require('node:fs');",
  "const { createServer } = require('node:http');",
  "const nonce = process.env.WORLDKIT_STUDIO_READINESS_NONCE;",
  "const grandchildProgram = \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\";",
  "const grandchild = spawn(process.execPath, ['-e', grandchildProgram], { stdio: 'ignore' });",
  "writeFileSync(process.env.TEST_CHILD_RECORD_PATH, JSON.stringify({ pid: process.pid, grandchildPid: grandchild.pid }));",
  "const server = createServer((request, response) => {",
  "  if (request.url !== '/__worldkit/studio-ready') { response.writeHead(404); response.end(); return; }",
  "  response.writeHead(200, { 'content-type': 'application/json' });",
  "  response.end(JSON.stringify({ status: 'ready', nonce, pid: process.pid }));",
  "});",
  "server.listen(Number(process.env.WORLDKIT_STUDIO_PORT), '127.0.0.1');",
  "process.on('SIGTERM', () => {});",
].join("\n");

test("rejects a missing or weak public key before spawning Studio", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-public-key-"));
  const spawnSentinel = path.join(temporaryRoot, "spawned.txt");
  const studioArgs = [
    "-e",
    `require('node:fs').writeFileSync(${JSON.stringify(spawnSentinel)}, 'spawned')`,
  ];
  try {
    for (const accessKey of [undefined, "too-short", 123]) {
      await assert.rejects(
        () => startStudioPublicServer({
          accessKey,
          studioCommand: process.execPath,
          studioArgs,
        }),
        /WORLDKIT_ACCESS_KEY must contain at least 16 characters/,
      );
      assert.equal(await pathExists(spawnSentinel), false);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("starts only after nonce readiness and keeps public credentials out of Studio", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-public-ready-"));
  const recordPath = path.join(temporaryRoot, "child-record.json");
  const accessKey = "test-public-access-key-1234";
  const [studioPort, publicPort] = await availablePorts(2);
  const topology = await startStudioPublicServer({
    accessKey,
    studioCommand: process.execPath,
    studioArgs: ["-e", healthyStudioProgram],
    studioPort,
    publicPort,
    readinessTimeoutMs: 1_000,
    shutdownGraceMs: 500,
    env: {
      ...process.env,
      TEST_CHILD_RECORD_PATH: recordPath,
      WORLDKIT_ACCESS_KEY: accessKey,
      WORLDKIT_PUBLIC_PROXY_PORT: String(publicPort),
      WORLDKIT_PUBLIC_PROXY_TARGET: "http://127.0.0.1:9999",
      WORLDKIT_PUBLIC_TEST_MARKER: "must-not-cross",
    },
    studioStdio: ["ignore", "ignore", "pipe"],
  });
  try {
    const initialRecord = JSON.parse(await readFile(recordPath, "utf8"));
    assert.deepEqual(initialRecord, {
      pid: topology.childPid,
      accessKey: null,
      publicVariables: [],
      readinessNonceLength: 64,
      readinessNonceEqualsAccessKey: false,
      authorization: "not-requested",
    });

    const health = await fetch(`${topology.publicOrigin}/api/health`, {
      headers: { authorization: authorization(accessKey) },
    });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, pid: topology.childPid });
    assert.equal(JSON.parse(await readFile(recordPath, "utf8")).authorization, null);
  } finally {
    const closure = await topology.shutdown();
    assert.equal(closure.reason, "shutdown");
    assert.equal(isProcessAlive(topology.childPid), false);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("fails closed for wrong readiness, early exit, timeout, and an occupied proxy port", async (t) => {
  const readinessTimeoutMs = 500;
  const cases = [
    { name: "wrong nonce", mode: "wrong-nonce", error: /readiness identity did not match/ },
    { name: "early exit", mode: "early-exit", error: /exited before readiness \(code 23, signal null\)/ },
    { name: "readiness timeout", mode: "timeout", error: /readiness timed out after 500ms/ },
    { name: "occupied proxy port", mode: "ready", error: /EADDRINUSE/, occupyPublicPort: true },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-public-failure-"));
      const recordPath = path.join(temporaryRoot, "child-record.json");
      const [studioPort, publicPort] = await availablePorts(2);
      let occupiedServer = null;
      let childPid = null;
      try {
        if (fixture.occupyPublicPort) {
          occupiedServer = createServer((_request, response) => response.end("occupied-owner"));
          await new Promise((resolve, reject) => {
            occupiedServer.once("error", reject);
            occupiedServer.listen(publicPort, "127.0.0.1", resolve);
          });
        }
        await assert.rejects(
          () => startStudioPublicServer({
            accessKey: "test-public-access-key-1234",
            studioCommand: process.execPath,
            studioArgs: ["-e", readinessFixtureProgram(fixture.mode)],
            studioPort,
            publicPort,
            readinessTimeoutMs,
            readinessPollMs: 5,
            shutdownGraceMs: 50,
            env: { ...process.env, TEST_CHILD_RECORD_PATH: recordPath },
            studioStdio: "ignore",
          }),
          fixture.error,
        );
        childPid = (await waitForJson(recordPath)).pid;
        assert.equal(isProcessAlive(childPid), false, "owned Studio child must be gone");

        if (fixture.occupyPublicPort) {
          assert.equal(await fetch(`http://127.0.0.1:${publicPort}`).then((response) => response.text()), "occupied-owner");
        } else {
          await assert.rejects(
            fetch(`http://127.0.0.1:${publicPort}`, { signal: AbortSignal.timeout(100) }),
          );
        }
      } finally {
        await forceKillProcessGroup(childPid);
        if (occupiedServer) {
          await new Promise((resolve) => occupiedServer.close(resolve));
        }
        await rm(temporaryRoot, { recursive: true, force: true });
      }
    });
  }
});

test("closes the public listener and child process group when Studio crashes", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-public-crash-"));
  const recordPath = path.join(temporaryRoot, "child-record.json");
  const [studioPort, publicPort] = await availablePorts(2);
  const accessKey = "test-public-access-key-1234";
  let topology = null;
  try {
    topology = await startStudioPublicServer({
      accessKey,
      studioCommand: process.execPath,
      studioArgs: ["-e", crashingStudioProgram],
      studioPort,
      publicPort,
      readinessTimeoutMs: 1_000,
      shutdownGraceMs: 50,
      env: { ...process.env, TEST_CHILD_RECORD_PATH: recordPath },
      studioStdio: "ignore",
    });
    const processIds = await waitForJson(recordPath);
    const health = await fetch(`${topology.publicOrigin}/api/health`, {
      headers: { authorization: authorization(accessKey) },
    });
    assert.equal(health.status, 200);

    const closure = await Promise.race([
      topology.closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("public listener did not close")), 750)),
    ]);
    assert.equal(closure.reason, "child-exit");
    assert.equal(closure.exit.code, 29);
    assert.equal(isProcessAlive(processIds.pid), false);
    assert.equal(await waitForProcessExit(processIds.grandchildPid), true);
    await assert.rejects(
      fetch(topology.publicOrigin, { signal: AbortSignal.timeout(100) }),
    );
  } finally {
    if (topology) await topology.shutdown();
    const processIds = await waitForJson(recordPath).catch(() => null);
    await forceKillProcessGroup(processIds?.pid);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("real public-server CLI handles parent SIGTERM and closes both listeners", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-public-cli-"));
  const [studioPort, publicPort] = await availablePorts(2);
  const accessKey = "test-public-access-key-1234";
  const wrapper = spawn(process.execPath, [path.join(studioSourceRoot, "public-server.mjs")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      WORLDKIT_ACCESS_KEY: accessKey,
      WORLDKIT_DISABLE_PLAYGROUND_SPAWN: "1",
      WORLDKIT_PUBLIC_ENV_FILE: path.join(temporaryRoot, "absent.env"),
      WORLDKIT_PUBLIC_PROXY_PORT: String(publicPort),
      WORLDKIT_STUDIO_PORT: String(studioPort),
      WORLDKIT_STUDIO_DATA_ROOT: path.join(temporaryRoot, "studio-data"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let internalPid = null;
  try {
    const outputMatch = await waitForOutput(
      wrapper.stdout,
      wrapper,
      /WorldKit supervised public Studio: http:\/\/127\.0\.0\.1:\d+ \(Studio pid (\d+)\)/,
      5_000,
    );
    internalPid = Number(outputMatch[1]);
    const health = await fetch(`http://127.0.0.1:${publicPort}/api/health`, {
      headers: { authorization: authorization(accessKey) },
    });
    assert.equal(health.status, 200);

    wrapper.kill("SIGTERM");
    const [code, signal] = await once(wrapper, "exit");
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.equal(isProcessAlive(internalPid), false);
    await assert.rejects(fetch(`http://127.0.0.1:${publicPort}`, { signal: AbortSignal.timeout(100) }));
    await assert.rejects(fetch(`http://127.0.0.1:${studioPort}`, { signal: AbortSignal.timeout(100) }));
  } finally {
    if (wrapper.exitCode === null && wrapper.signalCode === null) {
      wrapper.kill("SIGTERM");
      await Promise.race([
        once(wrapper, "exit"),
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]);
    }
    if (wrapper.exitCode === null && wrapper.signalCode === null) wrapper.kill("SIGKILL");
    await forceKillProcessGroup(internalPid);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("wrapper shutdown escalates against a Studio process group that ignores SIGTERM", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-public-stubborn-"));
  const recordPath = path.join(temporaryRoot, "child-record.json");
  const [studioPort, publicPort] = await availablePorts(2);
  let topology = null;
  let processIds = null;
  try {
    topology = await startStudioPublicServer({
      accessKey: "test-public-access-key-1234",
      studioCommand: process.execPath,
      studioArgs: ["-e", stubbornStudioProgram],
      studioPort,
      publicPort,
      readinessTimeoutMs: 1_000,
      shutdownGraceMs: 50,
      env: { ...process.env, TEST_CHILD_RECORD_PATH: recordPath },
      studioStdio: "ignore",
    });
    processIds = await waitForJson(recordPath);
    const closure = await topology.shutdown();
    assert.equal(closure.reason, "shutdown");
    assert.equal(closure.termination.escalated, true);
    assert.equal(closure.termination.exit.signal, "SIGKILL");
    assert.equal(await waitForProcessExit(processIds.pid), true);
    assert.equal(await waitForProcessExit(processIds.grandchildPid), true);
    await assert.rejects(fetch(topology.publicOrigin, { signal: AbortSignal.timeout(100) }));
  } finally {
    if (topology) await topology.shutdown();
    await forceKillProcessGroup(processIds?.pid);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
