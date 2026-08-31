import { describe, expect, it } from "vitest";

import { resolveFormalWorldCaptureSdkOwnerIdentitiesV1 } from "./sdk-owner-identities";

const SOURCE_COMMIT_A = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_COMMIT_B = "89abcdef0123456789abcdef0123456789abcdef";

describe("trusted formal Capture SDK owner identities", () => {
  it("publishes the five SDK owners in contract order from the root SDK version and exact source commit", async () => {
    const identities = await resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: SOURCE_COMMIT_A,
      readRepositoryStatus: async () => "",
      gitCommit: async () => {
        throw new Error("the trusted injected commit must win");
      },
    });

    expect(identities.map(({ ownerId, implementationRef }) => ({
      ownerId,
      implementationRef,
    }))).toEqual([
      {
        ownerId: "action",
        implementationRef: "worldkit://sdk-owner/subject-actions@1",
      },
      {
        ownerId: "camera",
        implementationRef: "worldkit://sdk-owner/camera@1",
      },
      {
        ownerId: "input",
        implementationRef: "worldkit://sdk-owner/control-capture@1",
      },
      {
        ownerId: "physics",
        implementationRef: "worldkit://sdk-owner/character-movement@1",
      },
      {
        ownerId: "subject",
        implementationRef: "worldkit://sdk-owner/subject-contracts@1",
      },
    ]);
    expect(identities.map(({ implementationHash }) => implementationHash))
      .toEqual([
        "sha256:177fffbd3463e524908cc110ecaf3a529ab4c2a0358a2cfe9ccf5a947fc732ee",
        "sha256:0bd4afe4546e142f7aa0eaae5737b2eefd6fabaa0f98113adba85bde43a532de",
        "sha256:49c91d7ea03f107aa2efcd1e47051be39b2197641f38cfb39cf310625b819e78",
        "sha256:1a7b49efb26bcc5dc09c17eef9faba986bb9362c8cf56f2d548191db0debadcb",
        "sha256:3bcd4c8ffe3382577cda5de8f80daf4e961076f60ee660b5c3ed50cb0044c7db",
      ]);
    expect(Object.isFrozen(identities)).toBe(true);
    expect(identities.every(Object.isFrozen)).toBe(true);
  });

  it("changes every implementation identity when the exact source commit changes", async () => {
    const first = await resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: SOURCE_COMMIT_A,
      readRepositoryStatus: async () => "",
    });
    const second = await resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: SOURCE_COMMIT_B,
      readRepositoryStatus: async () => "",
    });

    expect(second.map(({ implementationHash }) => implementationHash))
      .not.toEqual(first.map(({ implementationHash }) => implementationHash));
  });

  it("fails closed for dirty or unavailable repository state", async () => {
    await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: SOURCE_COMMIT_A,
      readRepositoryStatus: async () => " M scripts/runtime.ts\n",
    })).rejects.toThrow("WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_DIRTY");

    await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: SOURCE_COMMIT_A,
      readRepositoryStatus: async () => {
        throw new Error("git unavailable");
      },
    })).rejects.toThrow("WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_STATE_UNAVAILABLE");
  });

  it("fails closed when neither the Host nor git supplies a trusted commit", async () => {
    await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: "main",
      readRepositoryStatus: async () => "",
      gitCommit: async () => "0".repeat(40),
    })).rejects.toThrow("WORLDKIT_SOURCE_COMMIT_UNTRUSTED");
  });
});
