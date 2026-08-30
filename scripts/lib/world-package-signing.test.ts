import {
  normalizeAuthoringSpecV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { compileCanonicalWorldV1 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import { canonicalJsonBytes } from "@whitebox-world/protocol";
import {
  createBabylonNativeWorldPackageV1,
  createCanonicalWorldPackageV1,
  type WorldPackageDirectoryV1,
  type WorldPackageHostPolicyV1,
} from "@whitebox-world/world-package";
import { generateKeyPairSync } from "node:crypto";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import basicWorldDocument from "../../examples/authoring/basic-world.json";
import { createBabylonNativeWorldPackageTestInputV1 } from
  "@whitebox-world/world-package/testing";
import {
  signWorldPackageDirectoryV1,
  verifyWorldPackageForHostV1,
} from "./world-package-signing.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const SIGNED_AT = "2026-08-27T00:00:00.000Z";

function authoringFixture(): AuthoringSpecV4 {
  const validated = validateAuthoringSpecV4(basicWorldDocument);
  if (!validated.ok || isNil(validated.value)) {
    throw new Error("fixture AuthoringSpecV4 is invalid");
  }
  return validated.value;
}

function unsignedDirectory(): WorldPackageDirectoryV1 {
  const authoringSpec = authoringFixture();
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
    initialRelationshipStates: [],
  });
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap,
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (!compiled.ok || isNil(compiled.canonicalSceneExecutionPlan)) {
    throw new Error("fixture compilation failed");
  }
  return createCanonicalWorldPackageV1({
    packageId: `${authoringSpec.id}.package`,
    title: "Signed Basic World",
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
    authoringSpec,
    normalizedWorldIr: normalized.value,
    layoutSolveResult: {
      status: normalized.layoutSolveReport.status,
      report: normalized.layoutSolveReport,
      layoutSolveReportHash: normalized.layoutSolveReportHash,
    },
    executionPlan: compiled.canonicalSceneExecutionPlan,
    gameplayBootstrap,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
    resourceArtifacts: [],
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
    noticeText: "Signed Basic World\nSee LICENSES/project-owned.txt.\n",
    includeAuthoringSpec: true,
  });
}

function hostPolicy(
  signaturePolicy: WorldPackageHostPolicyV1["signaturePolicy"] = {
    mode: "required",
    trustDomain: "worldkit.release",
  },
): WorldPackageHostPolicyV1 {
  return {
    acceptedRuntimeTargets: ["babylon-web"],
    acceptedPackageFormatVersions: [1],
    acceptedManifestSchemaVersions: [1],
    runtimeContractVersion: 1,
    supportedFeatureIds: ["runtime.full-reload-v1"],
    trustedCompatibilityProfiles: [{
      profileRef: "worldkit://host-compatibility/babylon-web@1",
      profileHash: HASH_B,
    }],
    allowedDistributionPolicies: ["redistributable"],
    signaturePolicy,
  };
}

function replaceSignatureJson(
  directory: WorldPackageDirectoryV1,
  update: (value: Record<string, unknown>) => void,
): WorldPackageDirectoryV1 {
  const signatureFile = directory.signatureFiles[0];
  if (isNil(signatureFile)) throw new Error("fixture signature is missing");
  const value = JSON.parse(new TextDecoder().decode(signatureFile.bytes)) as
    Record<string, unknown>;
  update(value);
  return {
    ...directory,
    signatureFiles: [{ ...signatureFile, bytes: canonicalJsonBytes(value) }],
  };
}

