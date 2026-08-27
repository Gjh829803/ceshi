import {
  normalizeAuthoringSpecV4,
  parseAuthoringSpecV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import { readFile } from "node:fs/promises";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  createWorldPackageV2,
  verifyWorldPackageDirectoryV2,
  type CreateWorldPackageV2Input,
  type ResolvedWorldPackageResourceArtifactV2,
} from "./index.js";
import basicWorldDocument from "../../../examples/authoring/basic-world.json";
import riggedWorldDocument from "../../../examples/authoring/rigged-subject-world.json";
import { resolveWorldPackageResourceArtifactsV2 } from "../../../scripts/lib/world-package-resource-resolver.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;

function authoringFixture(value: unknown): AuthoringSpecV4 {
  const validated = validateAuthoringSpecV4(value);
  if (!validated.ok || isNil(validated.value)) {
    throw new Error("fixture AuthoringSpecV4 is invalid");
  }
  return validated.value;
}

function trustedClosure(authoringSpec: AuthoringSpecV4) {
  const normalized = normalizeAuthoringSpecV4(authoringSpec);
  if (
    !normalized.ok ||
    isNil(normalized.value) ||
    isNil(normalized.normalizedWorldIrHash) ||
    isNil(normalized.layoutSolveReport) ||
    isNil(normalized.layoutSolveReportHash)
  ) {
    throw new Error("fixture normalization failed");
  }
  const gameplayBootstrap = createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: `${authoringSpec.id}.gameplay`,
    version: 1,
    resourceRef: `worldkit://gameplay-bootstrap/${authoringSpec.id}@1`,
    entityDescriptors: normalized.value.nodes
      .filter((node) => node.kind === "subject")
      .map((node) => {
        const definition = normalized.value!.resources.subjectDefinitions.find(
          (candidate) =>
            candidate.subjectDefinitionRef === node.subjectDefinitionRef,
        );
        if (isNil(definition)) throw new Error("fixture Subject Definition missing");
        return {
          id: node.id,
          entityDefinitionRef: node.subjectDefinitionRef,
          capabilityRefs: definition.capabilityRefs,
        };
      }),
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
  });
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
  });
  if (!compiled.ok || isNil(compiled.executionPlan)) {
    throw new Error("fixture compilation failed");
  }
  return {
    authoringSpec,
    normalizedWorldIr: normalized.value,
    layoutSolveResult: {
      status: normalized.layoutSolveReport.status,
      report: normalized.layoutSolveReport,
      layoutSolveReportHash: normalized.layoutSolveReportHash,
    },
    executionPlan: compiled.executionPlan,
    gameplayBootstrap,
  };
}

function baseInput(
  authoringSpec: AuthoringSpecV4 = authoringFixture(basicWorldDocument),
  resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV2[] = [],
): CreateWorldPackageV2Input {
  return {
    packageId: `${authoringSpec.id}.package`,
    title: "Basic World",
    sdkVersion: "0.0.0",
    distributionPolicy: "redistributable",
    canonicalAuthoringSchemaHash: HASH_A,
    aiSchemaProjectionProfile: {
      resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
      contentHash: HASH_B,
    },
    hostCompatibility: {
      profileRef: "worldkit://host-compatibility/babylon-web@1",
      profileHash: HASH_B,
      runtimeContractVersion: 1,
      requiredFeatureIds: ["runtime.full-reload-v1"],
    },
    ...trustedClosure(authoringSpec),
    resourceArtifacts,
    generatedResourceProvenance: {
      licenseDocumentId: "project-owned",
      licenseSpdxExpression: "LicenseRef-Project-Owned",
      redistributionPolicy: "allowed",
      author: "Agent Whitebox World SDK",
    },
    licenseDocuments: [{
      id: "project-owned",
      spdxLicenseExpression: "LicenseRef-Project-Owned",
      path: "LICENSES/project-owned.txt",
      text: "Project-owned fixture license. Redistribution allowed.\n",
    }],
    noticeText: "Basic World\nSee LICENSES/project-owned.txt.\n",
    includeAuthoringSpec: true,
  };
}

