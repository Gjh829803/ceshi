import {
  hashBabylonNativeSceneContributionV1,
  hashFormalSemanticCaptureMapV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalWorldCaptureRequestV1,
  parseFormalWorldCaptureReceiptV1,
  validateWhiteboxTriviewManifestV1,
  type VisualCaptureGroupV1,
  type FormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import {
  sha256CanonicalJson,
  sha256Bytes,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
  type WorldPackageWorldBoundsV1,
} from "@whitebox-world/world-package";
import {
  createBabylonNativeBlockWorldPackageTestInputV1,
} from "@whitebox-world/world-package/testing";
import {
  mkdtemp,
  mkdir,
  lstat,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG as PngImage } from "pngjs";
import { deriveNativeFormalWorldCaptureBoundsV1 } from "./formal-capture-bounds.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createDefaultTransportStarter } = vi.hoisted(() => ({
  createDefaultTransportStarter: vi.fn(),
}));

vi.mock("./hosted-session-capture.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("./hosted-session-capture.js")
  >();
  return {
    ...actual,
    createCaptureOnlyHostedTransportStarterV1: createDefaultTransportStarter,
  };
});

import {
  assertFormalCaptureRequestMatchesVerifiedPackageV1,
  captureHostedWorldPackageV1,
  openingCompositionGateBlocksPublicationV1,
  publishFormalCaptureDirectoryV1,
  publishRejectedCaptureDirectoryV1,
} from "./formal-capture.js";
import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { createEvidenceSetFixtureInputV1 } from "./evaluate-fixture.test-support.js";

const temporaryRoots: string[] = [];
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

