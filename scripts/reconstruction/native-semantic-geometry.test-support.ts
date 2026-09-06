import type { BabylonNativeBlockCreateInputV1 } from "@whitebox-world/native-babylon-block-profile";
import {
  SCENE_SOURCE,
  type createNativeBlockPackageAttemptFixtureV1,
} from "./native-package.test-support.js";

// Test-only inputs for the existing no-model Package -> formal capture lane.
// Usage: createNativeBlockPackageAttemptFixtureV1(fixture.options), then use the
// normal Package/capture owners. No alternate Camera, Runtime route or gate.
export const NATIVE_SEMANTIC_GEOMETRY_TARGET_REF_V1 =
  "worldkit://acceptance-target/gate-mass@1" as const;

const gateLine = '    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });';

function block(
  id: string,
  centerMetersXYZ: readonly [number, number, number],
  hasIdentity = true,
): BabylonNativeBlockCreateInputV1 {
  return {
    id, shape: "full", paletteRole: "structure", centerMetersXYZ,
    ...(hasIdentity ? { visualGroupId: "gate-mass-group" } : {}),
  };
}

// Stable ids encode integer array indices, never fractional meter coordinates.
const solidWall = [3, 4, 5].flatMap((x) => [0.5, 1.5, 2.5].map((y, yIndex) =>
  block(x === 3 && yIndex === 0 ? "gate" : `wall-${x}-${yIndex}`, [x, y, 10])
));

// The unchanged mountain/Ground provide the other extrema. This fixed ungrouped
// column makes every variant's checked-layout bounds [-4.5,-1,0.5]..[8.5,5,18.5].
// It is away from the gate in all three views; the ordinary worldBoundsPolicy
// therefore derives identical side/top Camera inputs for every comparison pair.
const boundsColumn = [-0.5, 0.5, 1.5, 2.5, 3.5, 4.5].map((y, yIndex) =>
  block(`bounds-column-${yIndex}`, [8, y, 2], false)
);

function occluderColumns(xs: readonly number[]) {
  return xs.flatMap((x) => [-0.5, 0.5, 1.5, 2.5, 3.5].map((y, yIndex) =>
    block(`occluder-${x}-${yIndex}`, [x, y, 12], false)
  ));
}

function fixture(targetAndOccluderBlocks: readonly BabylonNativeBlockCreateInputV1[]) {
  const blocks = [...targetAndOccluderBlocks, ...boundsColumn];
  if (!SCENE_SOURCE.includes(gateLine)) {
    throw new Error("Native semantic fixture requires the current base gate declaration");
  }
  const sceneSource = SCENE_SOURCE
    .replace(gateLine, blocks.map((input) => `    session.createBlock(${JSON.stringify(input)});`).join("\n"))
    .replace("maximumBlockCount: 64", "maximumBlockCount: 128");
  const options = {
    sceneSource,
    maximumBlockCount: 128,
    withoutScriptedTraversal: true,
    worldBoundsPolicy: { mode: "checked-block-layout" },
    groundExploration: {
      mode: "source-authored",
      requiredTargets: [
        { id: "middle", region: "middle", standPositionMetersXYZ: [0, 0, 10] },
        { id: "remote", region: "remote", standPositionMetersXYZ: [0, 0, 3] },
      ],
      requiredTraversalBands: [{
        id: "entry-middle", halfWidthMeters: 1, isBidirectional: true,
        centerlineStandPositionsMetersXYZ: [[0, 0, 18], [0, 0, 10]],
      }],
    },
  } as const satisfies NonNullable<Parameters<typeof createNativeBlockPackageAttemptFixtureV1>[0]>;
  return { blocks, options };
}

export const NATIVE_SEMANTIC_GEOMETRY_FIXTURES_V1 = {
  "solid-wall": fixture(solidWall),
  "hollow-wall": fixture(solidWall.filter(({ centerMetersXYZ: [x, y] }) => x !== 4 || y !== 1.5)),
  "fully-occluded-wall": fixture([...solidWall, ...occluderColumns([2, 3, 4, 5, 6])]),
  "partly-occluded-wall": fixture([...solidWall, ...occluderColumns([2, 3])]),
  "separated-columns": fixture(solidWall.filter(({ centerMetersXYZ: [x] }) => x !== 4)),
  // Keep rear depth below the near-eye-level seam between the front wall's
  // upper rows. The old Runtime scale 0.985 leaves a real gap there: a second
  // rear row at y=1.5 leaks a pixel rather than being fully occluded. The lower
  // row still adds independently visible +X/+Y depth, without changing any
  // Capture threshold, display scale, front-wall Blocks or Collider intent.
  "rear-depth-wall": fixture([...solidWall, ...[7, 8, 9].map((z) =>
    block(`rear-${z}-0`, [4, 0.5, z])
  )]),
} as const;

// Expected target-only binary pixel relations, NOT already-observed evidence.
// The Browser lane must extract exact #AA0003 pixels for the fixed target ref,
// pair identical view dimensions/Camera inputs, and verify these on actual GPU.
// "same-mask" means equality of every target occupancy bit, never beauty PNG
// equality or merely matching AABBs. "fewer-pixels-same-bounds" must compare
// measured 2D mask bounds too; "two-components" uses 4-connected target pixels.
// No expectation here upgrades ordinary production success requirements.
export const NATIVE_SEMANTIC_GEOMETRY_PIXEL_CLAIMS_V1 = [
  { fixtureId: "hollow-wall", baselineFixtureId: "solid-wall", viewId: "opening", relation: "fewer-pixels-same-bounds" },
  { fixtureId: "fully-occluded-wall", baselineFixtureId: "solid-wall", viewId: "opening", relation: "zero-pixels" },
  { fixtureId: "partly-occluded-wall", baselineFixtureId: "solid-wall", viewId: "opening", relation: "fewer-positive-pixels" },
  { fixtureId: "separated-columns", baselineFixtureId: "solid-wall", viewId: "opening", relation: "two-components" },
  { fixtureId: "rear-depth-wall", baselineFixtureId: "solid-wall", viewId: "opening", relation: "same-mask" },
  { fixtureId: "rear-depth-wall", baselineFixtureId: "solid-wall", viewId: "world-side", relation: "more-pixels" },
  { fixtureId: "rear-depth-wall", baselineFixtureId: "solid-wall", viewId: "world-top-down", relation: "more-pixels" },
] as const;
