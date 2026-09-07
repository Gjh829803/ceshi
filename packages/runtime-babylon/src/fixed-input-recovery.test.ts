import { describe, expect, it } from "vitest";
import { isRecoverablePreparedFixedInputFailure } from "./babylon-world-runtime";

describe("legacy prepared fixed-input recovery admission", () => {
  const prepareMessage = "ADAPTER_FIXED_INPUT_FAILED: The Runtime Adapter could not prepare the fixed simulation Tick.";
  const sessionError = (message = prepareMessage) => Object.assign(new Error(message), {
    name: "WorldSessionOperationErrorV1",
  });
  const prepared = { stage: "prepare", errorCode: "3C_INPUT_INVALID" } as const;

  it("requires the rolled-back provider failure and the Host prepare boundary together", () => {
    expect(isRecoverablePreparedFixedInputFailure(sessionError(), prepared)).toBe(true);
    expect(isRecoverablePreparedFixedInputFailure(sessionError(), undefined)).toBe(false);
    expect(isRecoverablePreparedFixedInputFailure(new Error(prepareMessage), prepared)).toBe(false);
    expect(isRecoverablePreparedFixedInputFailure({ name: "WorldSessionOperationErrorV1", message: prepareMessage }, prepared)).toBe(false);
  });

  it.each([
    "ADAPTER_FIXED_INPUT_FAILED: The Runtime Adapter could not estimate the fixed simulation Tick.",
    "ADAPTER_COMMIT_CONTRACT_VIOLATED: The Runtime Adapter could not prepare the fixed simulation Tick.",
    "ADAPTER_ABORT_FAILED: The Runtime Adapter could not prepare the fixed simulation Tick.",
    "ADAPTER_FIXED_INPUT_FAILED: Gameplay World Port could not prepare fixed input.",
  ])("never recovers a different transaction boundary: %s", (message) => {
    expect(isRecoverablePreparedFixedInputFailure(sessionError(message), prepared)).toBe(false);
  });

  it("never recovers failed rollback, even if it also reports invalid input", () => {
    expect(isRecoverablePreparedFixedInputFailure(sessionError(), { ...prepared, stage: "rollback" })).toBe(false);
    expect(isRecoverablePreparedFixedInputFailure(sessionError(), { ...prepared, errorCode: "3C_TICK_TOKEN_STALE" })).toBe(false);
  });
});
