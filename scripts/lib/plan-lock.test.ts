import { describe, expect, it } from "vitest";

import { sha256NormalizedText } from "./plan-lock.js";

describe("plan lock text hashing", () => {
  it("produces one lock hash for LF and CRLF checkouts", () => {
    const expected =
      "e9024f1a07d29d52ad3aa5e1a18e94db1f3a9fd32b89e39d47c472cd99071e13";

    expect(sha256NormalizedText("line one\nline two\n")).toBe(expected);
    expect(sha256NormalizedText("line one\r\nline two\r\n")).toBe(expected);
  });
});
