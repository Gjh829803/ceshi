import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { scanBna5CleanBreak } from "./verify-bna5-clean-break";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((target) =>
    rm(target, { recursive: true, force: true })
  ));
});

async function fixture(
  extraSources: Readonly<Record<string, string>> = {},
): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-bna5-clean-break-"));
  cleanupPaths.push(root);
  const sources: Readonly<Record<string, string>> = {
    "apps/native-scene-playground/src/hosted-runtime-bridge.ts": [
      'frame.setAttribute("sandbox", "allow-scripts allow-same-origin");',
      "if (location.origin === runtimeOrigin) throw new Error('cross-origin');",
      "if (event.origin !== this.input.runtimeOrigin || event.source !== this.input.frame.contentWindow) throw new Error('identity');",
      "this.input.frame.contentWindow?.postMessage({ kind: 'port' }, this.input.runtimeOrigin);",
      "parseRuntimeSessionRequestV1(value);",
    ].join("\n"),
    "apps/native-scene-playground/src/hosted-runtime-frame.ts": [
      "if (event.origin !== input.shellOrigin || event.source !== window.parent) throw new Error('identity');",
      "window.parent.postMessage({ kind: 'ready' }, input.shellOrigin);",
      "parseRuntimeSessionEventV1(value);",
    ].join("\n"),
    "packages/authoring/src/world.schema.json":
      '{"type":"object","properties":{"seed":{"type":"number"}}}\n',
    "packages/world-package/src/world.schema.json":
      '{"type":"object","properties":{"worldId":{"type":"string"}}}\n',
    "packages/runtime-contracts/src/native-execution-isolation.ts":
      "export const nativeExecutionTrustProfileRef = 'locked';\n",
    ...extraSources,
  };
  for (const [relativePath, source] of Object.entries(sources)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, source);
  }
  return root;
}

