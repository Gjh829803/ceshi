import { once } from "node:events";
import type { Readable, Writable } from "node:stream";

import { parseCanonicalJson } from "@whitebox-world/authoring";
import type {
  RuntimeSessionDiagnosticV1,
} from "@whitebox-world/runtime-contracts";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import type {
  RuntimeSessionExecutorV1,
  RuntimeSessionFinalEventV1,
} from "./runtime-session-executor";

export interface RuntimeSessionNdjsonLimitsV1 {
  readonly maximumLineBytes: number;
  readonly maximumInputBytes: number;
  readonly maximumRequestCount: number;
}

export interface RunRuntimeSessionNdjsonInputV1 {
  readonly executor: RuntimeSessionExecutorV1;
  readonly input: Readable;
  readonly output: Writable;
  readonly limits?: RuntimeSessionNdjsonLimitsV1;
  readonly terminationSignal?: Promise<"SIGINT" | "SIGTERM">;
}

export interface RuntimeSessionNdjsonResultV1 {
  readonly exitCode: 0 | 1 | 2;
  readonly finalEvent: RuntimeSessionFinalEventV1;
  readonly signal?: "SIGINT" | "SIGTERM";
}

const DEFAULT_LIMITS = Object.freeze({
  maximumLineBytes: 1024 * 1024,
  maximumInputBytes: 16 * 1024 * 1024,
  maximumRequestCount: 10_000,
}) satisfies RuntimeSessionNdjsonLimitsV1;

const REQUEST_REJECTED_DIAGNOSTIC = Object.freeze({
  code: "RUNTIME_SESSION_REQUEST_REJECTED" as const,
  message: "The NDJSON input is not one valid bounded Runtime Session Request.",
});

const INTERNAL_FAILURE_DIAGNOSTIC = Object.freeze({
  code: "RUNTIME_SESSION_INTERNAL_FAILURE" as const,
  message: "The Runtime Session transport failed and was closed.",
});

class RuntimeSessionNdjsonInputErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeSessionNdjsonInputErrorV1";
  }
}

function validateLimits(
  value: RuntimeSessionNdjsonLimitsV1,
): RuntimeSessionNdjsonLimitsV1 {
  for (const [name, limit] of Object.entries(value)) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError(`${name} must be a positive safe integer.`);
    }
  }
  return Object.freeze({ ...value });
}

async function writeCanonicalRecord(
  output: Writable,
  value: unknown,
): Promise<void> {
  const line = `${stringifyCanonicalJson(value)}\n`;
  if (output.destroyed || !output.writable) {
    throw new Error("RUNTIME_SESSION_NDJSON_OUTPUT_UNAVAILABLE");
  }
  if (!output.write(line, "utf8")) {
    await once(output, "drain");
  }
}

function chunkBytes(value: unknown): Buffer {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error("RUNTIME_SESSION_NDJSON_CHUNK_INVALID");
}

function parseLine(lineBytes: Buffer): unknown {
  const normalized = lineBytes.at(-1) === 0x0d
    ? lineBytes.subarray(0, lineBytes.byteLength - 1)
    : lineBytes;
  if (normalized.byteLength === 0) {
    throw new RuntimeSessionNdjsonInputErrorV1("empty NDJSON line");
  }
  const parsed = parseCanonicalJson(normalized.toString("utf8"));
  if (!parsed.ok) {
    throw new RuntimeSessionNdjsonInputErrorV1("malformed NDJSON Request");
  }
  return parsed.value;
}

async function stopInput(
  input: Readable,
  iterator: AsyncIterator<unknown>,
): Promise<void> {
  input.destroy();
  try {
    await iterator.return?.();
  } catch {
    // Runtime termination remains authoritative when input cleanup also fails.
  }
}

async function closeWithDiagnostic(
  executor: RuntimeSessionExecutorV1,
  output: Writable,
  diagnostic: RuntimeSessionDiagnosticV1,
  exitCode: 1 | 2,
): Promise<RuntimeSessionNdjsonResultV1> {
  const finalEvent = await executor.terminate(diagnostic);
  try {
    await writeCanonicalRecord(output, finalEvent);
  } catch {
    // There is no alternate protocol channel when stdout itself has failed.
  }
  return Object.freeze({ exitCode, finalEvent });
}

