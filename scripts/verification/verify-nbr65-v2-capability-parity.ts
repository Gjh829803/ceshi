import { readdir, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { isEmpty, isEqual, isNil } from "lodash-es";

export type Nbr65CapabilityParityStatusV1 =
  | "passed"
  | "failed"
  | "not-applicable";

export interface Nbr65CapabilityParityRowV1 {
  readonly capabilityId: string;
  readonly status: Nbr65CapabilityParityStatusV1;
  readonly disposition: string;
  readonly owner: string;
  readonly evidenceRefs: readonly string[];
  readonly verificationGate: Readonly<{
    readonly gateId: string;
    readonly command: readonly string[];
    readonly exitCode: number;
  }> | null;
  readonly diagnostics: readonly string[];
}

export interface Nbr65CapabilityParityReportV1 {
  readonly kind: "worldkit-nbr65-v2-capability-parity-report";
  readonly schemaVersion: 1;
  readonly outcome: "passed" | "failed";
  readonly sourceEvidenceRefs: readonly [
    "origin/codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05",
    "origin/codex/block-world-main-integration@8c250b5fc2181b48947d95b12fac03333bf11e5f",
    "origin/codex/block-world-main-integration@d69d7f821f10328bc02dac3a83218f924e754780",
  ];
  readonly rows: readonly Nbr65CapabilityParityRowV1[];
}

interface PassedCapabilityDefinitionV1 {
  readonly capabilityId: string;
  readonly disposition: string;
  readonly owner: string;
  readonly evidence: Readonly<Record<string, readonly string[]>>;
}

interface NotApplicableCapabilityDefinitionV1 {
  readonly capabilityId: string;
  readonly disposition: string;
  readonly owner: string;
  readonly evidence: Readonly<Record<string, readonly string[]>>;
}

interface Nbr65CapabilityGateDefinitionV1 {
  readonly gateId: string;
  readonly command: readonly string[];
}

export interface Nbr65CapabilityGateResultV1 {
  readonly gateId: string;
  readonly command: readonly string[];
  readonly exitCode: number;
}

export interface VerifyNbr65V2CapabilityParityOptionsV1 {
  readonly runGate?: (
    repositoryRoot: string,
    gate: Nbr65CapabilityGateDefinitionV1,
  ) => Promise<Nbr65CapabilityGateResultV1>;
}

const PASSED_CAPABILITIES = Object.freeze([
  {
    capabilityId: "metric-shapes-lattice-overlap",
    disposition: "current fixed shapes, metric lattice and overlap rejection",
    owner: "native-babylon-block-profile",
    evidence: {
      "packages/native-babylon-block-profile/src/shapes.test.ts": ["CENTER_LATTICE"],
      "packages/native-babylon-block-profile/src/session.test.ts": ["occupied cell"],
    },
  },
  {
    capabilityId: "ergonomic-block-and-grid-authoring",
    disposition: "current createBlock and createBlockGrid authoring surface",
    owner: "native-babylon-block-profile",
    evidence: {
      "packages/native-babylon-block-profile/src/session.ts": ["createBlockGrid"],
      ".codex/skills/worldkit-native-block-builder/references/native-block-output-contract.md": ["createBlockGrid"],
    },
  },
  {
    capabilityId: "palette-visual-and-collider-groups",
    disposition: "semantic palette plus explicit visual and Collider Group identities",
    owner: "native-babylon-block-profile",
    evidence: {
      "packages/native-babylon-block-profile/src/session.ts": ["colliderGroupId"],
      "packages/native-babylon-block-profile/src/logical-ground-model.test.ts": ["colliderGroupId"],
    },
  },
  {
    capabilityId: "subject-footprint-and-clearance",
    disposition: "Subject-relative footprint union and solid-volume clearance analysis",
    owner: "native-babylon-block-profile-host-analysis",
    evidence: {
      "packages/native-babylon-block-profile/src/ground-analysis.test.ts": [
        "rejects a narrow surface using full Capsule-footprint union coverage",
        "reports exact low-overhead clearance without changing the Capsule",
      ],
    },
  },
  {
    capabilityId: "source-block-center-and-shared-edge-adjacency",
    disposition: "actual source Block centers and checked shared-edge step connectivity",
    owner: "native-babylon-block-profile-host-analysis",
    evidence: {
      "packages/native-babylon-block-profile/src/ground-analysis.test.ts": [
        "ports v2 Block-center stand samples across one admitted shared-edge step",
        "does not shift a partially covered source Block center onto its exposed half",
      ],
    },
  },
  {
    capabilityId: "spawn-target-standability",
    disposition: "Spawn and required target standability diagnostics",
    owner: "native-babylon-block-profile-host-analysis",
    evidence: {
      "packages/native-babylon-block-profile/src/ground-analysis.test.ts": ["Spawn", "target"],
    },
  },
  {
    capabilityId: "step-adjacency-components-and-bands",
    disposition: "step-aware adjacency, components and bounded traversal bands",
    owner: "native-babylon-block-profile-host-analysis",
    evidence: {
      "packages/native-babylon-block-profile/src/ground-analysis.test.ts": [
        "publishes deterministic standability, connectivity, band and report metrics",
        "rejects a detour that leaves the declared traversal band",
      ],
      "scripts/reconstruction/native-world-case-preparation.test.ts": [
        "rejects ground bands that evade Spawn origin or bind non-pass targets",
      ],
    },
  },
  {
    capabilityId: "subject-bound-topology-policy",
    disposition: "Native-owned Profile/topology integrity with legacy one-meter smoothing; existing Spawn and required-route owners check actual support without a global step/slope veto",
    owner: "native-profile-production-host",
    evidence: {
      "packages/traversal/src/profile-registry.test.ts": [
        "resolves an independently identified Native Block Ground V2 profile",
      ],
      "packages/native-babylon-block-profile/src/ground-analysis.test.ts": [
        "rejects a final topology bound to a different logical Ground Model",
        "CF-04/G1 does not apply raw-height step/slope vetoes to an old automatically smoothed join",
      ],
      "scripts/reconstruction/native-ground-analysis-admission.ts": [
        "assertProductionNativeBlockGroundTopologyIntegrityV1",
        "topologyPolicyHash",
        "downward-facing triangle",
      ],
      "scripts/reconstruction/native-package.test.ts": [
        "accepts legacy one-meter smoothing and steep terrain while rejecting corrupt topology",
      ],
    },
  },
  {
    capabilityId: "reachable-space-metrics",
    disposition: "reachable bounds, distance, Chunk and off-camera report metrics",
    owner: "native-babylon-block-profile-host-analysis",
    evidence: {
      "packages/native-babylon-block-profile/src/ground-analysis.ts": ["reachableStandPositionBoundsMeters", "offCameraReachablePositionCount"],
    },
  },
  {
    capabilityId: "continuous-walkable-and-solid-topology",
    disposition: "one deterministic walkable surface and exact solid union",
    owner: "native-babylon-block-profile",
    evidence: {
      "packages/native-babylon-block-profile/src/walkable-topology.test.ts": ["continuous topology", "exact-solid-union"],
      "packages/native-babylon-block-profile/src/walkable-topology-materializer.test.ts": ["identity-bound overlays"],
    },
  },
  {
    capabilityId: "ground-movement-and-contact-correction",
    disposition: "existing SDK movement/support owners traverse derived topology without amplifying authored motion",
    owner: "runtime-babylon",
    evidence: {
      "packages/runtime-babylon/src/babylon-character-body-port.test.ts": [
        "allows bounded downward slope projection while %s",
        "allows only contact-derived uphill surface rise while an unsupported body lands",
      ],
      "packages/runtime-babylon/src/babylon-character-body-port.conformance.test.ts": [
        "climbs a 0.25m step across walk-speed ticks without remaining on the riser",
      ],
      "packages/runtime-babylon/src/babylon-character-body-port.ts": ["checkSupport"],
    },
  },
  {
    capabilityId: "continuous-native-runtime-traversal",
    disposition: "the formal Native Module, checked Block topology, WorldPackage, RuntimeHost, Havok and SDK Character preserve support uphill and downhill",
    owner: "native-profile-host-and-runtime-babylon",
    evidence: {
      "scripts/verification/native-live-collider-registry.test.ts": [
        "preserves current movement, Action and Camera contracts across one smoothed Native Block ramp",
      ],
    },
  },
  {
    capabilityId: "bounded-four-plane-contact-correction",
    disposition: "installed Babylon four-plane simplex correction is accepted only inside a provider-private 4e-4 meter bound",
    owner: "runtime-babylon",
    evidence: {
      "packages/runtime-babylon/src/babylon-character-body-port.test.ts": [
        "accepts accumulated micro-correction from Babylon's four-plane simplex",
        "rejects a provider correction receipt beyond Babylon's four-plane bound",
      ],
      "packages/runtime-babylon/src/babylon-character-body-port.ts": [
        "BABYLON_CHARACTER_CONTROLLER_MAXIMUM_ACCUMULATED_CORRECTION_METERS_V1",
      ],
    },
  },
  {
    capabilityId: "walkable-whitebox-overlay",
    disposition: "identity-bound readable walkable overlay",
    owner: "native-babylon-block-profile-display-adapter",
    evidence: {
      "packages/native-babylon-block-profile/src/profile-settlement.test.ts": ["multi-Block walkable Collider"],
      "packages/native-babylon-block-profile/src/whitebox-display.test.ts": ["walkable"],
    },
  },
  {
    capabilityId: "chunk-addressing-batching-and-residency",
    disposition: "stable Chunks, Thin Instance batches, far visibility and bounded Havok residency",
    owner: "native-profile-host-and-runtime-babylon",
    evidence: {
      "packages/native-babylon-block-profile/src/chunk-policy.test.ts": ["grid-chunk"],
      "packages/native-babylon-block-profile/src/visual-batch-materializer.test.ts": ["thin-instance"],
      "packages/runtime-babylon/src/native-collider-residency.test.ts": ["far Chunks", "seam"],
    },
  },
  {
    capabilityId: "ground-only-edge-protection",
    disposition: "Host-derived frozen ground safety boundary",
    owner: "native-profile-host-and-sdk-havok",
    evidence: {
      "packages/native-babylon-block-profile/src/ground-boundary.test.ts": ["ground-safety-boundary"],
      "packages/runtime-babylon/src/runtime.test.ts": ["ground-only Havok boundary"],
    },
  },
  {
    capabilityId: "clear-day-whitebox-display",
    disposition: "Profile-owned readable pastel Block materials",
    owner: "native-babylon-block-profile-display-adapter",
    evidence: {
      "packages/native-babylon-block-profile/src/whitebox-display.test.ts": ["walkable whitebox display"],
    },
  },
  {
    capabilityId: "neutral-runtime-inspection-lighting",
    disposition: "Runtime-owned neutral lighting when the Native Module authors no light",
    owner: "runtime-babylon",
    evidence: {
      "packages/runtime-babylon/src/runtime.test.ts": ["neutral inspection lighting"],
    },
  },
  {
    capabilityId: "planner-lineage-and-complete-world-continuation",
    disposition: "existing Planner remains the sole Scene Brief and image-lineage owner",
    owner: "worldkit-spatial-planner",
    evidence: {
      ".codex/skills/worldkit-spatial-planner/SKILL.md": ["Scene Brief", "complete-world extent"],
    },
  },
  {
    capabilityId: "bounded-builder-repair",
    disposition: "same-task self-check plus trusted Host replay and identity-changing repair",
    owner: "native-reconstruction-production-host",
    evidence: {
      "scripts/reconstruction/repair-request.ts": ["maximumRepairAttemptCount"],
      "scripts/reconstruction/run.test.ts": ["stops after the maximum repair Attempt"],
      ".codex/skills/worldkit-native-block-builder/SKILL.md": ["self-check"],
    },
  },
  {
    capabilityId: "route-course-and-semantic-pose-guidance",
    disposition: "Builder preserves route course, staircase structure and non-Subject semantic pose across reference and planning views",
    owner: "worldkit-native-block-builder",
    evidence: {
      ".codex/skills/worldkit-native-block-builder/SKILL.md": [
        "keep its endpoints, ordered bends, junctions, switchbacks, width changes, elevation changes",
        "lock its footprint center, long axis, semantic front",
      ],
      "scripts/agents/native-block-builder-skill.test.ts": [
        "preserve its lower and upper support elevations, total rise, tread rhythm, width, course, major landings",
      ],
    },
  },
  {
    capabilityId: "package-capture-and-evaluation",
    disposition: "Package-bound formal Capture, Collider overlay and actionable evaluation",
    owner: "world-package-runtime-capture-evaluator",
    evidence: {
      "scripts/native-scene/native-package-input.test.ts": ["freezes one exact Native Package input"],
      "packages/runtime-babylon/src/formal-world-capture-provider.test.ts": ["logical collider observation"],
      "scripts/reconstruction/evaluate-evidence-set.test.ts": ["trusted Package"],
    },
  },
  {
    capabilityId: "named-planning-image-builder-feedback",
    disposition: "frozen top-down and entry-composition images reach every Builder Attempt under semantic asset names",
    owner: "native-reconstruction-production-host-and-builder-skill",
    evidence: {
      "scripts/reconstruction/native-world-case-preparation.test.ts": [
        "binds an untrusted semantic proposal to Host profiles and immutable inputs",
        "entry-whitebox-target.png",
        "world-plan.png",
      ],
      "scripts/reconstruction/generation-request.test.ts": [
        "declares Planner images and uploaded references as semantically named router assets",
      ],
      ".codex/skills/worldkit-native-block-builder/SKILL.md": [
        "Inspect `inputs/world-plan.png` before choosing coordinates",
        "Inspect `inputs/entry-whitebox-target.png` before composing visual groups",
      ],
    },
  },
  {
    capabilityId: "incomplete-traversal-evidence",
    disposition: "unmeasured traversal remains explicit incomplete quality evidence rather than a Capture infrastructure exception",
    owner: "formal-capture-runtime-contract-and-evidence-projector",
    evidence: {
      "packages/runtime-babylon/src/formal-world-capture-provider.test.ts": [
        "publishes incomplete evidence when a block check cannot prove contact with its frozen face",
      ],
      "scripts/reconstruction/evaluate-evidence-set.test.ts": [
        "projects incomplete when a required checkpoint has no measured evidence",
      ],
    },
  },
  {
    capabilityId: "production-outcome-and-strict-diagnostic-split",
    disposition: "one passed and published ordinary production outcome with the strict verifier retained as a separate diagnostic receipt",
    owner: "native-reconstruction-production-host",
    evidence: {
      "scripts/reconstruction/run-production.test.ts": [
        "publishes CASE-054-shaped production success while preserving a failed strict diagnostic",
      ],
      "scripts/verification/native-block-reconstruction-e2e.test.ts": [
        "reports non-passing Evaluation as strict production diagnostics",
        "keeps the terminal #E85D5D pixel mask blocking in production integrity",
      ],
      "scripts/reconstruction/final-artifact-publisher.test.ts": [
        "atomically publishes a production-success candidate with failed strict diagnostics",
      ],
    },
  },
] as const satisfies readonly PassedCapabilityDefinitionV1[]);

const NOT_APPLICABLE_CAPABILITIES = Object.freeze([
  {
    capabilityId: "provider-neutral-block-manifest",
    disposition: "superseded by Build-Epoch checked inventory and frozen Package identity",
    owner: "not-applicable-current-only",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["provider-neutral extracted Manifest", "do not migrate"],
    },
  },
  {
    capabilityId: "threejs-binding",
    disposition: "Babylon Native Module is the sole Native authoring surface",
    owner: "not-applicable-current-only",
    evidence: {
      "docs/decisions/0007-canonical-and-babylon-native-authoring-lanes.md": ["Babylon Native"],
    },
  },
  {
    capabilityId: "block-compiler-and-hidden-foundation",
    disposition: "superseded by Frozen Contributions, current WorldPackage and ground boundary",
    owner: "not-applicable-current-only",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["Block Compiler and hidden foundation", "do not migrate"],
    },
  },
  {
    capabilityId: "block-source-subject-and-camera",
    disposition: "JSON control plane and WorldRuntimeBootstrap remain authoritative",
    owner: "runtime-bootstrap-subject-camera",
    evidence: {
      "docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md": ["WorldRuntimeBootstrapV1"],
    },
  },
  {
    capabilityId: "block-specific-support-cache-and-mesh-inference",
    disposition: "rejected because explicit Contributions and the SDK checkSupport path are the sole Collider and support authorities",
    owner: "runtime-babylon-shared-support",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["Block-specific support grace/cache", "second support state machine"],
    },
  },
  {
    capabilityId: "block-specific-subject-occlusion-fade",
    disposition: "deferred to the current Camera Domain and WRC-CAM rather than entering ground admission",
    owner: "WRC-CAM-1/2",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["Block-specific third-person Subject occlusion-fade strategy", "WRC-CAM-1/2"],
    },
  },
  {
    capabilityId: "directed-space-transitions-and-interactions",
    disposition: "preserve Block identity; implement under the event owner",
    owner: "WRC-EVT-1",
    evidence: {
      "docs/18-refactor-progress-and-backlog.md": ["WRC-EVT-1"],
    },
  },
  {
    capabilityId: "water-flight-and-hybrid-reachability",
    disposition: "current Traversal Capability Envelope is ground-only; air-Spawn measurement proves no flight or water capability",
    owner: "movement-medium-roadmap",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["cloud/water support and non-ground reachability"],
    },
  },
  {
    capabilityId: "styled-output-generation",
    disposition: "source-locked post-whitebox visual pipeline remains separate",
    owner: "visual-pipeline",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["styled opening/tri-view reconstruction", "source-locked current pipeline"],
    },
  },
  {
    capabilityId: "playthrough-episode-and-video",
    disposition: "downstream evidence and media, not world admission",
    owner: "recording-playthrough",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["planned playthrough, episode capture and video styling"],
    },
  },
  {
    capabilityId: "safe-exploration-start-and-capture-health",
    disposition: "kept under downstream Recording/Capture evidence and forbidden from hiding Spawn or ground-admission failures",
    owner: "recording-capture",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["safe exploration-start selection and Capture-health diagnostics", "do not let relocation conceal"],
    },
  },
  {
    capabilityId: "v2-one-meter-auto-smoothing",
    disposition: "superseded by the current Subject Physics Body step limit and 0.25-meter admitted route-top delta; v2's fixed one-meter policy is not Runtime-truthful for G Bot",
    owner: "runtime-bootstrap-physics-body-and-native-profile-host",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["fixed one-meter automatic smoothing", "0.25m Profile top increments"],
    },
  },
  {
    capabilityId: "v2-asymmetric-step-thresholds",
    disposition: "the current Runtime and Traversal envelope own one symmetric maxStepHeightMeters; independent v2 up/down fields are not revived",
    owner: "runtime-bootstrap-physics-body-and-traversal-envelope",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["maximumStepUpMeters", "maximumStepDownMeters", "explicit non-migration"],
    },
  },
  {
    capabilityId: "v2-adjacent-walkable-height-cap",
    disposition: "the v2 fixed two-meter invalidation is replaced by explicit components, bands, blockers and ground-boundary policy",
    owner: "native-profile-ground-analysis-and-ground-boundary",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["maximumAdjacentWalkableHeightDeltaMeters", "explicit non-migration"],
    },
  },
  {
    capabilityId: "v2-smoothed-edge-count-metric",
    disposition: "a raw smoothed-edge count is not an admission proof; current topology hash plus Package/Runtime traversal evidence supersede it",
    owner: "native-profile-topology-and-runtime-evidence",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["smoothedWalkableEdgeCount", "topology hash"],
    },
  },
  {
    capabilityId: "semantic-front-oriented-target-triview",
    disposition: "semantic front remains required reconstruction intent, while a new serialized facing field and oriented per-target Capture belong to the later NBR-70 Capture contract rather than ground admission",
    owner: "NBR-70",
    evidence: {
      "docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md": ["semantic target pose guidance", "NBR-70"],
    },
  },
] as const satisfies readonly NotApplicableCapabilityDefinitionV1[]);