afterEach(async () => {
  createDefaultTransportStarter.mockReset();
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

function packageAndRequest(worldBounds?: WorldPackageWorldBoundsV1): Readonly<{
  verifiedPackage: Extract<
    ReturnType<typeof verifyWorldPackageDirectoryV1>,
    { kind: "babylon-native-scene" }
  >;
  request: FormalWorldCaptureRequestV1;
}> {
  const baseInput = { ...createBabylonNativeBlockWorldPackageTestInputV1(),
    ...(worldBounds === undefined ? {} : { worldBounds }) };
  const baseMetadata = baseInput.nativeBlockMaterializerMetadata!;
  const nativeSceneContribution = {
    ...baseInput.nativeSceneContribution,
    profileSettlement: {
      ...baseInput.nativeSceneContribution.profileSettlement,
      targetCount: 3,
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
      frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "ridge-group",
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
    kind: "reach-position",
    checkpointId: "ground-checkpoint",
    expectation: "reach",
    sourceVisualGroupId: group.visualGroupId,
    standPositionMetersXYZ: [0, 0, 0] as const,
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  }] as const;
  const semanticCaptureMap = {
    kind: "formal-semantic-capture-map",
    schemaVersion: 1,
    id: "package-fixture.semantic-capture-map",
    caseRef: "artifact://world-reconstruction-case/package-fixture/case.json",
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
      viewRequirements: [
        { viewId: "opening", mode: "reference-projection-required" },
        { viewId: "world-side", mode: "presence-required" },
        { viewId: "world-top-down", mode: "presence-required" },
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
  const worldBoundsMeters = deriveNativeFormalWorldCaptureBoundsV1(metadata);
  const { minimumMetersXYZ, maximumMetersXYZ } = worldBoundsMeters;
  const centerX = (minimumMetersXYZ[0] + maximumMetersXYZ[0]) / 2;
  const centerY = (minimumMetersXYZ[1] + maximumMetersXYZ[1]) / 2;
  const centerZ = (minimumMetersXYZ[2] + maximumMetersXYZ[2]) / 2;
  const viewport = {
    widthPixels: 320,
    heightPixels: 180,
    devicePixelRatio: 1,
  } as const;
  const source = verifiedPackage.manifest.sceneSource;
  const request = parseFormalWorldCaptureRequestV1({
    kind: "formal-world-capture-request",
    visualCaptureGroups: [],
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
      cameraPositionMetersXYZ: [maximumMetersXYZ[0] + 20, centerY, centerZ],
      targetMetersXYZ: [centerX, centerY, centerZ],
    }, {
      kind: "formal-artifact-view-request",
      schemaVersion: 1,
      viewId: "world-top-down",
      projection: "orthographic",
      ...viewport,
      worldBoundsMeters,
      cameraPositionMetersXYZ: [centerX, maximumMetersXYZ[1] + 20, centerZ],
      targetMetersXYZ: [centerX, centerY, centerZ],
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
  it("keeps Opening Composition advisory for report-only publication", () => {
    expect(openingCompositionGateBlocksPublicationV1({
      executionPurpose: "strict-acceptance",
      qualityGateMode: "report-only",
      gateStatus: "failed",
    })).toBe(false);
    expect(openingCompositionGateBlocksPublicationV1({
      executionPurpose: "strict-acceptance",
      qualityGateMode: "required-for-publication",
      gateStatus: "failed",
    })).toBe(true);
    expect(openingCompositionGateBlocksPublicationV1({
      executionPurpose: "strict-acceptance",
      qualityGateMode: "required-for-publication",
      gateStatus: "passed",
    })).toBe(false);
  });

  it.each(["report-only", "required-for-publication"] as const)("ordinary Capture cannot be made stricter by a %s Profile", (qualityGateMode) => {
    for (const gateStatus of ["passed", "failed"] as const) {
      expect(openingCompositionGateBlocksPublicationV1({
        executionPurpose: "production", qualityGateMode, gateStatus,
      })).toBe(false);
    }
  });

  it("reports invalid output topology as pre-launch with no Hosted cleanup", async () => {
    const startTransport = vi.fn();

    await expect(captureHostedWorldPackageV1({
      packageDirectoryPath: "/tmp/formal-capture-package",
      outputPath: "/tmp/opening.png",
      triviewOutputPath: "/tmp/formal-capture-output",
    }, { startTransport })).rejects.toMatchObject({
      name: "FormalCaptureCommandClosedErrorV1",
      stage: "pre-launch",
      cleanupOutcomes: {
        hostedBrowserSession: "not-started",
        viteServer: "not-started",
      },
    });
    expect(startTransport).not.toHaveBeenCalled();
  });

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

  it("binds both top and side Capture to checked visuals, not Package container margins", () => {
    const { verifiedPackage, request } = packageAndRequest({
      centerMetersXZ: [97.5, 20], sizeMetersXZ: [215, 130], heightRangeMeters: [-66, 50],
    });
    expect(() => assertFormalCaptureRequestMatchesVerifiedPackageV1({ verifiedPackage, request })).not.toThrow();
    const staleBounds = {
      minimumMetersXYZ: [-64, -16, -96], maximumMetersXYZ: [64, 64, 32],
    } as const;
    for (const views of [
      [request.views[0], { ...request.views[1], worldBoundsMeters: staleBounds }, request.views[2]],
      [request.views[0], request.views[1], { ...request.views[2], worldBoundsMeters: staleBounds }],
    ] as const) {
      expect(() => assertFormalCaptureRequestMatchesVerifiedPackageV1({ verifiedPackage,
        request: { ...request, views },
      })).toThrow("FORMAL_CAPTURE_PACKAGE_REQUEST_MISMATCH");
    }
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
    }, { startTransport })).rejects.toMatchObject({
      name: "FormalCaptureCommandClosedErrorV1",
      stage: "pre-launch",
      cleanupOutcomes: {
        hostedBrowserSession: "not-started",
        viteServer: "not-started",
      },
    });
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
    const cleanup = vi.fn(async () => ({
      hostedBrowserSession: "completed" as const,
      viteServer: "completed" as const,
    }));

    await expect(captureHostedWorldPackageV1({
      packageDirectoryPath,
      outputPath: path.join(outputDirectoryPath, "opening.png"),
      triviewOutputPath: outputDirectoryPath,
    }, {
      startTransport: async () => ({
        executeFormalCapture: async () => Object.freeze({}) as never,
        dispose: cleanup,
      }),
    })).rejects.toMatchObject({
      name: "FormalCaptureCommandClosedErrorV1",
      stage: "post-dispose",
      cleanupOutcomes: {
        hostedBrowserSession: "completed",
        viteServer: "completed",
      },
    });
    expect(cleanup).toHaveBeenCalledOnce();
    await expect(readdir(outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("uses the concrete capture-only Hosted starter by default", async () => {
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
    const sentinel = new Error("concrete starter reached");
    createDefaultTransportStarter.mockReturnValueOnce(async () => {
      throw sentinel;
    });

    await expect(captureHostedWorldPackageV1({
      packageDirectoryPath,
      outputPath: path.join(outputDirectoryPath, "opening.png"),
      triviewOutputPath: outputDirectoryPath,
      port: 6_123,
    })).rejects.toMatchObject({
      name: "FormalCaptureCommandClosedErrorV1",
      stage: "hosted-session",
      cleanupOutcomes: {
        hostedBrowserSession: "failed",
        viteServer: "failed",
      },
      cause: expect.objectContaining({ cause: sentinel }),
    });
    expect(createDefaultTransportStarter).toHaveBeenCalledWith({
      packageDirectoryPath,
      port: 6_123,
    });
    await expect(readdir(outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("formal Capture artifact publication", () => {
  async function triviewFixture(isSecondTargetEmpty = false) {
    const root = await mkdtemp(path.join(tmpdir(), "formal-triview-publication-"));
    temporaryRoots.push(root);
    const source = createEvidenceSetFixtureInputV1();
    const base = source.captureReceipt;
    const metadata = source.verifiedWorldPackage.nativeBlockMaterializerMetadata!;
    const nativeGroup = metadata.visualGroups[0]!;
    const visualCaptureGroups: VisualCaptureGroupV1[] = [{
      visualTargetId: "visual-target-1", runtimeEntityIds: [source.verifiedWorldPackage.worldRuntimeBootstrap.initialControlledEntityId],
      frontDirectionWorldXZ: [0, -1], role: "primary-subject", semanticClassId: "subject.player", identityColor: "#E85D5D",
    }, {
      visualTargetId: "visual-target-2", runtimeEntityIds: metadata.blocks.filter(block => nativeGroup.blockIds.includes(block.blockId)).map(block => block.runtimeEntityId),
      frontDirectionWorldXZ: nativeGroup.frontDirectionWorldXZ, role: "primary-landmark",
      semanticClassId: nativeGroup.semanticClassId, identityColor: nativeGroup.identityColorHex,
    }];
    const formalRequest = parseFormalWorldCaptureRequestV1({ ...base.formalRequest, visualCaptureGroups });
    const whiteboxTriviewPngs = visualCaptureGroups.map((_, index) => {
      const png = new PngImage({ width: Math.floor(formalRequest.views[0].widthPixels / 3) * 3, height: formalRequest.views[0].heightPixels });
      png.data.fill(255);
      if (isSecondTargetEmpty && index === 1) {
        for (let y = 0; y < png.height; y++) for (let x = png.width / 3; x < png.width * 2 / 3; x++) {
          png.data.set([221, 232, 238, 255], (y * png.width + x) * 4);
        }
      }
      return PngImage.sync.write(png);
    });
    const captureBase = formalRequest.formalRequestRef.replace(/formal-world-capture-request.json$/, "capture");
    const receipt = parseFormalWorldCaptureReceiptV1({ ...base, formalRequest,
      formalRequestHash: hashFormalWorldCaptureRequestV1(formalRequest),
      whiteboxTriviews: visualCaptureGroups.map((group, index) => ({ visualTargetId: group.visualTargetId,
        pngArtifactRef: `${captureBase}/triviews/${group.visualTargetId}/whitebox-triview.png`,
        pngContentHash: sha256Bytes(whiteboxTriviewPngs[index]!),
      })),
    });
    const json = new TextEncoder().encode("{}");
    return { root, receipt, input: {
      outputDirectoryPath: path.join(root, "capture"), receiptJson: new TextEncoder().encode(JSON.stringify(receipt)),
      artifacts: { whiteboxTriviewPngs, openingPng: PNG, worldSidePng: PNG, worldTopDownPng: PNG,
        openingIdentityMaskPng: PNG, worldSideIdentityMaskPng: PNG, worldTopDownIdentityMaskPng: PNG,
        colliderOverlayPng: PNG, openingObservationJson: json, semanticViewObservationSetJson: json,
        spawnSupportObservationJson: json, colliderOverlayObservationJson: json, scriptedTraversalJson: json },
      budget: { maximumPngBytesPerArtifact: 1_000_000, maximumJsonBytesPerArtifact: 128_000 },
    } };
  }

  it("publishes requested Native/Subject tri-views with exact identities and receipt last", async () => {
    const { input, receipt } = await triviewFixture();
    const writes: string[] = [];
    await publishFormalCaptureDirectoryV1({ ...input, hooks: { beforeWrite: async file => { writes.push(file); } } });
    const manifest = JSON.parse(await readFile(path.join(input.outputDirectoryPath, "triviews/whitebox-triview-manifest.json"), "utf8"));
    expect(validateWhiteboxTriviewManifestV1(manifest)).toEqual([]);
    expect(manifest.whiteboxTriviews.map((row: { runtimeEntityIds: string[] }) => row.runtimeEntityIds))
      .toEqual(receipt.formalRequest.visualCaptureGroups.map(row => row.runtimeEntityIds));
    for (const [index, row] of receipt.whiteboxTriviews.entries()) {
      const bytes = await readFile(path.join(input.outputDirectoryPath, "triviews", row.visualTargetId, "whitebox-triview.png"));
      expect(bytes).toEqual(input.artifacts.whiteboxTriviewPngs[index]);
      expect(sha256Bytes(bytes)).toBe(row.pngContentHash);
    }
    expect(writes.at(-1)).toBe("formal-world-capture-receipt.json");
  });

  it.each(["missing", "hash", "path", "write"])("does not publish a %s tri-view delivery", async failure => {
    const { input, receipt, root } = await triviewFixture();
    if (failure === "missing") input.artifacts.whiteboxTriviewPngs.pop();
    if (failure === "hash") input.artifacts.whiteboxTriviewPngs[1] = Buffer.from(PNG);
    if (failure === "path") input.receiptJson = new TextEncoder().encode(JSON.stringify({ ...receipt,
      whiteboxTriviews: receipt.whiteboxTriviews.map(row => ({ ...row, pngArtifactRef: `${row.pngArtifactRef}.foreign` })),
    }));
    await expect(publishFormalCaptureDirectoryV1({ ...input, hooks: { beforeWrite: async file => {
      if (failure === "write" && file === "triviews/visual-target-2/whitebox-triview.png") throw new Error("write interrupted");
    } } })).rejects.toThrow();
    await expect(lstat(input.outputDirectoryPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(root)).toEqual([]);
  });

  it("retains failed-panel PNG/report without accepted images or a formal receipt", async () => {
    const { input } = await triviewFixture(true);
    await expect(publishFormalCaptureDirectoryV1(input)).rejects.toThrow("WORLDKIT_CAPTURE_TRIVIEW_EMPTY");
    const failed = path.join(input.outputDirectoryPath, "triviews/.failed/visual-target-2");
    expect(await readFile(path.join(failed, "whitebox-triview.png"))).toEqual(input.artifacts.whiteboxTriviewPngs[1]);
    expect(JSON.parse(await readFile(path.join(failed, "capture-failure.json"), "utf8"))).toMatchObject({
      inspection: { isRenderable: false }, diagnostic: { code: "WORLDKIT_CAPTURE_TRIVIEW_EMPTY" },
    });
    await expect(lstat(path.join(input.outputDirectoryPath, "formal-world-capture-receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(path.join(input.outputDirectoryPath, "triviews/visual-target-1"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves requested tri-views on opening rejection without an accepted receipt", async () => {
    const { input } = await triviewFixture(true);
    await publishRejectedCaptureDirectoryV1({ ...input, openingGateResult: {
      kind: "worldkit-opening-composition-host-gate", schemaVersion: 1, status: "failed", diagnostics: [],
    } });
    expect(await readFile(path.join(input.outputDirectoryPath, "triviews/visual-target-2/whitebox-triview.png")))
      .toEqual(input.artifacts.whiteboxTriviewPngs[1]);
    await expect(lstat(path.join(input.outputDirectoryPath, "formal-world-capture-receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("atomically preserves a rejected Candidate without a formal receipt", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "formal-capture-test-"));
    temporaryRoots.push(root);
    const outputDirectoryPath = path.join(root, "rejected-capture");
    await publishRejectedCaptureDirectoryV1({
      receiptJson: new TextEncoder().encode(JSON.stringify(createEvidenceSetFixtureInputV1().captureReceipt)),
      outputDirectoryPath,
      artifacts: {
        whiteboxTriviewPngs: [],
        openingPng: PNG,
        worldSidePng: PNG,
        worldTopDownPng: PNG,
        openingIdentityMaskPng: PNG, worldSideIdentityMaskPng: PNG, worldTopDownIdentityMaskPng: PNG,
        colliderOverlayPng: PNG,
        openingObservationJson: new TextEncoder().encode("{}"),
        semanticViewObservationSetJson: new TextEncoder().encode("{}"),
        spawnSupportObservationJson: new TextEncoder().encode("{}"),
        colliderOverlayObservationJson: new TextEncoder().encode("{}"),
        scriptedTraversalJson: new TextEncoder().encode("{}"),
      },
      openingGateResult: {
        kind: "worldkit-opening-composition-host-gate",
        schemaVersion: 1,
        status: "failed",
        diagnostics: [{
          code: "WORLDKIT_OPENING_GATE_REGION_DRIFT",
          targetRef: "worldkit://composition-target/fixture@1",
          metricId: "normalizedBounds.maxYBasisPoints",
          expectedValue: 7_600,
          actualValue: 10_000,
          allowedDeviation: 1_000,
          exceededBy: 1_400,
          correctionDirection: "decrease",
        }],
      },
      budget: {
        maximumPngBytesPerArtifact: PNG.byteLength,
        maximumJsonBytesPerArtifact: 128_000,
      },
    });

    expect(await readdir(outputDirectoryPath)).toEqual([
      "collider-overlay-observation.json",
      "collider-overlay.png",
      "opening-composition-gate-result.json",
      "opening-identity-mask.png",
      "opening-observation.json",
      "opening.png",
      "scripted-traversal.json",
      "semantic-view-observation-set.json",
      "spawn-support-observation.json",
      "world-side-identity-mask.png",
      "world-side.png",
      "world-top-down-identity-mask.png",
      "world-top-down.png",
    ]);
    await expect(readFile(path.join(
      outputDirectoryPath,
      "formal-world-capture-receipt.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(path.join(
      outputDirectoryPath,
      "opening-composition-gate-result.json",
    ), "utf8"))).toMatchObject({
      status: "failed",
      diagnostics: [{
        code: "WORLDKIT_OPENING_GATE_REGION_DRIFT",
        metricId: "normalizedBounds.maxYBasisPoints",
        expectedValue: 7_600,
        actualValue: 10_000,
        allowedDeviation: 1_000,
        exceededBy: 1_400,
        correctionDirection: "decrease",
      }],
    });
  });

  it("removes partial rejected-Candidate staging when publication fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "formal-capture-test-"));
    temporaryRoots.push(root);
    const outputDirectoryPath = path.join(root, "rejected-capture");
    await expect(publishRejectedCaptureDirectoryV1({
      receiptJson: new TextEncoder().encode(JSON.stringify(createEvidenceSetFixtureInputV1().captureReceipt)),
      outputDirectoryPath,
      artifacts: {
        whiteboxTriviewPngs: [],
        openingPng: PNG,
        worldSidePng: PNG,
        worldTopDownPng: PNG,
        openingIdentityMaskPng: PNG, worldSideIdentityMaskPng: PNG, worldTopDownIdentityMaskPng: PNG,
        colliderOverlayPng: PNG,
        openingObservationJson: new TextEncoder().encode("{}"),
        semanticViewObservationSetJson: new TextEncoder().encode("{}"),
        spawnSupportObservationJson: new TextEncoder().encode("{}"),
        colliderOverlayObservationJson: new TextEncoder().encode("{}"),
        scriptedTraversalJson: new TextEncoder().encode("{}"),
      },
      openingGateResult: {
        kind: "worldkit-opening-composition-host-gate",
        schemaVersion: 1,
        status: "failed",
        diagnostics: [{ code: "WORLDKIT_OPENING_GATE_TARGET_MISSING" }],
      },
      budget: {
        maximumPngBytesPerArtifact: PNG.byteLength,
        maximumJsonBytesPerArtifact: 128_000,
      },
      hooks: {
        beforeWrite: async (relativePath) => {
          if (relativePath === "opening-composition-gate-result.json") {
            throw new Error("rejected evidence write failed");
          }
        },
      },
    })).rejects.toThrow("rejected evidence write failed");
    await expect(lstat(outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await readdir(root)).filter((name) =>
      name.includes("rejected-capture-")
    )).toEqual([]);
  });

  it("publishes all thirteen artifacts with the receipt written last", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "formal-capture-test-"));
    temporaryRoots.push(root);
    const outputDirectoryPath = path.join(root, "capture");
    const writeOrder: string[] = [];
    await publishFormalCaptureDirectoryV1({
      outputDirectoryPath,
      artifacts: {
        whiteboxTriviewPngs: [],
        openingPng: PNG,
        worldSidePng: PNG,
        worldTopDownPng: PNG,
        openingIdentityMaskPng: PNG, worldSideIdentityMaskPng: PNG, worldTopDownIdentityMaskPng: PNG,
        colliderOverlayPng: PNG,
        openingObservationJson: new TextEncoder().encode("{}"),
        semanticViewObservationSetJson: new TextEncoder().encode("{}"),
        spawnSupportObservationJson: new TextEncoder().encode("{}"),
        colliderOverlayObservationJson: new TextEncoder().encode("{}"),
        scriptedTraversalJson: new TextEncoder().encode("{}"),
      },
      receiptJson: new TextEncoder().encode(JSON.stringify(createEvidenceSetFixtureInputV1().captureReceipt)),
      budget: {
        maximumPngBytesPerArtifact: PNG.byteLength,
        maximumJsonBytesPerArtifact: 128_000,
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
      "opening-identity-mask.png",
      "opening-observation.json",
      "opening.png",
      "scripted-traversal.json",
      "semantic-view-observation-set.json",
      "spawn-support-observation.json",
      "world-side-identity-mask.png",
      "world-side.png",
      "world-top-down-identity-mask.png",
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
        whiteboxTriviewPngs: [],
        openingPng: PNG,
        worldSidePng: PNG,
        worldTopDownPng: PNG,
        openingIdentityMaskPng: PNG, worldSideIdentityMaskPng: PNG, worldTopDownIdentityMaskPng: PNG,
        colliderOverlayPng: PNG,
        openingObservationJson: new TextEncoder().encode("{}"),
        semanticViewObservationSetJson: new TextEncoder().encode("{}"),
        spawnSupportObservationJson: new TextEncoder().encode("{}"),
        colliderOverlayObservationJson: new TextEncoder().encode("{}"),
        scriptedTraversalJson: new TextEncoder().encode("{}"),
      },
      receiptJson: new TextEncoder().encode(JSON.stringify(createEvidenceSetFixtureInputV1().captureReceipt)),
      budget: {
        maximumPngBytesPerArtifact: PNG.byteLength,
        maximumJsonBytesPerArtifact: 128_000,
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
        whiteboxTriviewPngs: [],
        openingPng: new Uint8Array([...PNG, 0]),
        worldSidePng: PNG,
        worldTopDownPng: PNG,
        openingIdentityMaskPng: PNG, worldSideIdentityMaskPng: PNG, worldTopDownIdentityMaskPng: PNG,
        colliderOverlayPng: PNG,
        openingObservationJson: new TextEncoder().encode("{}"),
        semanticViewObservationSetJson: new TextEncoder().encode("{}"),
        spawnSupportObservationJson: new TextEncoder().encode("{}"),
        colliderOverlayObservationJson: new TextEncoder().encode("{}"),
        scriptedTraversalJson: new TextEncoder().encode("{}"),
      },
      receiptJson: new TextEncoder().encode(JSON.stringify(createEvidenceSetFixtureInputV1().captureReceipt)),
      budget: {
        maximumPngBytesPerArtifact: PNG.byteLength,
        maximumJsonBytesPerArtifact: 128_000,
      },
      hooks: { beforeWrite: vi.fn(async () => undefined) },
    })).rejects.toThrow("FORMAL_CAPTURE_PNG_BUDGET_EXCEEDED");
    await expect(readdir(outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