export async function runRuntimeSessionNdjsonV1(
  input: RunRuntimeSessionNdjsonInputV1,
): Promise<RuntimeSessionNdjsonResultV1> {
  const limits = validateLimits(input.limits ?? DEFAULT_LIMITS);
  const iterator = input.input[Symbol.asyncIterator]();
  const neverSignal = new Promise<never>(() => undefined);
  const terminationSignal = input.terminationSignal ?? neverSignal;
  let pending = Buffer.alloc(0);
  let totalInputBytes = 0;
  let requestCount = 0;

  try {
    await writeCanonicalRecord(input.output, input.executor.readyEvent);
    const alreadyFinal = input.executor.terminalEvent();
    if (!isNil(alreadyFinal)) {
      await writeCanonicalRecord(input.output, alreadyFinal);
      await stopInput(input.input, iterator);
      return Object.freeze({ exitCode: 0, finalEvent: alreadyFinal });
    }

    while (true) {
      let newlineIndex = pending.indexOf(0x0a);
      if (newlineIndex < 0) {
        if (pending.byteLength > limits.maximumLineBytes) {
          throw new RuntimeSessionNdjsonInputErrorV1("NDJSON line is too long");
        }
        const next = await Promise.race([
          iterator.next().then((result) => Object.freeze({
            kind: "chunk" as const,
            result,
          })),
          terminationSignal.then((signal) => Object.freeze({
            kind: "signal" as const,
            signal,
          })),
        ]);
        if (next.kind === "signal") {
          await stopInput(input.input, iterator);
          const finalEvent = await input.executor.terminate();
          await writeCanonicalRecord(input.output, finalEvent);
          return Object.freeze({
            exitCode: 0,
            finalEvent,
            signal: next.signal,
          });
        }
        if (next.result.done) {
          if (pending.byteLength === 0) {
            const finalEvent = await input.executor.terminate();
            await writeCanonicalRecord(input.output, finalEvent);
            return Object.freeze({ exitCode: 0, finalEvent });
          }
          newlineIndex = pending.byteLength;
        } else {
          const bytes = chunkBytes(next.result.value);
          totalInputBytes += bytes.byteLength;
          if (totalInputBytes > limits.maximumInputBytes) {
            throw new RuntimeSessionNdjsonInputErrorV1(
              "NDJSON input budget exceeded",
            );
          }
          pending = Buffer.concat([pending, bytes]);
          continue;
        }
      }

      const line = pending.subarray(0, newlineIndex);
      pending = newlineIndex === pending.byteLength
        ? Buffer.alloc(0)
        : pending.subarray(newlineIndex + 1);
      if (line.byteLength > limits.maximumLineBytes) {
        throw new RuntimeSessionNdjsonInputErrorV1("NDJSON line is too long");
      }
      requestCount += 1;
      if (requestCount > limits.maximumRequestCount) {
        throw new RuntimeSessionNdjsonInputErrorV1(
          "NDJSON Request count budget exceeded",
        );
      }

      const value = parseLine(line);
      let receipt;
      try {
        receipt = await input.executor.execute(value);
      } catch (error) {
        if (error instanceof RangeError || error instanceof TypeError) {
          throw new RuntimeSessionNdjsonInputErrorV1(
            "Runtime Session Request schema is invalid",
          );
        }
        throw error;
      }
      await writeCanonicalRecord(input.output, receipt);
      const terminal = input.executor.terminalEvent();
      if (!isNil(terminal)) {
        await writeCanonicalRecord(input.output, terminal);
        await stopInput(input.input, iterator);
        return Object.freeze({ exitCode: 0, finalEvent: terminal });
      }
    }
  } catch (error) {
    await stopInput(input.input, iterator);
    if (error instanceof RuntimeSessionNdjsonInputErrorV1) {
      return closeWithDiagnostic(
        input.executor,
        input.output,
        REQUEST_REJECTED_DIAGNOSTIC,
        2,
      );
    }
    return closeWithDiagnostic(
      input.executor,
      input.output,
      INTERNAL_FAILURE_DIAGNOSTIC,
      1,
    );
  }
}