const CAPABILITY_GATES = Object.freeze({
  "profile-core": Object.freeze({
    gateId: "profile-core",
    command: Object.freeze([
      "pnpm", "exec", "vitest", "run",
      "packages/native-babylon-block-profile/src/shapes.test.ts",
      "packages/native-babylon-block-profile/src/session.test.ts",
      "packages/native-babylon-block-profile/src/logical-ground-model.test.ts",
    ]),
  }),
  "ground-analysis-production": Object.freeze({
    gateId: "ground-analysis-production",
    command: Object.freeze([
      "pnpm", "exec", "vitest", "run",
      "packages/native-babylon-block-profile/src/ground-analysis.test.ts",
      "packages/traversal/src/profile-registry.test.ts",
      "scripts/reconstruction/native-ground-analysis-diagnostics.test.ts",
      "scripts/reconstruction/native-world-case-preparation.test.ts",
      "scripts/reconstruction/native-package.test.ts",
    ]),
  }),
  "topology-display": Object.freeze({
    gateId: "topology-display",
    command: Object.freeze([
      "pnpm", "exec", "vitest", "run",
      "packages/native-babylon-block-profile/src/walkable-topology.test.ts",
      "packages/native-babylon-block-profile/src/walkable-topology-materializer.test.ts",
      "packages/native-babylon-block-profile/src/profile-settlement.test.ts",
      "packages/native-babylon-block-profile/src/whitebox-display.test.ts",
    ]),
  }),
  "runtime-ground": Object.freeze({
    gateId: "runtime-ground",
    command: Object.freeze([
      "pnpm", "exec", "vitest", "run",
      "packages/runtime-babylon/src/babylon-character-body-port.test.ts",
      "packages/runtime-babylon/src/babylon-character-body-port.conformance.test.ts",
      "packages/native-babylon-block-profile/src/ground-boundary.test.ts",
      "packages/runtime-babylon/src/runtime.test.ts",
      "scripts/verification/native-live-collider-registry.test.ts",
    ]),
  }),
  "chunk-realization": Object.freeze({
    gateId: "chunk-realization",
    command: Object.freeze([
      "pnpm", "exec", "vitest", "run",
      "packages/native-babylon-block-profile/src/chunk-policy.test.ts",
      "packages/native-babylon-block-profile/src/visual-batch-materializer.test.ts",
      "packages/runtime-babylon/src/native-collider-residency.test.ts",
    ]),
  }),
  "planner-skill": Object.freeze({
    gateId: "planner-skill",
    command: Object.freeze([
      "pnpm", "exec", "vitest", "run",
      "scripts/agents/planner-skill.test.ts",
    ]),
  }),
  "reconstruction-host": Object.freeze({
    gateId: "reconstruction-host",
    command: Object.freeze([
      "pnpm", "exec", "vitest", "run",
      "scripts/agents/native-block-builder-skill.test.ts",
      "scripts/native-scene/native-package-input.test.ts",
      "packages/runtime-babylon/src/formal-world-capture-provider.test.ts",
      "scripts/reconstruction/evaluate-evidence-set.test.ts",
      "scripts/reconstruction/run.test.ts",
    ]),
  }),
  "production-loop-usability": Object.freeze({
    gateId: "production-loop-usability",
    command: Object.freeze([
      "pnpm", "exec", "vitest", "run",
      "scripts/agents/native-block-builder-skill.test.ts",
      "scripts/reconstruction/native-world-case-preparation.test.ts",
      "scripts/reconstruction/generation-request.test.ts",
      "packages/runtime-contracts/src/formal-world-capture.test.ts",
      "packages/runtime-babylon/src/formal-world-capture-provider.test.ts",
      "scripts/reconstruction/evaluate-evidence-set.test.ts",
      "scripts/reconstruction/run-production.test.ts",
      "scripts/verification/native-block-reconstruction-e2e.test.ts",
      "scripts/reconstruction/final-artifact-publisher.test.ts",
      "scripts/reconstruction/run.test.ts",
      "scripts/cli/worldkit.test.ts",
    ]),
  }),
} as const satisfies Readonly<Record<
  string,
  Nbr65CapabilityGateDefinitionV1
>>);

