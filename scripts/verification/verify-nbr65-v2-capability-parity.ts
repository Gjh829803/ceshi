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
  readonly sourceEvidenceRef:
    "origin/codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05";
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
  readonly evidenceRefs: readonly string[];
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
      "packages/native-babylon-block-profile/src/ground-analysis.test.ts": ["footprint", "clearance"],
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
      "packages/native-babylon-block-profile/src/ground-analysis.ts": ["requiredTraversalBands", "component"],
      "packages/native-babylon-block-profile/src/ground-analysis.test.ts": ["step"],
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
    disposition: "existing SDK movement/support owners traverse derived topology",
    owner: "runtime-babylon",
    evidence: {
      "packages/runtime-babylon/src/babylon-character-body-port.test.ts": ["slope-tangential"],
      "packages/runtime-babylon/src/babylon-character-body-port.conformance.test.ts": ["0.25m step"],
      "packages/runtime-babylon/src/babylon-character-body-port.ts": ["checkSupport"],
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
    disposition: "Runtime-owned neutral lighting and Profile-owned pastel materials",
    owner: "runtime-babylon-and-native-profile-display-adapter",
    evidence: {
      "packages/native-babylon-block-profile/src/whitebox-display.test.ts": ["walkable whitebox display"],
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
    capabilityId: "package-capture-and-evaluation",
    disposition: "Package-bound formal Capture, Collider overlay and actionable evaluation",
    owner: "world-package-runtime-capture-evaluator",
    evidence: {
      "scripts/native-scene/native-package-input.test.ts": ["freezes one exact Native Package input"],
      "packages/runtime-babylon/src/formal-world-capture-provider.test.ts": ["logical collider observation"],
      "scripts/reconstruction/evaluate-evidence-set.test.ts": ["trusted Package"],
    },
  },
] as const satisfies readonly PassedCapabilityDefinitionV1[]);

const NOT_APPLICABLE_CAPABILITIES = Object.freeze([
  {
    capabilityId: "provider-neutral-block-manifest",
    disposition: "superseded by Build-Epoch checked inventory and frozen Package identity",
    owner: "not-applicable-current-only",
    evidenceRefs: ["docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md"],
  },
  {
    capabilityId: "threejs-binding",
    disposition: "Babylon Native Module is the sole Native authoring surface",
    owner: "not-applicable-current-only",
    evidenceRefs: ["docs/decisions/0007-canonical-and-babylon-native-authoring-lanes.md"],
  },
  {
    capabilityId: "block-compiler-and-hidden-foundation",
    disposition: "superseded by Frozen Contributions, current WorldPackage and ground boundary",
    owner: "not-applicable-current-only",
    evidenceRefs: ["docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md"],
  },
  {
    capabilityId: "block-source-subject-and-camera",
    disposition: "JSON control plane and WorldRuntimeBootstrap remain authoritative",
    owner: "runtime-bootstrap-subject-camera",
    evidenceRefs: ["docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md"],
  },
  {
    capabilityId: "directed-space-transitions-and-interactions",
    disposition: "preserve Block identity; implement under the event owner",
    owner: "WRC-EVT-1",
    evidenceRefs: ["docs/18-refactor-progress-and-backlog.md"],
  },
  {
    capabilityId: "water-flight-and-hybrid-reachability",
    disposition: "ground graph is non-blocking for non-ground movement",
    owner: "movement-medium-roadmap",
    evidenceRefs: ["docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md"],
  },
  {
    capabilityId: "styled-output-generation",
    disposition: "source-locked post-whitebox visual pipeline remains separate",
    owner: "visual-pipeline",
    evidenceRefs: ["docs/22-hosted-scene-brief-and-evaluation.md"],
  },
  {
    capabilityId: "playthrough-episode-and-video",
    disposition: "downstream evidence and media, not world admission",
    owner: "recording-playthrough",
    evidenceRefs: ["docs/superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md"],
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
      "scripts/reconstruction/native-ground-analysis-diagnostics.test.ts",
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
  "spawn-target-standability": "ground-analysis-production",
  "step-adjacency-components-and-bands": "ground-analysis-production",
  "reachable-space-metrics": "ground-analysis-production",
  "continuous-walkable-and-solid-topology": "topology-display",
  "ground-movement-and-contact-correction": "runtime-ground",
  "walkable-whitebox-overlay": "topology-display",
  "chunk-addressing-batching-and-residency": "chunk-realization",
  "ground-only-edge-protection": "runtime-ground",
  "clear-day-whitebox-display": "topology-display",
  "planner-lineage-and-complete-world-continuation": "planner-skill",
  "bounded-builder-repair": "reconstruction-host",
  "package-capture-and-evaluation": "reconstruction-host",
} as const satisfies Readonly<Record<PassedCapabilityIdV1, CapabilityGateIdV1>>);

const FORBIDDEN_PATHS = Object.freeze([
  "packages/block-world",
  "packages/block-world-three",
  "packages/block-world-compiler",
] as const);

const FORBIDDEN_SOURCE_TOKENS = Object.freeze([
  "layout-block-volume",
  "materializeBabylonNativeBlockColliderCandidatesV1",
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
    const diagnostics = [];
    for (const evidenceRef of definition.evidenceRefs) {
      if (!await pathExists(path.join(repositoryRoot, evidenceRef))) {
        diagnostics.push(`missing disposition evidence: ${evidenceRef}`);
      }
    }
    rows.push(Object.freeze({
      capabilityId: definition.capabilityId,
      status: isEmpty(diagnostics) ? "not-applicable" : "failed",
      disposition: definition.disposition,
      owner: definition.owner,
      evidenceRefs: definition.evidenceRefs,
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
    sourceEvidenceRef:
      "origin/codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05",
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
