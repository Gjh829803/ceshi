import {
  hashBabylonNativeSceneContributionV1,
  hashFormalSemanticCaptureMapV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalWorldCaptureRequestV1,
  type FormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import {
  createBabylonNativeBlockWorldPackageTestInputV1,
} from "@whitebox-world/world-package/testing";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertFormalCaptureRequestMatchesVerifiedPackageV1,
  captureHostedWorldPackageV1,
  publishFormalCaptureDirectoryV1,
} from "./formal-capture.js";
import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";

const temporaryRoots: string[] = [];
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

function packageAndRequest(): Readonly<{
  verifiedPackage: Extract<
    ReturnType<typeof verifyWorldPackageDirectoryV1>,
    { kind: "babylon-native-scene" }
  >;
  request: FormalWorldCaptureRequestV1;
}> {
  const baseInput = createBabylonNativeBlockWorldPackageTestInputV1();
  const baseMetadata = baseInput.nativeBlockMaterializerMetadata!;
  const nativeSceneContribution = {
    ...baseInput.nativeSceneContribution,
    profileSettlement: {
      ...baseInput.nativeSceneContribution.profileSettlement,
      targetCount: 2,
    },
  } as typeof baseInput.nativeSceneContribution;
  const nativeBlockMaterializerMetadata = {
    ...baseMetadata,
    contributionHash:
      hashBabylonNativeSceneContributionV1(nativeSceneContribution),
    blocks: [...baseMetadata.blocks, {
      blockId: "ridge-block",
      runtimeEntityId: "native-block:ridge-block",
      semanticCaptureClassId: "worldkit.native-block.group.ridge-group",
      shape: "full" as const,
      paletteRole: "structure" as const,
      visualGroupId: "ridge-group",
      centerMetersXYZ: [0, 1, 4] as const,
      rotationQuarterTurnsY: 0 as const,
      sizeMetersXYZ: [2, 2, 2] as const,
    }],
    visualGroups: [...baseMetadata.visualGroups, {
      visualGroupId: "ridge-group",
      acceptanceTargetRef:
        "worldkit://acceptance-target/package-fixture-secondary@1",
      semanticClassId: "structure.fixture",
      identityColorHex: "#AA0002" as const,
      blockIds: ["ridge-block"],
      paletteRoles: ["structure" as const],
      minimumMetersXYZ: [-1, 0, 3] as const,
      maximumMetersXYZ: [1, 2, 5] as const,
    }],
  };
  const directory = createBabylonNativeWorldPackageV1({
    ...baseInput,
    nativeSceneContribution,
    nativeBlockMaterializerMetadata,
  });
  const verifiedPackage = verifyWorldPackageDirectoryV1(directory);
  if (verifiedPackage.kind !== "babylon-native-scene") {
    throw new Error("expected Native Package fixture");
  }
  const metadata = verifiedPackage.nativeBlockMaterializerMetadata!;
  const group = metadata.visualGroups[0]!;
  const secondaryGroup = metadata.visualGroups[1]!;
  const fixedInputSequence = [{ actions: [], ticks: 1 }] as const;
  const checkpointCriteria = [{
    kind: "reach-bounds",
    checkpointId: "ground-checkpoint",
    expectation: "reach",
    sourceVisualGroupId: group.visualGroupId,
    sourceBoundsMeters: {
      minimumMetersXYZ: group.minimumMetersXYZ,
      maximumMetersXYZ: group.maximumMetersXYZ,
    },
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  }] as const;
  const semanticCaptureMap = {
    kind: "formal-semantic-capture-map",
    schemaVersion: 1,
    id: "package-fixture.semantic-capture-map",
    caseRef: "worldkit://world-reconstruction-case/package-fixture@1",
    caseHash: metadata.caseHash,
    authoringManifestHash: metadata.authoringManifestHash,
    layoutInventoryHash: metadata.checkedLayoutInventoryHash,
    contributionHash: metadata.contributionHash,
    bindings: [group, secondaryGroup].map((visualGroup, index) => ({
      acceptanceTargetRef: visualGroup.acceptanceTargetRef,
      compositionTargetRef: index === 0
        ? "worldkit://composition-target/package-fixture-opening@1"
        : "worldkit://composition-target/package-fixture-secondary@1",
      topologyNodeId: index === 0
        ? "package-fixture-opening"
        : "package-fixture-secondary",
      semanticLayerId: index === 0 ? "ground" : "upper",
      blockVisualGroupId: visualGroup.visualGroupId,
      semanticClassId: visualGroup.semanticClassId,
      identityColor: visualGroup.identityColorHex,
      projectedBoundsSource: "checked-layout-visual-group" as const,
      requiredWorldViewIds: [
        "opening",
        "world-side",
        "world-top-down",
      ] as const,
      authoringManifestHash: metadata.authoringManifestHash,
      layoutInventoryHash: metadata.checkedLayoutInventoryHash,
      contributionHash: metadata.contributionHash,
    })),
    topologyRelations: [{
      fromNodeId: "package-fixture-opening",
      relation: "connects-to",
      toNodeId: "package-fixture-secondary",
      measurementSource: "package-bounds",
      fromVisualGroupId: group.visualGroupId,
      toVisualGroupId: secondaryGroup.visualGroupId,
    }],
    traversalCheckBindings: [{
      traversalCheckId: "ground-check",
      acceptanceTargetRef: group.acceptanceTargetRef,
      checkExpectation: "pass",
      fixedInputSequenceHash: sha256CanonicalJson(fixedInputSequence),
      checkpointCriteria,
    }],
  } as const;
  const manifestBounds = verifiedPackage.manifest.worldBounds;
  const minimumMetersXYZ = [
    manifestBounds.centerMetersXZ[0] - manifestBounds.sizeMetersXZ[0] / 2,
    manifestBounds.heightRangeMeters[0],
    manifestBounds.centerMetersXZ[1] - manifestBounds.sizeMetersXZ[1] / 2,
  ] as const;
  const maximumMetersXYZ = [
    manifestBounds.centerMetersXZ[0] + manifestBounds.sizeMetersXZ[0] / 2,
    manifestBounds.heightRangeMeters[1],
    manifestBounds.centerMetersXZ[1] + manifestBounds.sizeMetersXZ[1] / 2,
  ] as const;
  const worldBoundsMeters = { minimumMetersXYZ, maximumMetersXYZ } as const;
  const centerY = (minimumMetersXYZ[1] + maximumMetersXYZ[1]) / 2;
  const viewport = {
    widthPixels: 320,
    heightPixels: 180,
    devicePixelRatio: 1,
  } as const;
  const source = verifiedPackage.manifest.sceneSource;
  const request = parseFormalWorldCaptureRequestV1({
    kind: "formal-world-capture-request",
    schemaVersion: 1,
    id: "package-fixture.formal-capture-request",
    formalRequestRef:
      "artifact://case/package-fixture/attempts/0/formal-world-capture-request.json",
    caseRef: semanticCaptureMap.caseRef,
    caseHash: metadata.caseHash,
    evaluationProfileRef:
      "artifact://case/package-fixture/evaluation-profile.json",
    evaluationProfileHash: `sha256:${"8".repeat(64)}`,
    sceneAuthoringRouteDecisionRef:
      verifiedPackage.sceneAuthoringAttempt.sceneAuthoringRouteDecisionRef,
    sceneAuthoringRouteDecisionHash: source.sceneAuthoringRouteDecisionHash,
    sceneAuthoringAttemptRef:
      verifiedPackage.sceneAuthoringAttemptResult.sceneAuthoringAttemptRef,
    sceneAuthoringAttemptHash: source.sceneAuthoringAttemptHash,
    sceneAuthoringAttemptResultRef: source.sceneAuthoringAttemptResultRef,
    sceneAuthoringAttemptResultHash: source.sceneAuthoringAttemptResultHash,
    worldPackageRef: verifiedPackage.receipt.worldPackageRef,
    worldPackageRootHash: verifiedPackage.receipt.worldPackageRootHash,
    worldBuildIdentityRef:
      "world-package://world-build-identity.json",
    worldBuildIdentityHash: verifiedPackage.receipt.worldBuildIdentityHash,
    worldPackageBuildReceiptRef:
      "world-package://world-package-build-receipt.json",
    worldPackageBuildReceiptHash: sha256CanonicalJson(verifiedPackage.receipt),
    semanticCaptureMapRef:
      "artifact://case/package-fixture/attempts/0/semantic-capture-map.json",
    semanticCaptureMap,
    semanticCaptureMapHash:
      hashFormalSemanticCaptureMapV1(semanticCaptureMap),
    nativeBlockMaterializerMetadataRef:
      "world-package://native/block-materializer-metadata.json",
    nativeBlockMaterializerMetadataHash: source.nativeMaterializer.kind ===
        "babylon-native-block"
      ? source.nativeMaterializer.metadataHash
      : `sha256:${"0".repeat(64)}`,
    views: [{
      kind: "formal-artifact-view-request",
      schemaVersion: 1,
      viewId: "opening",
      projection: "perspective",
      ...viewport,
    }, {
      kind: "formal-artifact-view-request",
      schemaVersion: 1,
      viewId: "world-side",
      projection: "orthographic",
      ...viewport,
      worldBoundsMeters,
      cameraPositionMetersXYZ: [maximumMetersXYZ[0] + 20, centerY, 0],
      targetMetersXYZ: [0, centerY, 0],
    }, {
      kind: "formal-artifact-view-request",
      schemaVersion: 1,
      viewId: "world-top-down",
      projection: "orthographic",
      ...viewport,
      worldBoundsMeters,
      cameraPositionMetersXYZ: [0, maximumMetersXYZ[1] + 20, 0],
      targetMetersXYZ: [0, centerY, 0],
    }],
    colliderOverlay: {
      kind: "formal-collider-overlay-request",
      schemaVersion: 1,
      isRequired: true,
      contributionHash: metadata.contributionHash,
    },
    scriptedTraversal: {
      kind: "formal-scripted-traversal-request",
      schemaVersion: 1,
      checks: [{
        id: "ground-check",
        acceptanceTargetRef: group.acceptanceTargetRef,
        checkExpectation: "pass",
        fixedInputSequence,
        fixedInputSequenceHash: sha256CanonicalJson(fixedInputSequence),
        checkpointCriteria,
      }],
    },
  });
  return Object.freeze({ verifiedPackage, request });
}

