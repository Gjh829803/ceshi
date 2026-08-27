import { Readable, Writable } from "node:stream";

import {
  WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
  deriveRuntimeSessionEventIdV1,
  deriveRuntimeSessionReceiptIdV1,
  hashRuntimeSessionRequestV1,
  parseRuntimeSessionRequestV1,
  type RuntimeSessionDiagnosticV1,
  type RuntimeSessionEventV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
} from "@whitebox-world/runtime-contracts";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import type {
  RuntimeSessionExecutorV1,
  RuntimeSessionFinalEventV1,
  RuntimeSessionReadyEventV1,
} from "./runtime-session-executor";
import { runRuntimeSessionNdjsonV1 } from "./runtime-session-ndjson";

const ROOT_HASH = `sha256:${"a".repeat(64)}` as const;
const RUNTIME_SESSION_ID = "runtime-session.ndjson";
const WORLD_SESSION_ID = "world-session.ndjson";

function event(
  type: "ready" | "completed" | "failed",
  diagnostic?: RuntimeSessionDiagnosticV1,
): RuntimeSessionEventV1 {
  const body = {
    kind: "worldkit-runtime-session-event",
    schemaVersion: 1,
    protocolVersion: 1,
    sequence: type === "ready" ? 1 : 2,
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId: WORLD_SESSION_ID,
    type,
    ...(type === "ready"
      ? {
          runtimeSessionUri:
            `worldkit://runtime-session/${RUNTIME_SESSION_ID}`,
          worldPackageRef:
            `package://world-package/sha256/${"a".repeat(64)}`,
          worldPackageRootHash: ROOT_HASH,
          fixedInputControllerEntityId: "controller-runtime-session",
          supportedRequestTypes: WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
        }
      : {}),
    ...(type === "failed" ? { diagnostic } : {}),
  } as const;
  return {
    id: deriveRuntimeSessionEventIdV1(body),
    ...body,
  } as RuntimeSessionEventV1;
}

function request(
  id: string,
  type: "snapshot.get" | "session.close" = "snapshot.get",
): RuntimeSessionRequestV1 {
  return {
    kind: "worldkit-runtime-session-request",
    schemaVersion: 1,
    id,
    runtimeSessionId: RUNTIME_SESSION_ID,
    type,
  };
}

function receipt(input: RuntimeSessionRequestV1): RuntimeSessionReceiptV1 {
  const common = {
    kind: "worldkit-runtime-session-receipt",
    schemaVersion: 1,
    requestId: input.id,
    requestHash: hashRuntimeSessionRequestV1(input),
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId: WORLD_SESSION_ID,
    requestType: input.type,
    status: "succeeded",
  } as const;
  const body = input.type === "session.close"
    ? { ...common, closeResult: { mode: "closed" as const } }
    : {
        ...common,
        status: "rejected" as const,
        diagnostic: {
          code: "RUNTIME_SESSION_REQUEST_REJECTED" as const,
          message: "Snapshot omitted by the stream test executor.",
        },
      };
  return {
    id: deriveRuntimeSessionReceiptIdV1(body),
    ...body,
  } as RuntimeSessionReceiptV1;
}

class FakeExecutor implements RuntimeSessionExecutorV1 {
  readonly readyEvent = event("ready") as RuntimeSessionReadyEventV1;
  readonly executedRequestIds: string[] = [];
  readonly terminations: Array<RuntimeSessionDiagnosticV1 | undefined> = [];
  #finalEvent: RuntimeSessionFinalEventV1 | undefined;

  async execute(value: unknown): Promise<RuntimeSessionReceiptV1> {
    const parsed = parseRuntimeSessionRequestV1(value);
    this.executedRequestIds.push(parsed.id);
    const result = receipt(parsed);
    if (parsed.type === "session.close") {
      this.#finalEvent = event("completed") as RuntimeSessionFinalEventV1;
    }
    return result;
  }

  terminalEvent(): RuntimeSessionFinalEventV1 | undefined {
    return this.#finalEvent;
  }

  async terminate(
    diagnostic?: RuntimeSessionDiagnosticV1,
  ): Promise<RuntimeSessionFinalEventV1> {
    this.terminations.push(diagnostic);
    this.#finalEvent ??= event(
      diagnostic === undefined ? "completed" : "failed",
      diagnostic,
    ) as RuntimeSessionFinalEventV1;
    return this.#finalEvent;
  }
}

class CollectingWritable extends Writable {
  readonly chunks: Buffer[] = [];

