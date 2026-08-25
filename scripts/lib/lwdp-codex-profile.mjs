export const FORMAL_CODEX_EXECUTION_PROFILE = Object.freeze({
  name: "formal",
  model: "gpt-5.6-sol",
  reasoningEffort: "xhigh",
});

export const SMOKE_CODEX_EXECUTION_PROFILE = Object.freeze({
  name: "smoke",
  model: "gpt-5.5",
  reasoningEffort: "low",
});

export function resolveCodexExecutionProfile({
  executionProfile = "formal",
  model,
  reasoningEffort,
} = {}) {
  if (executionProfile === "formal") {
    if (model && model !== FORMAL_CODEX_EXECUTION_PROFILE.model) {
      throw new Error(
        `Formal WorldKit cases require model ${FORMAL_CODEX_EXECUTION_PROFILE.model}; received ${model}.`,
      );
    }
    if (reasoningEffort && reasoningEffort !== FORMAL_CODEX_EXECUTION_PROFILE.reasoningEffort) {
      throw new Error(
        `Formal WorldKit cases require reasoning effort ${FORMAL_CODEX_EXECUTION_PROFILE.reasoningEffort}; received ${reasoningEffort}.`,
      );
    }
    return FORMAL_CODEX_EXECUTION_PROFILE;
  }

  if (executionProfile === "smoke") {
    return Object.freeze({
      name: "smoke",
      model: model || SMOKE_CODEX_EXECUTION_PROFILE.model,
      reasoningEffort: reasoningEffort || SMOKE_CODEX_EXECUTION_PROFILE.reasoningEffort,
    });
  }

  throw new Error("--execution-profile must be either formal or smoke.");
}