describe("BNA-5 clean-break verifier", () => {
  it("accepts one exact Hosted bridge and infrastructure-free public schemas", async () => {
    const report = await scanBna5CleanBreak(await fixture());

    expect(report).toMatchObject({
      kind: "worldkit-bna5-clean-break-report",
      schemaVersion: 1,
      ok: true,
      checks: {
        legacyHostedAliasesAbsent: true,
        unsafeExecutionApisAbsent: true,
        exactOriginMessaging: true,
        publicSchemasInfrastructureFree: true,
        hostedCommandDialectAbsent: true,
        directExecutionRequestBypassAbsent: true,
        browserOriginQueryDialectAbsent: true,
      },
      diagnostics: [],
    });
  });

  it.each([
    "sandboxProfileRef",
    "trustProfileRef",
    "isTrusted",
    "hostedNativeFallback",
    "allowHostedInProcess",
  ])("rejects legacy Hosted alias %s", async (token) => {
    const report = await scanBna5CleanBreak(await fixture({
      "packages/runtime-contracts/src/native-execution-isolation.ts":
        `export const value = ${JSON.stringify(token)};\n`,
    }));

    expect(report.ok).toBe(false);
    expect(report.diagnostics.some(({ code }) =>
      code === "BNA5_LEGACY_HOSTED_ALIAS")).toBe(true);
  });

  it("rejects a legacy Hosted fallback outside BNA5-owned paths", async () => {
    const report = await scanBna5CleanBreak(await fixture({
      "packages/visual-style/src/runtime-options.ts":
        "export const hostedNativeFallback = true;\n",
    }));

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "BNA5_LEGACY_HOSTED_ALIAS",
      path: "packages/visual-style/src/runtime-options.ts",
      value: "hostedNativeFallback",
    }));
  });

  it("allows only the authoring route trustProfileRef and does not confuse the Native execution field", async () => {
    const report = await scanBna5CleanBreak(await fixture({
      "packages/scene-authoring-contracts/src/scene-authoring-contracts.ts":
        "export interface Route { readonly trustProfileRef: string }\n",
      "apps/example/src/native-request.ts":
        "export const nativeExecutionTrustProfileRef = 'locked';\n",
    }));

    expect(report.diagnostics.filter(({ code }) =>
      code === "BNA5_LEGACY_HOSTED_ALIAS")).toEqual([]);
  });

  it("allows the reconstruction route owners to bind authoring trust provenance", async () => {
    const report = await scanBna5CleanBreak(await fixture({
      "scripts/reconstruction/generation-request.ts":
        "decideSceneAuthoringRouteV1({ trustProfileRef: CURRENT_NATIVE_TRUST_PROFILE_REF });\n",
      "scripts/reconstruction/run-native-block-generation.ts":
        "decideSceneAuthoringRouteV1({ trustProfileRef: 'worldkit://trust-profile/trusted-local@1' });\n",
    }));

    expect(report.diagnostics.filter(({ code }) =>
      code === "BNA5_LEGACY_HOSTED_ALIAS")).toEqual([]);
  });

  it("rejects trustProfileRef outside the exact authoring allowlist", async () => {
    const report = await scanBna5CleanBreak(await fixture({
      "packages/visual-style/src/runtime-options.ts":
        "export const trustProfileRef = 'legacy';\n",
    }));

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "BNA5_LEGACY_HOSTED_ALIAS",
      path: "packages/visual-style/src/runtime-options.ts",
      value: "trustProfileRef",
    }));
  });

  it.each(["node:vm", "vm.runInContext"])(
    "rejects unsafe in-process execution API %s",
    async (token) => {
      const report = await scanBna5CleanBreak(await fixture({
        "scripts/native-scene/hosted/runner.ts":
          `export const value = ${JSON.stringify(token)};\n`,
      }));
      expect(report.diagnostics.some(({ code }) =>
        code === "BNA5_UNSAFE_EXECUTION_API")).toBe(true);
    },
  );

  it("rejects wildcard messaging and a same-origin sandbox", async () => {
    const report = await scanBna5CleanBreak(await fixture({
      "apps/native-scene-playground/src/hosted-runtime-bridge.ts": [
        'frame.src = location.origin + "/runtime";',
        'frame.setAttribute("sandbox", "allow-scripts allow-same-origin");',
        'window.postMessage({ kind: "ready" }, "*");',
      ].join("\n"),
    }));
    expect(report.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "BNA5_WILDCARD_MESSAGE_TARGET",
        "BNA5_SAME_ORIGIN_SANDBOX",
      ]),
    );
  });

  it("rejects infrastructure fields in public schemas and a Hosted command dialect", async () => {
    const report = await scanBna5CleanBreak(await fixture({
      "packages/world-package/src/world.schema.json":
        '{"type":"object","properties":{"containerProvider":{"type":"string"}}}\n',
      "apps/native-scene-playground/src/hosted-runtime-frame.ts":
        'const hostedGameplayCommandTypes = ["gameplay-command.execute", "view.camera-preference.set"];\n',
    }));
    expect(report.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "BNA5_PUBLIC_SCHEMA_INFRASTRUCTURE_FIELD",
        "BNA5_HOSTED_COMMAND_DIALECT",
      ]),
    );
  });

  it("rejects direct execution request construction outside the Host admission owner", async () => {
    const report = await scanBna5CleanBreak(await fixture({
      "apps/native-scene-playground/src/main.ts":
        "const request = { kind: 'native-isolated-execution-request' };\n",
    }));
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "BNA5_DIRECT_EXECUTION_REQUEST_BYPASS",
      path: "apps/native-scene-playground/src/main.ts",
    }));
  });

  it("rejects Browser origin authority supplied through URL query parameters", async () => {
    const report = await scanBna5CleanBreak(await fixture({
      "apps/native-scene-playground/src/main.ts": [
        'query.get("runtimeOrigin");',
        'query.get("shellOrigin");',
      ].join("\n"),
    }));

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "BNA5_BROWSER_ORIGIN_QUERY_DIALECT",
      path: "apps/native-scene-playground/src/main.ts",
    }));
  });
});
