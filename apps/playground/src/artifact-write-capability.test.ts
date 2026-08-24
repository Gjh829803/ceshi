import { describe, expect, it, vi } from "vitest";

import {
  artifactWriteHeaders,
  loadArtifactWriteCapability,
  type ArtifactWriteCapabilityV1,
} from "./artifact-write-capability.js";

describe("artifact write capability", () => {
  it("loads an explicit same-origin no-store capability and derives frozen write headers", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ nonce: "server-nonce" }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-worldkit-server-nonce": "server-nonce",
        },
      },
    ));

    const capability = await loadArtifactWriteCapability(fetcher);

    expect(Object.keys(capability)).toEqual(["kind"]);
    expect(capability.kind).toBe("artifact-write");
    expect(artifactWriteHeaders(capability)).toEqual({
      "content-type": "application/json",
      "x-worldkit-server-nonce": "server-nonce",
    });
    expect(Object.isFrozen(artifactWriteHeaders(capability))).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("/__whitebox/artifact-capability", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
  });

  it("rejects forged query-derived capability data", () => {
    const forged = {
      kind: "artifact-write",
      nonce: "query-nonce",
    } as unknown as ArtifactWriteCapabilityV1;

    expect(() => artifactWriteHeaders(forged)).toThrow(
      "ARTIFACT_WRITE_CAPABILITY_INVALID",
    );
  });

  it.each([
    ["non-ok response", async () => new Response(null, { status: 403 })],
    ["invalid json", async () => new Response("not-json", { status: 200 })],
    ["extra body field", async () => new Response(
      JSON.stringify({ nonce: "server-nonce", query: "forged" }),
      {
        status: 200,
        headers: { "x-worldkit-server-nonce": "server-nonce" },
      },
    )],
    ["mismatched header", async () => new Response(
      JSON.stringify({ nonce: "body-nonce" }),
      {
        status: 200,
        headers: { "x-worldkit-server-nonce": "header-nonce" },
      },
    )],
    ["empty nonce", async () => new Response(
      JSON.stringify({ nonce: "" }),
      {
        status: 200,
        headers: { "x-worldkit-server-nonce": "" },
      },
    )],
  ])("rejects %s", async (_name, fetcher) => {
    await expect(loadArtifactWriteCapability(fetcher)).rejects.toThrow(
      "ARTIFACT_WRITE_CAPABILITY_INVALID",
    );
  });

  it("normalizes fetch failures to the capability diagnostic", async () => {
    await expect(loadArtifactWriteCapability(vi.fn(async () => {
      throw new Error("network details");
    }))).rejects.toThrow("ARTIFACT_WRITE_CAPABILITY_INVALID");
  });
});
