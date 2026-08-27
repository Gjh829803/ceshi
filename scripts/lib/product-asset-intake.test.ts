import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";

import { PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1 } from "../../apps/playground/src/worldkit-asset-resolver";

import {
  assertProductAssetIntakeBindingsV1,
  parseProductAssetIntakeFixtureV1,
  type ProductAssetIntakeFixtureV1,
} from "./product-asset-intake";

const G_BOT_FIXTURE_PATH = fileURLToPath(
  new URL("../../examples/product-asset-intakes/humanoid.g-bot@2.json", import.meta.url),
);

function validFixture(): ProductAssetIntakeFixtureV1 {
  return {
    schemaVersion: 1,
    kind: "product-asset-intake-fixture",
    id: "humanoid.g-bot",
    subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
    subjectAssetRef: "worldkit://subject-asset/actor.humanoid.g-bot@2",
    rigProfileRef: "worldkit://rig-profile/biped.mixamo-g-bot@2",
    animationSetRef: "worldkit://animation-set/humanoid.ground.g-bot@2",
    colliderProfileRef: "worldkit://collider-profile/humanoid.g-bot-capsule@1",
    hostPublicUri: "/subject-assets/humanoid/g-bot/v2/g-bot.glb",
    glbRepositoryPath: "apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
    productAssetManifestPath: "assets/subjects/humanoid/g-bot/asset.manifest.json",
    productActionManifestPath: "assets/subjects/humanoid/g-bot/action-manifest.json",
    authoringWorldPath: "examples/authoring/g-bot-subject-world.json",
    artifactDirectoryPath: "examples/evidence/g-bot-subject-world",
    primaryEntityId: "g-bot-primary",
    secondaryEntityId: "g-bot-secondary",
    controllerId: "controller-primary",
    requiredRuntimeActionIds: ["idle", "walk", "run", "jump"],
    minimumSubjectPoseDifferenceRatio: 0.12,
  };
}

describe("product asset intake fixture", () => {
  it("accepts the committed G Bot fixture", async () => {
    const fixture = parseProductAssetIntakeFixtureV1(
      JSON.parse(await readFile(G_BOT_FIXTURE_PATH, "utf8")) as unknown,
    );
    expect(fixture).toEqual(validFixture());
  });

  it("rejects a fixture that invents extra runtime actions", () => {
    const fixture = {
      ...validFixture(),
      requiredRuntimeActionIds: ["idle", "walk", "run", "jump", "fly"],
    };
    expect(() => parseProductAssetIntakeFixtureV1(fixture)).toThrowError(
      "PRODUCT_ASSET_INTAKE_ACTION_SET_INVALID",
    );
  });

  it("rejects repository path traversal", () => {
    const fixture = {
      ...validFixture(),
      glbRepositoryPath: "../secret/g-bot.glb",
    };
    expect(() => parseProductAssetIntakeFixtureV1(fixture)).toThrowError(
      "PRODUCT_ASSET_INTAKE_PATH_TRAVERSAL",
    );
  });

  it("rejects duplicate entity ids", () => {
    const fixture = {
      ...validFixture(),
      secondaryEntityId: "g-bot-primary",
    };
    expect(() => parseProductAssetIntakeFixtureV1(fixture)).toThrowError(
      "PRODUCT_ASSET_INTAKE_ENTITY_IDS_INVALID",
    );
  });

  it("rejects a host URI that is not a same-origin subject-asset path", () => {
    const fixture = {
      ...validFixture(),
      hostPublicUri: "https://cdn.example/g-bot.glb",
    };
    expect(() => parseProductAssetIntakeFixtureV1(fixture)).toThrowError(
      "PRODUCT_ASSET_INTAKE_HOST_URI_INVALID",
    );
  });

  it("rejects unknown fields and a Registry Ref used in the wrong role", () => {
    expect(() => parseProductAssetIntakeFixtureV1({
      ...validFixture(),
      providerHint: "babylon",
    })).toThrowError("PRODUCT_ASSET_INTAKE_FIELD_UNKNOWN");
    expect(() => parseProductAssetIntakeFixtureV1({
      ...validFixture(),
      rigProfileRef: "worldkit://subject-asset/actor.humanoid.g-bot@2",
    })).toThrowError("PRODUCT_ASSET_INTAKE_REF_INVALID");
  });

  it("rejects Fixture bindings that drift from Registry or Host ownership", () => {
    expect(() => assertProductAssetIntakeBindingsV1(validFixture(), {
      registry: builtInSubjectResourceRegistry,
      hostPublicUriBySubjectAssetRef: PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
    })).not.toThrow();
    expect(() => assertProductAssetIntakeBindingsV1({
      ...validFixture(),
      rigProfileRef: "worldkit://rig-profile/biped.golden@2",
    }, {
      registry: builtInSubjectResourceRegistry,
      hostPublicUriBySubjectAssetRef: PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
    })).toThrowError("PRODUCT_ASSET_INTAKE_REGISTRY_BINDING_MISMATCH");
    expect(() => assertProductAssetIntakeBindingsV1({
      ...validFixture(),
      hostPublicUri: "/subject-assets/humanoid/g-bot/v2/wrong.glb",
    }, {
      registry: builtInSubjectResourceRegistry,
      hostPublicUriBySubjectAssetRef: PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
    })).toThrowError("PRODUCT_ASSET_INTAKE_HOST_BINDING_MISMATCH");
  });
});