type PassedCapabilityIdV1 =
  (typeof PASSED_CAPABILITIES)[number]["capabilityId"];
type CapabilityGateIdV1 = keyof typeof CAPABILITY_GATES;

const CAPABILITY_GATE_ID_BY_CAPABILITY_ID = Object.freeze({
  "metric-shapes-lattice-overlap": "profile-core",
  "ergonomic-block-and-grid-authoring": "profile-core",
  "palette-visual-and-collider-groups": "profile-core",
  "subject-footprint-and-clearance": "ground-analysis-production",
  "source-block-center-and-shared-edge-adjacency": "ground-analysis-production",
  "spawn-target-standability": "ground-analysis-production",
  "step-adjacency-components-and-bands": "ground-analysis-production",
  "subject-bound-topology-policy": "ground-analysis-production",
  "reachable-space-metrics": "ground-analysis-production",
  "continuous-walkable-and-solid-topology": "topology-display",
  "ground-movement-and-contact-correction": "runtime-ground",
  "continuous-native-runtime-traversal": "runtime-ground",
  "bounded-four-plane-contact-correction": "runtime-ground",
  "walkable-whitebox-overlay": "topology-display",
  "chunk-addressing-batching-and-residency": "chunk-realization",
  "ground-only-edge-protection": "runtime-ground",
  "clear-day-whitebox-display": "topology-display",
  "neutral-runtime-inspection-lighting": "runtime-ground",
  "planner-lineage-and-complete-world-continuation": "planner-skill",
  "bounded-builder-repair": "reconstruction-host",
  "route-course-and-semantic-pose-guidance": "reconstruction-host",
  "package-capture-and-evaluation": "reconstruction-host",
  "named-planning-image-builder-feedback": "production-loop-usability",
  "incomplete-traversal-evidence": "production-loop-usability",
  "production-outcome-and-strict-diagnostic-split": "production-loop-usability",
} as const satisfies Readonly<Record<PassedCapabilityIdV1, CapabilityGateIdV1>>);

