import type { FixedInputV1, RuntimeSessionReceiptV1 } from "@whitebox-world/runtime-contracts";

/** Browser adapter policy only: formal/scripted input never calls this helper. */
export async function finishHostedInteractiveInputV1(input: Readonly<{
  receipt: RuntimeSessionReceiptV1;
  clearPhysicalInput(): void;
  submitNeutralInput(input: FixedInputV1): Promise<RuntimeSessionReceiptV1>;
}>): Promise<boolean> {
  if (input.receipt.status === "succeeded") return false;
  if (input.receipt.diagnostic.code === "RUNTIME_SESSION_FIXED_INPUT_REJECTED") {
    input.clearPhysicalInput();
    const recovery = await input.submitNeutralInput({ actions: [], ticks: 1 });
    if (recovery.status === "succeeded") return true;
  }
  throw new Error("WORLDKIT_HOSTED_RUNTIME_LOCAL_INPUT_REJECTED");
}