  constructor(delayed = false) {
    super({ highWaterMark: delayed ? 1 : 16 * 1024 });
    this.delayed = delayed;
  }

  private readonly delayed: boolean;

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.from(chunk));
    if (this.delayed) {
      setTimeout(callback, 1);
    } else {
      callback();
    }
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

function lines(output: CollectingWritable): string[] {
  return output.text().trimEnd().split("\n");
}

describe("Runtime Session NDJSON V1", () => {
  it("writes ready first, canonical one-line Receipts, and completed on EOF", async () => {
    const executor = new FakeExecutor();
    const output = new CollectingWritable();
    const first = request("request-first");
    const second = request("request-second");
    const result = await runRuntimeSessionNdjsonV1({
      executor,
      input: Readable.from([
        `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
      ]),
      output,
    });

    const records = lines(output);
    expect(records).toHaveLength(4);
    expect(JSON.parse(records[0]!)).toEqual(executor.readyEvent);
    expect(records.slice(1, 3).map((line) => JSON.parse(line).requestId)).toEqual([
      first.id,
      second.id,
    ]);
    expect(JSON.parse(records[3]!)).toMatchObject({ type: "completed" });
    expect(records.every((line) => stringifyCanonicalJson(JSON.parse(line)) === line)).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(executor.terminations).toEqual([undefined]);
  });

  it.each([
    ["malformed JSON", "{\n"],
    ["duplicate keys", `{"kind":"worldkit-runtime-session-request","kind":"duplicate"}\n`],
    ["empty line", "\n"],
  ])("fails and closes on %s", async (_label, source) => {
    const executor = new FakeExecutor();
    const output = new CollectingWritable();
    const result = await runRuntimeSessionNdjsonV1({
      executor,
      input: Readable.from([source]),
      output,
    });

    expect(result.exitCode).toBe(2);
    expect(executor.executedRequestIds).toEqual([]);
    expect(JSON.parse(lines(output).at(-1)!)).toMatchObject({
      type: "failed",
      diagnostic: { code: "RUNTIME_SESSION_REQUEST_REJECTED" },
    });
  });

  it("bounds both one line and total input bytes", async () => {
    for (const limits of [
      { maximumLineBytes: 32, maximumInputBytes: 1_024 },
      { maximumLineBytes: 1_024, maximumInputBytes: 32 },
    ]) {
      const executor = new FakeExecutor();
      const output = new CollectingWritable();
      const result = await runRuntimeSessionNdjsonV1({
        executor,
        input: Readable.from([`${"x".repeat(64)}\n`]),
        output,
        limits: { ...limits, maximumRequestCount: 4 },
      });
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(lines(output).at(-1)!)).toMatchObject({ type: "failed" });
    }
  });

  it("writes an explicit close Receipt before the final completed Event", async () => {
    const executor = new FakeExecutor();
    const output = new CollectingWritable();
    const close = request("request-close", "session.close");
    await runRuntimeSessionNdjsonV1({
      executor,
      input: Readable.from([`${JSON.stringify(close)}\n`]),
      output,
    });
    expect(lines(output).map((line) => {
      const record = JSON.parse(line);
      return record.requestType ?? record.type;
    })).toEqual(["ready", "session.close", "completed"]);
    expect(executor.terminations).toEqual([]);
  });

  it.each(["SIGINT", "SIGTERM"] as const)(
    "disposes and completes on %s",
    async (signal) => {
      const executor = new FakeExecutor();
      const output = new CollectingWritable();
      const result = await runRuntimeSessionNdjsonV1({
        executor,
        input: new Readable({ read() {} }),
        output,
        terminationSignal: Promise.resolve(signal),
      });
      expect(result).toMatchObject({ exitCode: 0, signal });
      expect(executor.terminations).toEqual([undefined]);
      expect(JSON.parse(lines(output).at(-1)!)).toMatchObject({ type: "completed" });
    },
  );

  it("preserves record order while respecting writer backpressure", async () => {
    const executor = new FakeExecutor();
    const output = new CollectingWritable(true);
    const requests = Array.from({ length: 8 }, (_, index) =>
      request(`request-${index}`)
    );
    await runRuntimeSessionNdjsonV1({
      executor,
      input: Readable.from([
        `${requests.map((item) => JSON.stringify(item)).join("\n")}\n`,
      ]),
      output,
    });
    expect(lines(output).slice(1, -1).map((line) => JSON.parse(line).requestId)).toEqual(
      requests.map(({ id }) => id),
    );
  });
});
