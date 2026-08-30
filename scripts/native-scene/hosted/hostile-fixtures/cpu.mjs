import { createHash } from "node:crypto";
import { writeSync } from "node:fs";
import { createInterface } from "node:readline";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      canonicalize(value[key]),
    ]));
  }
  return value;
}

function requestHash(request) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(request)))
    .digest("hex")}`;
}

function canonicalHash(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

const input = createInterface({ input: process.stdin, terminal: false });
input.once("line", (line) => {
  const request = JSON.parse(line);
  const ready = {
    kind: "native-isolated-execution-result",
    schemaVersion: 1,
    id: `native-isolated-execution-result.${request.id}.ready`,
    requestId: request.id,
    runtimeSessionId: request.runtimeSessionId,
    status: "ready",
    runtimeSessionUri: `worldkit://runtime-session/${request.runtimeSessionId}`,
    initialSnapshotHash: canonicalHash({
      kind: "worldkit-hosted-native-cpu-hostile-initial-snapshot",
      schemaVersion: 1,
    }),
  };
  writeSync(1, `${JSON.stringify(ready)}\n`);

  input.once("line", (challengeLine) => {
    const challenge = JSON.parse(challengeLine);
    const expectedRequestHash = requestHash(request);
    if (
      challenge.kind !== "worldkit-hosted-native-runtime-usage-challenge" ||
      challenge.schemaVersion !== 1 ||
      challenge.requestHash !== expectedRequestHash ||
      challenge.runtimeSessionId !== request.runtimeSessionId ||
      challenge.sessionNonce !== request.sessionNonce ||
      typeof challenge.challengeNonce !== "string" ||
      challenge.challengeNonce.length === 0
    ) process.exit(64);
    const runtime = {
      actualSceneNodeCount: 0,
      actualMaterialCount: 0,
      actualShaderCount: 0,
      actualPhysicsBodyCount: 0,
    };
    const usage = {
      kind: "worldkit-hosted-native-runtime-usage",
      schemaVersion: 1,
      requestHash: challenge.requestHash,
      runtimeSessionId: challenge.runtimeSessionId,
      sessionNonce: challenge.sessionNonce,
      challengeNonce: challenge.challengeNonce,
      runtime,
      observationProofHash: canonicalHash({
        kind: "worldkit-hosted-native-runtime-usage-proof",
        schemaVersion: 1,
        requestHash: challenge.requestHash,
        runtimeSessionId: challenge.runtimeSessionId,
        sessionNonce: challenge.sessionNonce,
        challengeNonce: challenge.challengeNonce,
        runtime,
      }),
    };
    writeSync(1, `${JSON.stringify(usage)}\n`);

    let accumulator = 0;
    for (;;) {
      accumulator = (accumulator + 1) % Number.MAX_SAFE_INTEGER;
    }
  });
});