const FORBIDDEN_PATHS = Object.freeze([
  "packages/block-world",
  ["packages/block-world", "three"].join("-"),
  ["packages/block-world", "compiler"].join("-"),
] as const);

const FORBIDDEN_SOURCE_TOKENS = Object.freeze([
  "layout-block-volume",
  "materializeBabylonNativeBlockColliderCandidatesV1",
  "blockWorldSupportContinuityActive",
  "blockWorldSupportGraceTicksRemaining",
  "lastBlockWorldSupport",
] as const);

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function sourceFiles(absoluteRoot: string): Promise<readonly string[]> {
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name))) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
    const child = path.join(absoluteRoot, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(child));
    else if (entry.isFile() && [".ts", ".tsx", ".js", ".mjs", ".cjs"]
      .includes(path.extname(entry.name))) files.push(child);
  }
  return files;
}

async function runCapabilityGate(
  repositoryRoot: string,
  gate: Nbr65CapabilityGateDefinitionV1,
): Promise<Nbr65CapabilityGateResultV1> {
  const [command, ...args] = gate.command;
  if (isNil(command)) throw new Error(`NBR65_CAPABILITY_GATE_INVALID:${gate.gateId}`);
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "ignore",
    });
    child.once("error", () => resolve(-1));
    child.once("close", (code) => resolve(code ?? -1));
  });
  return Object.freeze({
    gateId: gate.gateId,
    command: gate.command,
    exitCode,
  });
}

