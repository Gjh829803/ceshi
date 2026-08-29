import {
  worldPackageRefFromRootHashV1,
  worldPackageRootHashFromRefV1,
  type WorldPackageRefV1,
} from "@whitebox-world/world-identity";

import { isNil } from "lodash-es";

import type {
  CreateWorldPackageV1Input,
  WorldPackageBuildContextV1,
} from "./package-build.js";
import {
  assertWorldPackageStoreRefMatchesDirectoryV1,
  canonicalWorldPackageDirectoryForStoreV1,
  equalWorldPackageDirectoryBytesV1,
  type WorldPackageStorePutResultV1,
  type WorldPackageStoreV1,
} from "./store.js";
import { verifyWorldPackageDirectoryV1 } from "./package-directory.js";
import type { WorldPackageDistributionPolicyV1 } from "./package-types.js";
import { BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1 } from "./babylon-web-host-profile.js";

export type WorldPackageFixtureContextV1 = Pick<
  CreateWorldPackageV1Input,
  | "packageId"
  | "title"
  | "sdkVersion"
  | "distributionPolicy"
  | "canonicalAuthoringSchemaHash"
  | "aiSchemaProjectionProfile"
  | "hostCompatibility"
  | "generatedResourceProvenance"
  | "licenseDocuments"
  | "noticeText"
  | "includeAuthoringSpec"
>;

export function createWorldPackageFixtureContextV1(input: {
  readonly packageId: string;
  readonly title?: string;
  readonly distributionPolicy?: WorldPackageDistributionPolicyV1;
}): WorldPackageFixtureContextV1 {
  const title = isNil(input.title) ? "WorldPackage Test Fixture" : input.title;
  const distributionPolicy = isNil(input.distributionPolicy)
    ? "redistributable"
    : input.distributionPolicy;
  const provenancePolicy = distributionPolicy === "redistributable"
    ? "allowed"
    : "internal-only";
  return {
    packageId: input.packageId,
    title,
    sdkVersion: "0.0.0",
    distributionPolicy,
    canonicalAuthoringSchemaHash: `sha256:${"a".repeat(64)}`,
    aiSchemaProjectionProfile: {
      resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
      contentHash: `sha256:${"b".repeat(64)}`,
    },
    hostCompatibility: BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
    generatedResourceProvenance: {
      licenseDocumentId: "project-owned",
      licenseSpdxExpression: "LicenseRef-Project-Owned",
      redistributionPolicy: provenancePolicy,
      author: "Agent Whitebox World SDK Test Fixture",
    },
    licenseDocuments: [{
      id: "project-owned",
      spdxLicenseExpression: "LicenseRef-Project-Owned",
      path: "LICENSES/project-owned.txt",
      text: distributionPolicy === "redistributable"
        ? "Project-owned test fixture. Redistribution allowed.\n"
        : "Project-owned test fixture. Internal use only.\n",
    }],
    noticeText: `${title}\nSee LICENSES/project-owned.txt.\n`,
    includeAuthoringSpec: true,
  };
}

export function createWorldPackageBuildContextFixtureV1(input: {
  readonly title?: string;
  readonly distributionPolicy?: WorldPackageDistributionPolicyV1;
} = {}): WorldPackageBuildContextV1 {
  const { packageId: _packageId, ...context } = createWorldPackageFixtureContextV1({
    packageId: "test-fixture.package",
    ...input,
  });
  return context;
}

class InMemoryWorldPackageStoreV1 implements WorldPackageStoreV1 {
  public readonly brand = "WorldPackageStoreV1" as const;
  readonly #directoriesByRef = new Map<WorldPackageRefV1, ReturnType<
    typeof canonicalWorldPackageDirectoryForStoreV1
  >>();

  async put(
    directoryValue: Parameters<WorldPackageStoreV1["put"]>[0],
  ): Promise<WorldPackageStorePutResultV1> {
    const directory = canonicalWorldPackageDirectoryForStoreV1(directoryValue);
    const worldPackageRef = worldPackageRefFromRootHashV1(
      directory.receipt.worldPackageRootHash,
    );
    const existing = this.#directoriesByRef.get(worldPackageRef);
    if (!isNil(existing) && !equalWorldPackageDirectoryBytesV1(existing, directory)) {
      throw new Error(
        "WORLD_PACKAGE_STORE_CONFLICT: one Package Root maps to different directory bytes",
      );
    }
    if (isNil(existing)) this.#directoriesByRef.set(worldPackageRef, directory);
    return Object.freeze({ worldPackageRef, receipt: directory.receipt });
  }

  async get(worldPackageRef: WorldPackageRefV1) {
    worldPackageRootHashFromRefV1(worldPackageRef);
    const directory = this.#directoriesByRef.get(worldPackageRef);
    if (isNil(directory)) return undefined;
    assertWorldPackageStoreRefMatchesDirectoryV1(worldPackageRef, directory);
    return verifyWorldPackageDirectoryV1(directory);
  }
}

export function createInMemoryWorldPackageStoreV1(): WorldPackageStoreV1 {
  return new InMemoryWorldPackageStoreV1();
}