describe("WorldPackage Ed25519 trusted Host adapter", () => {
  it("rejects a compatible unsigned package when the Host requires a signature", () => {
    expect(() => verifyWorldPackageForHostV1({
      directory: unsignedDirectory(),
      hostPolicy: hostPolicy(),
      trustedPublicKeys: [],
    })).toThrow("WORLD_PACKAGE_SIGNATURE_REQUIRED");
  });

  it("signs and verifies one exact Root without adding signature bytes to that Root", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privateKeyPem = privateKey.export({
      type: "pkcs8",
      format: "pem",
    });
    const publicKeyPem = publicKey.export({
      type: "spki",
      format: "pem",
    });
    const unsigned = unsignedDirectory();
    const signed = signWorldPackageDirectoryV1({
      directory: unsigned,
      keyId: "release-key-2026-08",
      trustDomain: "worldkit.release",
      signedAt: SIGNED_AT,
      privateKey: privateKeyPem,
    });
    const verified = verifyWorldPackageForHostV1({
      directory: signed,
      hostPolicy: hostPolicy(),
      trustedPublicKeys: [{
        keyId: "release-key-2026-08",
        trustDomain: "worldkit.release",
        publicKey: publicKeyPem,
      }],
    });

    expect(signed.receipt.worldPackageRootHash).toBe(
      unsigned.receipt.worldPackageRootHash,
    );
    expect(signed.receipt.fileIntegrityEntries).toEqual(
      unsigned.receipt.fileIntegrityEntries,
    );
    expect(signed.signatureFiles).toHaveLength(1);
    expect(signed.signatureFiles[0]?.path).toBe(
      "signatures/release-key-2026-08.json",
    );
    expect(verified.receipt.worldPackageRootHash).toBe(
      unsigned.receipt.worldPackageRootHash,
    );
  });

  it("signs and verifies the identical Native Root identity without source branching", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const input = createBabylonNativeWorldPackageTestInputV1();
    const unsigned = createBabylonNativeWorldPackageV1(input);
    const signed = signWorldPackageDirectoryV1({
      directory: unsigned,
      keyId: "native-release-key",
      trustDomain: "worldkit.release",
      signedAt: SIGNED_AT,
      privateKey,
    });
    const compatibility = input.shared.hostCompatibility;
    const verified = verifyWorldPackageForHostV1({
      directory: signed,
      hostPolicy: {
        acceptedRuntimeTargets: ["babylon-web"],
        acceptedPackageFormatVersions: [1],
        acceptedManifestSchemaVersions: [1],
        runtimeContractVersion: 1,
        supportedFeatureIds: [...compatibility.requiredFeatureIds],
        trustedCompatibilityProfiles: [{
          profileRef: compatibility.profileRef,
          profileHash: compatibility.profileHash,
        }],
        allowedDistributionPolicies: [input.shared.distributionPolicy],
        signaturePolicy: { mode: "required", trustDomain: "worldkit.release" },
      },
      trustedPublicKeys: [{
        keyId: "native-release-key",
        trustDomain: "worldkit.release",
        publicKey,
      }],
    });
    expect(verified.kind).toBe("babylon-native-scene");
    expect(signed.receipt.worldPackageRootHash).toBe(
      unsigned.receipt.worldPackageRootHash,
    );
    expect(signed.receipt.fileIntegrityEntries).toEqual(
      unsigned.receipt.fileIntegrityEntries,
    );
  });

  it("rejects unknown key identities and signatures outside the required trust domain", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signed = signWorldPackageDirectoryV1({
      directory: unsignedDirectory(),
      keyId: "release-key",
      trustDomain: "worldkit.release",
      signedAt: SIGNED_AT,
      privateKey,
    });

    for (const trustedPublicKeys of [
      [{ keyId: "another-key", trustDomain: "worldkit.release", publicKey }],
      [{ keyId: "release-key", trustDomain: "worldkit.staging", publicKey }],
    ]) {
      expect(() => verifyWorldPackageForHostV1({
        directory: signed,
        hostPolicy: hostPolicy(),
        trustedPublicKeys,
      })).toThrow("WORLD_PACKAGE_SIGNATURE_UNTRUSTED");
    }
  });

  it("distinguishes malformed Root envelopes from cryptographic tampering", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signed = signWorldPackageDirectoryV1({
      directory: unsignedDirectory(),
      keyId: "release-key",
      trustDomain: "worldkit.release",
      signedAt: SIGNED_AT,
      privateKey,
    });
    const trustedPublicKeys = [{
      keyId: "release-key",
      trustDomain: "worldkit.release",
      publicKey,
    }];
    const wrongRoot = replaceSignatureJson(signed, (value) => {
      const envelope = value.envelope as Record<string, unknown>;
      envelope.packageRootHash = HASH_C;
    });
    expect(() => verifyWorldPackageForHostV1({
      directory: wrongRoot,
      hostPolicy: hostPolicy(),
      trustedPublicKeys,
    })).toThrow("WORLD_PACKAGE_SIGNATURE_ENVELOPE_INVALID");

    const alteredSignature = replaceSignatureJson(signed, (value) => {
      const bytes = Buffer.from(value.signatureBase64 as string, "base64");
      bytes[0] = bytes[0]! ^ 0xff;
      value.signatureBase64 = bytes.toString("base64");
    });
    expect(() => verifyWorldPackageForHostV1({
      directory: alteredSignature,
      hostPolicy: hostPolicy(),
      trustedPublicKeys,
    })).toThrow("WORLD_PACKAGE_SIGNATURE_UNTRUSTED");
  });

  it("rejects non-canonical base64 and non-Ed25519 key material", () => {
    const ed25519 = generateKeyPairSync("ed25519");
    const signed = signWorldPackageDirectoryV1({
      directory: unsignedDirectory(),
      keyId: "release-key",
      trustDomain: "worldkit.release",
      signedAt: SIGNED_AT,
      privateKey: ed25519.privateKey,
    });
    const invalidBase64 = replaceSignatureJson(signed, (value) => {
      value.signatureBase64 = "***";
    });
    expect(() => verifyWorldPackageForHostV1({
      directory: invalidBase64,
      hostPolicy: hostPolicy(),
      trustedPublicKeys: [{
        keyId: "release-key",
        trustDomain: "worldkit.release",
        publicKey: ed25519.publicKey,
      }],
    })).toThrow("WORLD_PACKAGE_SIGNATURE_ENVELOPE_INVALID");

    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(() => signWorldPackageDirectoryV1({
      directory: unsignedDirectory(),
      keyId: "rsa-key",
      trustDomain: "worldkit.release",
      signedAt: SIGNED_AT,
      privateKey: rsa.privateKey,
    })).toThrow("WORLD_PACKAGE_SIGNATURE_UNTRUSTED");
    expect(() => verifyWorldPackageForHostV1({
      directory: signed,
      hostPolicy: hostPolicy(),
      trustedPublicKeys: [{
        keyId: "release-key",
        trustDomain: "worldkit.release",
        publicKey: rsa.publicKey,
      }],
    })).toThrow("WORLD_PACKAGE_SIGNATURE_UNTRUSTED");
  });
});