export async function verifyNbr65V2CapabilityParityV1(
  repositoryRoot: string,
  options: VerifyNbr65V2CapabilityParityOptionsV1 = {},
): Promise<Nbr65CapabilityParityReportV1> {
  const gateRunner = options.runGate ?? runCapabilityGate;
  const gateResults = new Map<string, Nbr65CapabilityGateResultV1>();
  for (const gate of Object.values(CAPABILITY_GATES)) {
    const result = await gateRunner(repositoryRoot, gate);
    gateResults.set(gate.gateId, result);
  }
  const rows: Nbr65CapabilityParityRowV1[] = [];
  for (const definition of PASSED_CAPABILITIES) {
    const evidence = definition.evidence as Readonly<
      Record<string, readonly string[]>
    >;
    const diagnostics: string[] = [];
    const evidenceRefs = Object.keys(evidence).sort();
    for (const evidenceRef of evidenceRefs) {
      const absolutePath = path.join(repositoryRoot, evidenceRef);
      if (!await pathExists(absolutePath)) {
        diagnostics.push(`missing evidence: ${evidenceRef}`);
        continue;
      }
      const source = await readFile(absolutePath, "utf8");
      for (const fragment of evidence[evidenceRef] ?? []) {
        if (!source.includes(fragment)) {
          diagnostics.push(`missing fragment '${fragment}' in ${evidenceRef}`);
        }
      }
    }
    const gateId = CAPABILITY_GATE_ID_BY_CAPABILITY_ID[definition.capabilityId];
    const expectedGate = CAPABILITY_GATES[gateId];
    const verificationGate = gateResults.get(gateId);
    if (isNil(verificationGate)) {
      diagnostics.push(`missing verification gate result: ${gateId}`);
    } else if (
      verificationGate.gateId !== expectedGate.gateId ||
      !isEqual(verificationGate.command, expectedGate.command)
    ) {
      diagnostics.push(`verification gate identity mismatch: ${gateId}`);
    } else if (verificationGate.exitCode !== 0) {
      diagnostics.push(
        `verification gate '${gateId}' exited ${verificationGate.exitCode}`,
      );
    }
    rows.push(Object.freeze({
      capabilityId: definition.capabilityId,
      status: isEmpty(diagnostics) ? "passed" : "failed",
      disposition: definition.disposition,
      owner: definition.owner,
      evidenceRefs: Object.freeze(evidenceRefs),
      verificationGate: verificationGate ?? null,
      diagnostics: Object.freeze(diagnostics.sort()),
    }));
  }
  for (const definition of NOT_APPLICABLE_CAPABILITIES) {
    const diagnostics: string[] = [];
    const evidence = definition.evidence as Readonly<
      Record<string, readonly string[]>
    >;
    const evidenceRefs = Object.keys(evidence).sort();
    for (const evidenceRef of evidenceRefs) {
      const absolutePath = path.join(repositoryRoot, evidenceRef);
      if (!await pathExists(absolutePath)) {
        diagnostics.push(`missing disposition evidence: ${evidenceRef}`);
        continue;
      }
      const source = await readFile(absolutePath, "utf8");
      for (const fragment of evidence[evidenceRef] ?? []) {
        if (!source.includes(fragment)) {
          diagnostics.push(
            `missing disposition fragment '${fragment}' in ${evidenceRef}`,
          );
        }
      }
    }
    rows.push(Object.freeze({
      capabilityId: definition.capabilityId,
      status: isEmpty(diagnostics) ? "not-applicable" : "failed",
      disposition: definition.disposition,
      owner: definition.owner,
      evidenceRefs: Object.freeze(evidenceRefs),
      verificationGate: null,
      diagnostics: Object.freeze(diagnostics.sort()),
    }));
  }
  const cleanBreakDiagnostics: string[] = [];
  for (const forbiddenPath of FORBIDDEN_PATHS) {
    if (await pathExists(path.join(repositoryRoot, forbiddenPath))) {
      cleanBreakDiagnostics.push(`forbidden path exists: ${forbiddenPath}`);
    }
  }
  for (const scanRoot of ["packages", "scripts"] as const) {
    for (const absolutePath of await sourceFiles(path.join(repositoryRoot, scanRoot))) {
      if (absolutePath.endsWith("verify-nbr65-v2-capability-parity.ts")) continue;
      const source = await readFile(absolutePath, "utf8");
      for (const token of FORBIDDEN_SOURCE_TOKENS) {
        if (source.includes(token)) {
          cleanBreakDiagnostics.push(
            `forbidden token '${token}' in ${path.relative(repositoryRoot, absolutePath)}`,
          );
        }
      }
    }
  }
  rows.push(Object.freeze({
    capabilityId: "current-only-clean-break",
    status: isEmpty(cleanBreakDiagnostics) ? "passed" : "failed",
    disposition: "no Three package, Block Compiler, hidden per-Block proxy or compatibility materializer",
    owner: "NBR-65H",
    evidenceRefs: Object.freeze([
      "packages/native-babylon-block-profile/src/collider-contribution.ts",
      "docs/superpowers/plans/2026-09-02-native-block-walkable-surface-closure-implementation.md",
    ]),
    verificationGate: null,
    diagnostics: Object.freeze(cleanBreakDiagnostics.sort()),
  }));
  rows.sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
  return Object.freeze({
    kind: "worldkit-nbr65-v2-capability-parity-report",
    schemaVersion: 1,
    outcome: rows.some(({ status }) => status === "failed")
      ? "failed"
      : "passed",
    sourceEvidenceRefs: Object.freeze([
      "origin/codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05",
      "origin/codex/block-world-main-integration@8c250b5fc2181b48947d95b12fac03333bf11e5f",
      "origin/codex/block-world-main-integration@d69d7f821f10328bc02dac3a83218f924e754780",
    ] as const),
    rows: Object.freeze(rows),
  });
}

export async function main(): Promise<void> {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const report = await verifyNbr65V2CapabilityParityV1(repositoryRoot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.outcome === "failed") process.exitCode = 2;
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
