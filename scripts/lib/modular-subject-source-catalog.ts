import type {
  ModularSubjectActionDefinitionV1,
  ModularSubjectPackageDefinitionV1,
} from "./modular-subject-source";

type ActionRow = readonly [
  actionId: string,
  sourceClipName: string,
  loopMode: "repeat" | "once",
  blendDurationSeconds: number,
];

function freezeActions(rows: readonly ActionRow[]): readonly ModularSubjectActionDefinitionV1[] {
  return Object.freeze(rows.map(([
    actionId,
    sourceClipName,
    loopMode,
    blendDurationSeconds,
  ]) => Object.freeze({
    actionId,
    sourceClipName,
    loopMode,
    playbackSpeedRatio: 1,
    blendDurationSeconds,
    rootMotionMode: "in-place" as const,
  })));
}

function freezeDefinition(
  definition: ModularSubjectPackageDefinitionV1,
): ModularSubjectPackageDefinitionV1 {
  const spatialReview = definition.spatialReview.spatialReviewStatus === "verified"
    ? Object.freeze({
        spatialReviewStatus: "verified" as const,
        evidence: Object.freeze({ ...definition.spatialReview.evidence }),
      })
    : Object.freeze({
        spatialReviewStatus: "needs-visual-review" as const,
        evidence: Object.freeze({ ...definition.spatialReview.evidence }),
      });
  return Object.freeze({
    ...definition,
    spatialConvention: Object.freeze({ ...definition.spatialConvention }),
    spatialReview,
    actions: Object.freeze([...definition.actions]),
  });
}

export const G_BOT_MODULAR_SUBJECT_SOURCE_PACKAGE = freezeDefinition({
  id: "g-bot",
  version: 1,
  creatorId: "seedleap",
  displayName: "G Bot Golden",
  sourceGlbRelativePath:
    "apps/playground/public/subject-assets/humanoid/g-bot/v1/g-bot.glb",
  expectedSourceContentHash:
    "sha256:41833210e735788da0777fc37badcec03f90ccf17ab5a7d89103f0727abeeb1b",
  rigProfileRef: "worldkit://rig-profile/biped.mixamo-g-bot@1",
  provenanceMode: "derived-recovery",
  spatialConvention: {
    units: "meters",
    upAxis: "+Y",
    forwardAxis: "-Z",
    pivot: "support-center",
  },
  spatialReview: {
    spatialReviewStatus: "needs-visual-review",
    evidence: {
      kind: "product-sidecar-declaration",
      evidenceRef: "assets/subjects/humanoid/g-bot/asset.manifest.json",
    },
  },
  actions: freezeActions([
    ["dance.rumba", "dance.rumba", "repeat", 0.2],
    ["emote.angry", "emote.angry", "once", 0.15],
    ["emote.salute", "emote.salute", "once", 0.15],
    ["fall", "fall", "repeat", 0.12],
    ["fight.enter", "fight.enter", "once", 0.12],
    ["float", "float", "repeat", 0.2],
    ["fly", "fly", "repeat", 0.18],
    ["idle", "idle", "repeat", 0.2],
    ["idle.gaming", "idle.gaming", "repeat", 0.2],
    ["jump", "jump", "once", 0.1],
    ["land.hard", "land.hard", "once", 0.08],
    ["land.hard.alt", "land.hard.alt", "once", 0.08],
    ["lay.idle", "lay.idle", "repeat", 0.2],
    ["roll.toRun", "roll.toRun", "once", 0.08],
    ["run", "run", "repeat", 0.12],
    ["sit", "sit", "once", 0.2],
    ["sit.ground.idle", "sit.ground.idle", "repeat", 0.2],
    ["sit.idle", "sit.idle", "repeat", 0.2],
    ["sit.toStand", "sit.toStand", "once", 0.15],
    ["stand", "stand", "once", 0.18],
    ["swim.exit", "swim.exit", "once", 0.15],
    ["swim.surface", "swim.surface", "repeat", 0.18],
    ["swim.tread", "swim.tread", "repeat", 0.2],
    ["walk", "walk", "repeat", 0.15],
    ["walk.step", "walk.step", "once", 0.12],
  ]),
});

export const GOLDEN_MODULAR_SUBJECT_SOURCE_PACKAGE = freezeDefinition({
  id: "golden-humanoid",
  version: 1,
  creatorId: "seedleap",
  displayName: "Golden Humanoid",
  sourceGlbRelativePath: "apps/playground/public/worldkit-assets/golden-humanoid.glb",
  expectedSourceContentHash:
    "sha256:1095fd65c754d53e6db3757ab5e1c9e5e9dcea2581f85d40f37ea4890ee8c2c2",
  rigProfileRef: "worldkit://rig-profile/biped.golden@1",
  provenanceMode: "generated-fixture",
  spatialConvention: {
    units: "meters",
    upAxis: "+Y",
    forwardAxis: "-Z",
    pivot: "support-center",
  },
  spatialReview: {
    spatialReviewStatus: "verified",
    evidence: {
      kind: "generated-fixture-contract",
      evidenceRef: "scripts/fixtures/generate-golden-humanoid-glb.ts",
    },
  },
  actions: freezeActions([
    ["idle", "idle", "repeat", 0.2],
    ["jump", "jump", "once", 0.1],
    ["run", "run", "repeat", 0.15],
    ["walk", "walk", "repeat", 0.2],
  ]),
});

export const MODULAR_SUBJECT_SOURCE_PACKAGE_CATALOG = Object.freeze([
  G_BOT_MODULAR_SUBJECT_SOURCE_PACKAGE,
  GOLDEN_MODULAR_SUBJECT_SOURCE_PACKAGE,
]) satisfies readonly ModularSubjectPackageDefinitionV1[];
