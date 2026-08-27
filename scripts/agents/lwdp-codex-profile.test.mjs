import assert from "node:assert/strict";
import test from "node:test";

import {
  FORMAL_CODEX_EXECUTION_PROFILE,
  resolveCodexExecutionProfile,
  SMOKE_CODEX_EXECUTION_PROFILE,
} from "../lib/lwdp-codex-profile.mjs";

test("locks formal WorldKit cases to gpt-5.6-sol with xhigh reasoning", () => {
  assert.deepEqual(resolveCodexExecutionProfile(), FORMAL_CODEX_EXECUTION_PROFILE);
  assert.deepEqual(resolveCodexExecutionProfile({
    executionProfile: "formal",
    model: "gpt-5.6-sol",
    reasoningEffort: "xhigh",
  }), FORMAL_CODEX_EXECUTION_PROFILE);
});

test("rejects formal model or reasoning downgrades", () => {
  assert.throws(
    () => resolveCodexExecutionProfile({ executionProfile: "formal", model: "gpt-5.5" }),
    /require model gpt-5\.6-sol/,
  );
  assert.throws(
    () => resolveCodexExecutionProfile({ executionProfile: "formal", reasoningEffort: "high" }),
    /require reasoning effort xhigh/,
  );
});

test("allows lower-cost settings only through the explicit smoke profile", () => {
  assert.deepEqual(resolveCodexExecutionProfile({ executionProfile: "smoke" }), {
    ...SMOKE_CODEX_EXECUTION_PROFILE,
  });
  assert.deepEqual(resolveCodexExecutionProfile({
    executionProfile: "smoke",
    model: "gpt-5.6-terra",
    reasoningEffort: "low",
  }), {
    name: "smoke",
    model: "gpt-5.6-terra",
    reasoningEffort: "low",
  });
});