describe("createWorldPackageV2", () => {
  it("builds and self-verifies one deterministic complete legal package", () => {
    const input = baseInput();
    const first = createWorldPackageV2(input);
    const repeated = createWorldPackageV2(baseInput());
    const verified = verifyWorldPackageDirectoryV2(first);

    expect(repeated.receipt.worldPackageRootHash).toBe(
      first.receipt.worldPackageRootHash,
    );
    expect(verified.receipt.manifest).toMatchObject({
      schemaVersion: 2,
      title: "Basic World",
      legal: { distributionPolicy: "redistributable" },
    });
    expect(verified.receipt.manifest.lockedResources).toEqual(
      input.executionPlan.resourceLockEntries,
    );
    expect(first.files.find((file) => file.path === "NOTICE")?.bytes).toEqual(
      new TextEncoder().encode(baseInput().noticeText),
    );
    expect(first.files.find((file) =>
      file.path === "LICENSES/project-owned.txt"
    )?.bytes).toEqual(
      new TextEncoder().encode(baseInput().licenseDocuments[0]!.text),
    );
  });

  it("supports explicit AuthoringSpec omission without changing runtime closure", () => {
    const withAudit = createWorldPackageV2(baseInput());
    const withoutAudit = createWorldPackageV2({
      ...baseInput(),
      includeAuthoringSpec: false,
    });

    expect(withoutAudit.files.some((file) =>
      file.path === "authoring-spec.json"
    )).toBe(false);
    expect(withoutAudit.receipt.manifest.executionPlanHash).toBe(
      withAudit.receipt.manifest.executionPlanHash,
    );
    expect(withoutAudit.receipt.worldPackageRootHash).not.toBe(
      withAudit.receipt.worldPackageRootHash,
    );
  });

  it("binds exact real Subject Asset bytes and admitted legal provenance", async () => {
    const authoringSpec = authoringFixture(riggedWorldDocument);
    const bytes = new Uint8Array(await readFile(new URL(
      "../../../apps/playground/public/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
      import.meta.url,
    )));
    const resourceRef = "worldkit://subject-asset/humanoid.golden@2";
    const subjectAssetManifestHash = trustedClosure(authoringSpec)
      .normalizedWorldIr.resources.subjectAssets.find((asset) =>
        asset.subjectAssetRef === resourceRef
      )!.subjectAssetManifestHash;
    const directory = createWorldPackageV2(baseInput(authoringSpec, [{
      resourceRef,
      packagePath: "resources/subject-assets/humanoid.golden.glb",
      mediaType: "model/gltf-binary",
      bytes,
      subjectAssetManifestHash: subjectAssetManifestHash as `sha256:${string}`,
      licenseDocumentId: "project-owned",
      licenseSpdxExpression: "LicenseRef-Project-Owned",
      redistributionPolicy: "allowed",
      sourceUri: "worldkit-source://project-owned/humanoid.golden.glb",
      author: "Agent Whitebox World SDK",
    }]));
    const verified = verifyWorldPackageDirectoryV2(directory);

    expect(verified.resourceBytesByRef.get(resourceRef)).toEqual(bytes);
    expect(directory.receipt.manifest.resources.find((resource) =>
      resource.resourceRef === resourceRef
    )).toMatchObject({
      licenseDocumentId: "project-owned",
      redistributionPolicy: "allowed",
      sourceUri: "worldkit-source://project-owned/humanoid.golden.glb",
      author: "Agent Whitebox World SDK",
    });
  });

  it.each([
    "g-bot-subject-world.json",
    "xier120-subject-gallery.json",
  ])("builds the real internal-only %s package closure", async (fileName) => {
    const sourceText = await readFile(new URL(
      `../../../examples/authoring/${fileName}`,
      import.meta.url,
    ), "utf8");
    const parsed = parseAuthoringSpecV4(sourceText);
    if (!parsed.ok || isNil(parsed.value)) {
      throw new Error(`fixture parse failed: ${fileName}`);
    }
    const closure = trustedClosure(parsed.value);
    const manifests = closure.normalizedWorldIr.resources.subjectAssets.map(
      (asset) => builtInSubjectResourceRegistry.resolveSubjectAsset(
        asset.subjectAssetRef,
      )!,
    );
    const artifacts = await resolveWorldPackageResourceArtifactsV2(
      closure.normalizedWorldIr,
      {
        subjectAssetManifests: manifests,
        licenseDocuments: [{
          id: "loopit-private",
          spdxLicenseExpression: "LicenseRef-Loopit-Company-Private",
        }],
      },
    );
    const input = baseInput(parsed.value, artifacts);
    const directory = createWorldPackageV2({
      ...input,
      distributionPolicy: "internal-only",
      licenseDocuments: [
        ...input.licenseDocuments,
        {
          id: "loopit-private",
          spdxLicenseExpression: "LicenseRef-Loopit-Company-Private",
          path: "LICENSES/loopit-private.txt",
          text: "Loopit company-private asset license. No external redistribution.\n",
        },
      ],
      noticeText:
        `${input.noticeText}See LICENSES/loopit-private.txt.\n`,
    });

    expect(directory.receipt.manifest.legal.distributionPolicy).toBe(
      "internal-only",
    );
    expect(directory.receipt.manifest.resources).toHaveLength(
      closure.normalizedWorldIr.resources.subjectAssets.length + 1,
    );
    expect(directory.receipt.manifest.resources.filter((resource) =>
      resource.redistributionPolicy === "internal-only"
    )).toHaveLength(artifacts.length);
  }, 30_000);

  it("changes Package Root when only legal text or Host profile changes", () => {
    const baseline = createWorldPackageV2(baseInput());
    const changedLegalInput = baseInput();
    const changedLegal = createWorldPackageV2({
      ...changedLegalInput,
      licenseDocuments: changedLegalInput.licenseDocuments.map((document) => ({
        ...document,
        text: `${document.text}Additional grant.\n`,
      })),
    });
    const changedHostInput = baseInput();
    const changedHost = createWorldPackageV2({
      ...changedHostInput,
      hostCompatibility: {
        ...changedHostInput.hostCompatibility,
        profileHash: HASH_A,
      },
    });

    expect(changedLegal.receipt.worldPackageRootHash).not.toBe(
      baseline.receipt.worldPackageRootHash,
    );
    expect(changedHost.receipt.worldPackageRootHash).not.toBe(
      baseline.receipt.worldPackageRootHash,
    );
  });

  it("rejects the legal-policy matrix before returning a Receipt", () => {
    const internalArtifactInput = baseInput();
    const redistributableWithInternal = {
      ...internalArtifactInput,
      generatedResourceProvenance: {
        ...internalArtifactInput.generatedResourceProvenance,
        redistributionPolicy: "internal-only" as const,
      },
    };
    const prohibitedInput = baseInput();
    const prohibited = {
      ...prohibitedInput,
      distributionPolicy: "internal-only" as const,
      generatedResourceProvenance: {
        ...prohibitedInput.generatedResourceProvenance,
        redistributionPolicy: "prohibited" as const,
      },
    };
    const redistributableProhibitedInput = baseInput();
    const redistributableProhibited = {
      ...redistributableProhibitedInput,
      generatedResourceProvenance: {
        ...redistributableProhibitedInput.generatedResourceProvenance,
        redistributionPolicy: "prohibited" as const,
      },
    };
    const validInternalInput = baseInput();
    const validInternal = {
      ...validInternalInput,
      distributionPolicy: "internal-only" as const,
      generatedResourceProvenance: {
        ...validInternalInput.generatedResourceProvenance,
        redistributionPolicy: "internal-only" as const,
      },
    };

    for (const candidate of [
      redistributableWithInternal,
      prohibited,
      redistributableProhibited,
    ]) {
      expect(() => createWorldPackageV2(candidate)).toThrow(
        "WORLD_PACKAGE_V2_BUILD_INVALID",
      );
    }
    expect(() => createWorldPackageV2(validInternal)).not.toThrow();
  });

  it("rejects missing, unused, duplicate, and unmentioned legal documents", () => {
    const missing = { ...baseInput(), licenseDocuments: [] };
    const unusedInput = baseInput();
    const unused = {
      ...unusedInput,
      licenseDocuments: [
        ...unusedInput.licenseDocuments,
        {
          id: "unused",
          spdxLicenseExpression: "MIT",
          path: "LICENSES/unused.txt" as const,
          text: "MIT\n",
        },
      ],
      noticeText: `${unusedInput.noticeText}See LICENSES/unused.txt.\n`,
    };
    const duplicateInput = baseInput();
    const duplicate = {
      ...duplicateInput,
      licenseDocuments: [
        ...duplicateInput.licenseDocuments,
        { ...duplicateInput.licenseDocuments[0]! },
      ],
    };
    const unmentionedInput = baseInput();
    const unmentioned = {
      ...unmentionedInput,
      noticeText: "Basic World\n",
    };

    for (const candidate of [missing, unused, duplicate, unmentioned]) {
      expect(() => createWorldPackageV2(candidate)).toThrow(
        "WORLD_PACKAGE_V2_BUILD_INVALID",
      );
    }
  });

  it("rejects Subject Asset byte drift and legal provenance that misses a document", async () => {
    const authoringSpec = authoringFixture(riggedWorldDocument);
    const bytes = new Uint8Array(await readFile(new URL(
      "../../../apps/playground/public/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
      import.meta.url,
    )));
    const artifact: ResolvedWorldPackageResourceArtifactV2 = {
      resourceRef: "worldkit://subject-asset/humanoid.golden@2",
      packagePath: "resources/subject-assets/humanoid.golden.glb",
      mediaType: "model/gltf-binary",
      bytes,
      subjectAssetManifestHash: trustedClosure(authoringSpec)
        .normalizedWorldIr.resources.subjectAssets.find((asset) =>
          asset.subjectAssetRef ===
            "worldkit://subject-asset/humanoid.golden@2"
        )!.subjectAssetManifestHash as `sha256:${string}`,
      licenseDocumentId: "missing",
      licenseSpdxExpression: "LicenseRef-Project-Owned",
      redistributionPolicy: "allowed",
    };
    const missingLicense = baseInput(authoringSpec, [artifact]);
    const driftedBytes = baseInput(authoringSpec, [{
      ...artifact,
      licenseDocumentId: "project-owned",
      bytes: new Uint8Array(bytes.map((byte, index) =>
        index === 0 ? byte ^ 1 : byte
      )),
    }]);
    const forgedManifestHash = baseInput(authoringSpec, [{
      ...artifact,
      licenseDocumentId: "project-owned",
      subjectAssetManifestHash: HASH_A,
    }]);
    const forgedSpdx = baseInput(authoringSpec, [{
      ...artifact,
      licenseDocumentId: "project-owned",
      licenseSpdxExpression: "MIT",
    }]);

    for (const candidate of [
      missingLicense,
      driftedBytes,
      forgedManifestHash,
      forgedSpdx,
    ]) {
      expect(() => createWorldPackageV2(candidate)).toThrow(
        "WORLD_PACKAGE_V2_BUILD_INVALID",
      );
    }
  });

  it("rejects accessor-bearing input without invoking the getter", () => {
    const input = baseInput() as unknown as Record<string, unknown>;
    let getterInvocations = 0;
    Object.defineProperty(input, "title", {
      enumerable: true,
      get() {
        getterInvocations += 1;
        return "Basic World";
      },
    });

    expect(() => createWorldPackageV2(input as never)).toThrow(
      "WORLD_PACKAGE_V2_BUILD_INVALID",
    );
    expect(getterInvocations).toBe(0);
  });
});