describe("formal Package Capture preflight join", () => {
  it("joins the complete parsed request to one verified block Package", () => {
    const { verifiedPackage, request } = packageAndRequest();
    expect(assertFormalCaptureRequestMatchesVerifiedPackageV1({
      verifiedPackage,
      request,
    })).toEqual({
      verifiedPackage,
      request,
      formalRequestHash: hashFormalWorldCaptureRequestV1(request),
    });
  });

  it("rejects stale Package identity and unbound visual groups", () => {
    const { verifiedPackage, request } = packageAndRequest();
    expect(() => assertFormalCaptureRequestMatchesVerifiedPackageV1({
      verifiedPackage,
      request: {
        ...request,
        worldBuildIdentityHash: `sha256:${"0".repeat(64)}`,
      } as FormalWorldCaptureRequestV1,
    })).toThrow("FORMAL_CAPTURE_PACKAGE_REQUEST_MISMATCH");

    const staleMap = {
      ...request.semanticCaptureMap,
      bindings: request.semanticCaptureMap.bindings.map((binding, index) => ({
        ...binding,
        blockVisualGroupId: index === 1
          ? "missing-group"
          : binding.blockVisualGroupId,
      })),
      topologyRelations: request.semanticCaptureMap.topologyRelations.map(
        (relation) => relation.measurementSource === "package-bounds"
          ? { ...relation, toVisualGroupId: "missing-group" }
          : relation,
      ),
    };
    expect(() => assertFormalCaptureRequestMatchesVerifiedPackageV1({
      verifiedPackage,
      request: {
        ...request,
        semanticCaptureMap: staleMap,
        semanticCaptureMapHash: hashFormalSemanticCaptureMapV1(staleMap),
      } as FormalWorldCaptureRequestV1,
    })).toThrow("FORMAL_CAPTURE_PACKAGE_REQUEST_MISMATCH");
  });

  it("rejects the Package and Request join before starting Hosted transport", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "formal-capture-test-")),
    );
    temporaryRoots.push(root);
    const attemptDirectoryPath = path.join(root, "attempt");
    const packageDirectoryPath = path.join(
      attemptDirectoryPath,
      "world-package",
    );
    const outputDirectoryPath = path.join(attemptDirectoryPath, "capture");
    const { verifiedPackage, request } = packageAndRequest();
    await mkdir(attemptDirectoryPath, { mode: 0o700 });
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: packageDirectoryPath,
      directory: verifiedPackage.directory,
    });
    await writeFile(
      path.join(attemptDirectoryPath, "formal-world-capture-request.json"),
      stringifyCanonicalJson({
        ...request,
        worldBuildIdentityHash: `sha256:${"0".repeat(64)}`,
      }),
      "utf8",
    );
    const startTransport = vi.fn(async () => {
      throw new Error("transport must not start");
    });

    await expect(captureHostedWorldPackageV1({
      packageDirectoryPath,
      outputPath: path.join(outputDirectoryPath, "opening.png"),
      triviewOutputPath: outputDirectoryPath,
    }, { startTransport })).rejects.toThrow(
      "FORMAL_CAPTURE_PACKAGE_REQUEST_MISMATCH",
    );
    expect(startTransport).not.toHaveBeenCalled();
    await expect(readdir(outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("cleans the Hosted transport and publishes nothing for an invalid payload", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "formal-capture-test-")),
    );
    temporaryRoots.push(root);
    const attemptDirectoryPath = path.join(root, "attempt");
    const packageDirectoryPath = path.join(
      attemptDirectoryPath,
      "world-package",
    );
    const outputDirectoryPath = path.join(attemptDirectoryPath, "capture");
    const { verifiedPackage, request } = packageAndRequest();
    await mkdir(attemptDirectoryPath, { mode: 0o700 });
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: packageDirectoryPath,
      directory: verifiedPackage.directory,
    });
    await writeFile(
      path.join(attemptDirectoryPath, "formal-world-capture-request.json"),
      stringifyCanonicalJson(request),
      "utf8",
    );
    const cleanup = vi.fn(async () => undefined);

    await expect(captureHostedWorldPackageV1({
      packageDirectoryPath,
      outputPath: path.join(outputDirectoryPath, "opening.png"),
      triviewOutputPath: outputDirectoryPath,
    }, {
      startTransport: async () => ({
        executeFormalCapture: async () => Object.freeze({}) as never,
        dispose: cleanup,
      }),
    })).rejects.toThrow();
    expect(cleanup).toHaveBeenCalledOnce();
    await expect(readdir(outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("formal Capture artifact publication", () => {
  it("publishes all nine artifacts with the receipt written last", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "formal-capture-test-"));
    temporaryRoots.push(root);
    const outputDirectoryPath = path.join(root, "capture");
    const writeOrder: string[] = [];
    await publishFormalCaptureDirectoryV1({
      outputDirectoryPath,
      artifacts: {
        openingPng: PNG,
        worldSidePng: PNG,
        worldTopDownPng: PNG,
        colliderOverlayPng: PNG,
        openingObservationJson: new TextEncoder().encode("{}"),
        spawnSupportObservationJson: new TextEncoder().encode("{}"),
        colliderOverlayObservationJson: new TextEncoder().encode("{}"),
        scriptedTraversalJson: new TextEncoder().encode("{}"),
      },
      receiptJson: new TextEncoder().encode('{"cleanupOutcome":"completed"}'),
      budget: {
        maximumPngBytesPerArtifact: PNG.byteLength,
        maximumJsonBytesPerArtifact: 1_024,
      },
      hooks: {
        beforeWrite: async (relativePath) => {
          writeOrder.push(relativePath);
        },
      },
    });

    expect(writeOrder.at(-1)).toBe("formal-world-capture-receipt.json");
    expect(await readdir(outputDirectoryPath)).toEqual([
      "collider-overlay-observation.json",
      "collider-overlay.png",
      "formal-world-capture-receipt.json",
      "opening-observation.json",
      "opening.png",
      "scripted-traversal.json",
      "spawn-support-observation.json",
      "world-side.png",
      "world-top-down.png",
    ]);
    expect(await readFile(path.join(
      outputDirectoryPath,
      "formal-world-capture-receipt.json",
    ), "utf8")).toContain('"completed"');
  });

  it("does not publish after a partial staging failure", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "formal-capture-test-"));
    temporaryRoots.push(root);
    const outputDirectoryPath = path.join(root, "capture");
    await expect(publishFormalCaptureDirectoryV1({
      outputDirectoryPath,
      artifacts: {
        openingPng: PNG,
        worldSidePng: PNG,
        worldTopDownPng: PNG,
        colliderOverlayPng: PNG,
        openingObservationJson: new TextEncoder().encode("{}"),
        spawnSupportObservationJson: new TextEncoder().encode("{}"),
        colliderOverlayObservationJson: new TextEncoder().encode("{}"),
        scriptedTraversalJson: new TextEncoder().encode("{}"),
      },
      receiptJson: new TextEncoder().encode("{}"),
      budget: {
        maximumPngBytesPerArtifact: PNG.byteLength,
        maximumJsonBytesPerArtifact: 1_024,
      },
      hooks: {
        beforeWrite: async (relativePath) => {
          if (relativePath === "spawn-support-observation.json") {
            throw new Error("staging write failed");
          }
        },
      },
    })).rejects.toThrow("staging write failed");
    await expect(readdir(outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("applies the PNG budget independently to each PNG artifact", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "formal-capture-test-"));
    temporaryRoots.push(root);
    const outputDirectoryPath = path.join(root, "capture");
    await expect(publishFormalCaptureDirectoryV1({
      outputDirectoryPath,
      artifacts: {
        openingPng: new Uint8Array([...PNG, 0]),
        worldSidePng: PNG,
        worldTopDownPng: PNG,
        colliderOverlayPng: PNG,
        openingObservationJson: new TextEncoder().encode("{}"),
        spawnSupportObservationJson: new TextEncoder().encode("{}"),
        colliderOverlayObservationJson: new TextEncoder().encode("{}"),
        scriptedTraversalJson: new TextEncoder().encode("{}"),
      },
      receiptJson: new TextEncoder().encode("{}"),
      budget: {
        maximumPngBytesPerArtifact: PNG.byteLength,
        maximumJsonBytesPerArtifact: 1_024,
      },
      hooks: { beforeWrite: vi.fn(async () => undefined) },
    })).rejects.toThrow("FORMAL_CAPTURE_PNG_BUDGET_EXCEEDED");
    await expect(readdir(outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
