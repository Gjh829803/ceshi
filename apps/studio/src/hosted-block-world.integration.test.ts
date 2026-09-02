import { EventEmitter } from "node:events";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/authoring";
import { afterEach, describe, expect, it } from "vitest";

import { buildWorldArtifactFileV1 } from "../../../scripts/cli/build-world-artifact.js";
import { compileBlockWorldModuleV2 } from "../../../scripts/cli/compile-block-world.js";
import { captureFile } from "../../../scripts/cli/worldkit.js";
import { verifyHostedWhiteboxArtifactsV1 } from "../../../scripts/lib/hosted-whitebox-artifact-verifier.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

async function listen(studio: {
  initialize(): Promise<void>;
  server: import("node:http").Server;
}): Promise<string> {
  await studio.initialize();
  await new Promise<void>((resolve, reject) => {
    studio.server.once("error", reject);
    studio.server.listen(0, "127.0.0.1", resolve);
  });
  const address = studio.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Studio did not publish a TCP address.");
  }
  return `http://127.0.0.1:${address.port}`;
}

describe("Hosted Block World production chain", () => {
  it("publishes a playable world from the real Block compiler, Host build producer, capture, and Studio admission", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hosted-block-world-chain-"));
    temporaryRoots.push(root);
    const fakeRepoRoot = path.join(root, "repo");
    const dataRoot = path.join(root, "studio-data");
    const captureSigningPrivateKeyPath = path.join(root, "capture-private.pem");
    const trustedCapturePublicKeyPath = path.join(root, "capture-public.pem");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    await Promise.all([
      writeFile(captureSigningPrivateKeyPath, privateKey, { mode: 0o600 }),
      writeFile(trustedCapturePublicKeyPath, publicKey),
    ]);
    await mkdir(fakeRepoRoot, { recursive: true });

    const studioModuleUrl = new URL("./server.mjs", import.meta.url).href;
    const { createStudio } = await import(studioModuleUrl) as {
      createStudio(options: Record<string, unknown>): {
        initialize(): Promise<void>;
        shutdown(): Promise<void>;
        server: import("node:http").Server;
      };
    };
    let producedArtifactRoot = "";
    const studio = createStudio({
      repoRoot: fakeRepoRoot,
      dataRoot,
      autoRunJobs: true,
      importExistingArtifacts: false,
      importBuiltinTestSets: false,
      importBuiltinResults: false,
      lwdpConfigured: true,
      initialCodexBackend: "local",
      captureSigningPrivateKeyPath,
      trustedCapturePublicKeyPath,
      verifyHostedWhiteboxArtifactsImplementation: async (input: Parameters<
        typeof verifyHostedWhiteboxArtifactsV1
      >[0]) => (await verifyHostedWhiteboxArtifactsV1(input)).ok,
      beforeWorldSpawn: async (sceneId: string) => {
        const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", sceneId);
        producedArtifactRoot = artifactRoot;
        await mkdir(artifactRoot, { recursive: true });
        const sourceModule = await readFile(
          "examples/block-world/mixed-shape-slope-world.mjs",
          "utf8",
        );
        const worldModulePath = path.join(artifactRoot, "world.mjs");
        await writeFile(
          worldModulePath,
          sourceModule.replace('id: "mixed-shape-slope-world"', `id: ${JSON.stringify(sceneId)}`),
          "utf8",
        );
        const authoringPath = path.join(artifactRoot, "authoring.json");
        const mapDraftPath = path.join(artifactRoot, "implementation-map.draft.json");
        const compiled = await compileBlockWorldModuleV2({
          worldPath: worldModulePath,
          authoringOutputPath: authoringPath,
          mapOutputPath: mapDraftPath,
        });
        expect(compiled.ok).toBe(true);
        const authoring = JSON.parse(await readFile(authoringPath, "utf8"));
        const draft = JSON.parse(await readFile(mapDraftPath, "utf8"));
        const primaryMapping = draft.visualTargetMappings.find(
          ({ visualTargetId }: { visualTargetId: string }) =>
            visualTargetId === "visual-target-1",
        );
        expect(primaryMapping).toBeDefined();
        const implementationMap = {
          kind: "worldkit-scene-brief-implementation-map",
          schemaVersion: 1,
          sceneId,
          sceneBriefHash: `sha256:${"b".repeat(64)}`,
          authoringSpecId: sceneId,
          authoringSpecHash: sha256CanonicalJson(authoring),
          visualTargetMappings: [primaryMapping],
          visualCaptureGroups: [{
            ...primaryMapping,
            role: "primary-subject",
            semanticClassId: "subject.player",
            identityColor: "#E85D5D",
          }],
        };
        const implementationMapPath = path.join(
          artifactRoot,
          "scene-implementation-map.json",
        );
        await writeFile(
          implementationMapPath,
          `${stringifyCanonicalJson(implementationMap)}\n`,
          "utf8",
        );

        const buildPath = path.join(artifactRoot, "world.build.json");
        const built = await buildWorldArtifactFileV1(authoringPath, buildPath);
        expect(built.ok).toBe(true);
        const capture = await captureFile(
          authoringPath,
          path.join(artifactRoot, "opening-frame.png"),
          {
            snapshotPath: path.join(artifactRoot, "runtime-snapshot.json"),
            receiptPath: path.join(artifactRoot, "whitebox-capture-receipt.json"),
            triviewOutputPath: path.join(artifactRoot, "triviews"),
            implementationMapPath,
            receiptSigningPrivateKeyPath: captureSigningPrivateKeyPath,
          },
        );
        expect(capture.ok).toBe(true);
        const captureReceiptPath = path.join(
          artifactRoot,
          "whitebox-capture-receipt.json",
        );
        const [build, snapshot, captureTargets, captureReceipt, buildStats] = await Promise.all([
          readFile(buildPath, "utf8").then(JSON.parse),
          readFile(path.join(artifactRoot, "runtime-snapshot.json"), "utf8").then(JSON.parse),
          readFile(
            path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"),
            "utf8",
          ).then(JSON.parse),
          readFile(captureReceiptPath, "utf8").then(JSON.parse),
          stat(buildPath),
        ]);
        expect(buildStats.isFile()).toBe(true);
        expect(build.executionPlan).toMatchObject({
          kind: "worldkit-canonical-scene-execution-plan",
          schemaVersion: 1,
        });
        expect(authoring.id).toBe(sceneId);
        expect(implementationMap.authoringSpecHash).toBe(sha256CanonicalJson(authoring));
        expect(build.executionPlan.authoringSpecHash).toBe(sha256CanonicalJson(authoring));
        expect(build.normalizedWorldIrHash).toBe(sha256CanonicalJson(build.normalizedWorldIr));
        expect(build.executionPlanHash).toBe(sha256CanonicalJson(build.executionPlan));
        expect(snapshot).toMatchObject({
          kind: "worldkit-runtime-snapshot",
          schemaVersion: 4,
          runtime: { phase: "ready" },
          resources: { phase: "ready" },
        });
        expect(captureTargets.worldBuildIdentityHash).toBe(build.worldBuildIdentityHash);
        expect(captureTargets).not.toHaveProperty("executionPlanHash");
        expect(captureReceipt).toMatchObject({
          kind: "worldkit-whitebox-capture-receipt",
          schemaVersion: 1,
          phase: "triview-ready",
          sceneId,
          worldBuildIdentityHash: build.worldBuildIdentityHash,
        });

        const verificationOptions = {
          sceneId,
          authoringPath,
          buildPath,
          openingFramePath: path.join(artifactRoot, "opening-frame.png"),
          runtimeSnapshotPath: path.join(artifactRoot, "runtime-snapshot.json"),
          captureReceiptPath,
          trustedCapturePublicKeyPath,
          requireTriview: true,
          whiteboxTriviewManifestPath: path.join(
            artifactRoot,
            "triviews/whitebox-triview-manifest.json",
          ),
          whiteboxTriviewRoot: path.join(artifactRoot, "triviews"),
        } as const;
        expect((await verifyHostedWhiteboxArtifactsV1(verificationOptions)).ok).toBe(true);
        const verifierCli = spawnSync("pnpm", [
          "exec", "tsx", "scripts/cli/verify-hosted-whitebox-artifacts.ts",
          "--scene-id", sceneId,
          "--authoring", authoringPath,
          "--build", buildPath,
          "--opening-frame", verificationOptions.openingFramePath,
          "--runtime-snapshot", verificationOptions.runtimeSnapshotPath,
          "--capture-receipt", captureReceiptPath,
          "--trusted-public-key", trustedCapturePublicKeyPath,
          "--require-triview",
          "--triview-manifest", verificationOptions.whiteboxTriviewManifestPath,
          "--triview-root", verificationOptions.whiteboxTriviewRoot,
        ], { cwd: path.resolve("."), encoding: "utf8" });
        expect(verifierCli.status, verifierCli.stderr || verifierCli.stdout).toBe(0);

        const forgedIdentity = `sha256:${"e".repeat(64)}`;
        await Promise.all([
          writeFile(buildPath, `${stringifyCanonicalJson({
            ...build,
            worldBuildIdentityHash: forgedIdentity,
          })}\n`),
          writeFile(verificationOptions.whiteboxTriviewManifestPath,
            `${stringifyCanonicalJson({
              ...captureTargets,
              worldBuildIdentityHash: forgedIdentity,
            })}\n`),
          writeFile(captureReceiptPath, `${stringifyCanonicalJson({
            ...captureReceipt,
            worldBuildIdentityHash: forgedIdentity,
          })}\n`),
        ]);
        expect((await verifyHostedWhiteboxArtifactsV1(verificationOptions)).diagnostics)
          .toEqual(expect.arrayContaining([expect.objectContaining({
            code: "HOSTED_WHITEBOX_WORLD_BUILD_IDENTITY_MISMATCH",
          })]));
        await Promise.all([
          writeFile(buildPath, `${stringifyCanonicalJson(build)}\n`),
          writeFile(verificationOptions.whiteboxTriviewManifestPath,
            `${stringifyCanonicalJson(captureTargets)}\n`),
          writeFile(captureReceiptPath, `${stringifyCanonicalJson(captureReceipt)}\n`),
        ]);

        const incompleteSnapshot = {
          kind: "worldkit-runtime-snapshot",
          schemaVersion: 4,
          runtime: { phase: "ready" },
          resources: { phase: "ready" },
        };
        const incompleteSnapshotBytes = Buffer.from(
          `${stringifyCanonicalJson(incompleteSnapshot)}\n`,
        );
        await Promise.all([
          writeFile(verificationOptions.runtimeSnapshotPath, incompleteSnapshotBytes),
          writeFile(captureReceiptPath, `${stringifyCanonicalJson({
            ...captureReceipt,
            runtimeSnapshotContentHash: `sha256:${createHash("sha256")
              .update(incompleteSnapshotBytes).digest("hex")}`,
          })}\n`),
        ]);
        expect((await verifyHostedWhiteboxArtifactsV1({
          ...verificationOptions,
          requireTriview: false,
        })).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({
          code: "HOSTED_WHITEBOX_RUNTIME_SNAPSHOT_INVALID",
        })]));
        await Promise.all([
          writeFile(
            verificationOptions.runtimeSnapshotPath,
            `${stringifyCanonicalJson(snapshot)}\n`,
          ),
          writeFile(captureReceiptPath, `${stringifyCanonicalJson(captureReceipt)}\n`),
        ]);
        const crossWorldSnapshot = {
          ...snapshot,
          world: {
            ...snapshot.world,
            worldStateRef: "worldkit://world-state/other-world:0",
            worldStateHash: `sha256:${"f".repeat(64)}`,
          },
        };
        const crossWorldSnapshotBytes = Buffer.from(
          `${stringifyCanonicalJson(crossWorldSnapshot)}\n`,
        );
        await Promise.all([
          writeFile(
          verificationOptions.runtimeSnapshotPath,
          crossWorldSnapshotBytes,
          ),
          // Simulate the real attack: mutate the Snapshot and recompute every
          // ordinary content hash available inside the artifact bundle. The
          // attacker still cannot forge the external Host signature.
          writeFile(captureReceiptPath, `${stringifyCanonicalJson({
            ...captureReceipt,
            runtimeSnapshotContentHash: `sha256:${createHash("sha256")
              .update(crossWorldSnapshotBytes).digest("hex")}`,
          })}\n`),
        ]);
        expect((await verifyHostedWhiteboxArtifactsV1({
          ...verificationOptions,
          requireTriview: false,
        })).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({
          code: "HOSTED_WHITEBOX_CAPTURE_SIGNATURE_UNTRUSTED",
        })]));
        await Promise.all([
          writeFile(
            verificationOptions.runtimeSnapshotPath,
            `${stringifyCanonicalJson(snapshot)}\n`,
          ),
          writeFile(captureReceiptPath, `${stringifyCanonicalJson(captureReceipt)}\n`),
        ]);

        // Exercise the product requirement that a later tri-view failure does not
        // revoke an already captured and identity-bound playable whitebox.
        await rm(path.join(artifactRoot, "triviews"), { recursive: true, force: true });
      },
      worldSpawnImplementation: () => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          killed: false,
          kill: () => true,
        });
        setImmediate(() => {
          child.stderr.end("WORLDKIT_CAPTURE_TRIVIEW_EMPTY: visual-target-1\n");
          child.stdout.end();
          child.emit("close", 1, null);
        });
        return child;
      },
    });
    const origin = await listen(studio);
    try {
      const created = await fetch(`${origin}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Real hosted Block chain",
          prompt: "Build the integration fixture.",
        }),
      }).then((response) => response.json()).then(({ world }) => world);
      let detail;
      for (let attempt = 0; attempt < 300; attempt += 1) {
        detail = await fetch(`${origin}/api/worlds/${created.id}`).then((response) =>
          response.json()
        );
        if (detail.world.status === "failed") break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(producedArtifactRoot, JSON.stringify(detail?.world ?? detail)).not.toBe("");
      expect(path.basename(producedArtifactRoot)).toBe(created.sceneId);
      const freshnessFloor = Date.parse(detail.world.startedAt) - 1_000;
      for (const relativePath of [
        "authoring.json",
        "scene-implementation-map.json",
        "world.build.json",
        "opening-frame.png",
        "runtime-snapshot.json",
        "whitebox-capture-receipt.json",
      ]) {
        const metadata = await stat(path.join(producedArtifactRoot, relativePath));
        expect(metadata.isFile(), relativePath).toBe(true);
        expect(metadata.size, relativePath).toBeGreaterThan(0);
        expect(metadata.mtimeMs, relativePath).toBeGreaterThanOrEqual(freshnessFloor);
      }
      expect(
        (await readFile(path.join(producedArtifactRoot, "opening-frame.png")))
          .subarray(0, 8)
          .toString("hex"),
      ).toBe("89504e470d0a1a0a");
      expect(detail?.world).toMatchObject({
        status: "failed",
        captureStatus: "passed",
        triviewStatus: "failed",
        whiteboxOutcome: "passed",
        whiteboxRuntimeAvailable: true,
        previewUrl: `/play?authoring=1&world=${created.id}`,
      });
      expect(
        await fetch(`${origin}/api/worlds/${created.id}/preview-bootstrap`)
          .then((response) => response.status),
      ).toBe(200);
    } finally {
      await studio.shutdown();
    }
  }, 60_000);
});
