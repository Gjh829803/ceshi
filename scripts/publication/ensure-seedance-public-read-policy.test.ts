import { describe, expect, it } from "vitest";

import { ensurePublicReadStatement } from "./ensure-seedance-public-read-policy.mjs";

describe("Seedance public-read bucket policy", () => {
  it("adds one exact-prefix GetObject statement without widening bucket access", () => {
    const input = { Version: "2012-10-17", Statement: [{
      Sid: "Existing",
      Effect: "Allow",
      Principal: { AWS: "arn:aws:iam::123:root" },
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::bucket/private/*",
    }] };
    const result = ensurePublicReadStatement(
      input,
      "bucket",
      "world-model/sft/worldkit_seedance_review",
    );
    expect(result.changed).toBe(true);
    expect(result.policy.Statement).toHaveLength(2);
    expect(result.statement).toEqual({
      Sid: "AllowPublicReadWorldKitSeedanceReview20260831",
      Effect: "Allow",
      Principal: "*",
      Action: "s3:GetObject",
      Resource:
        "arn:aws:s3:::bucket/world-model/sft/worldkit_seedance_review/*",
    });
  });

  it("is idempotent and rejects a conflicting pre-existing scope", () => {
    const exact = ensurePublicReadStatement(
      { Version: "2012-10-17", Statement: [] },
      "bucket",
      "prefix",
    );
    expect(ensurePublicReadStatement(exact.policy, "bucket", "prefix").changed)
      .toBe(false);
    expect(() => ensurePublicReadStatement({
      Version: "2012-10-17",
      Statement: [{
        ...exact.statement,
        Resource: "arn:aws:s3:::bucket/*",
      }],
    }, "bucket", "prefix")).toThrow("different scope");
  });
});
