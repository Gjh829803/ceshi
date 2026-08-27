import { describe, expect, it, vi } from "vitest";

import { installWorldkitAuthoringEditApi } from "./worldkit-authoring-edit-api";
import type { WorldkitAuthoringEditApiV1 } from "@whitebox-world/authoring-edit";

const API_KEYS = [
  "applyWorldChange",
  "diffWorldChange",
  "dryRunWorldChange",
  "explainWorldChange",
  "getWorldChangeCleanupReport",
  "getWorldChangeReceipt",
  "projectAiSchema",
  "searchRegistry",
  "validateWorldChange",
  "version",
] as const;

function portFixture(): WorldkitAuthoringEditApiV1 {
  return {
    version: 1,
    projectAiSchema: vi.fn(async () => ({ kind: "projection" }) as never),
    searchRegistry: vi.fn(async () => ({ kind: "search" }) as never),
    validateWorldChange: vi.fn(async () => ({ kind: "receipt" }) as never),
    dryRunWorldChange: vi.fn(async () => ({ kind: "receipt" }) as never),
    applyWorldChange: vi.fn(async () => ({ kind: "receipt" }) as never),
    getWorldChangeReceipt: vi.fn(async () => ({ kind: "receipt" }) as never),
    getWorldChangeCleanupReport: vi.fn(async () => ({ kind: "cleanup" }) as never),
    explainWorldChange: vi.fn(async () => ({ kind: "explain" }) as never),
    diffWorldChange: vi.fn(async () => ({ kind: "diff" }) as never),
  };
}

describe("WorldKit authoring edit API", () => {
  it("installs a frozen nine-method control surface outside Browser Protocol V5", async () => {
    const target: Parameters<typeof installWorldkitAuthoringEditApi>[0] & {
      __WORLDKIT__?: { version: 5 };
    } = { __WORLDKIT__: { version: 5 } };
    const port = portFixture();
    const installation = installWorldkitAuthoringEditApi(target, port);

    expect(Object.keys(installation.api).sort()).toEqual([...API_KEYS]);
    expect(installation.api.version).toBe(1);
    expect(target.__WORLDKIT_AUTHORING_EDIT__).toBe(installation.api);
    expect(target.__WORLDKIT__).toEqual({ version: 5 });
    expect(Object.keys(target.__WORLDKIT__ ?? {}).sort()).toEqual(["version"]);

    await installation.api.projectAiSchema({} as never);
    expect(port.projectAiSchema).toHaveBeenCalledTimes(1);

    installation.dispose();
    expect(target.__WORLDKIT_AUTHORING_EDIT__).toBeUndefined();
    expect(target.__WORLDKIT__).toEqual({ version: 5 });
  });

  it("does not overwrite a later Edit API installation on dispose", () => {
    const target: Parameters<typeof installWorldkitAuthoringEditApi>[0] = {};
    const first = installWorldkitAuthoringEditApi(target, portFixture());
    const second = installWorldkitAuthoringEditApi(target, portFixture());
    first.dispose();
    expect(target.__WORLDKIT_AUTHORING_EDIT__).toBe(second.api);
    second.dispose();
    expect(target.__WORLDKIT_AUTHORING_EDIT__).toBeUndefined();
  });
});
