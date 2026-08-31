import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, sortBy, uniq } from "lodash-es";

import {
  parseRepositoryRelativePathV1,
  type WorkspaceBoundaryEvidenceV1,
} from "../lib/workspace-boundary-contract";
import {
  parseProjectHealthGatePlanV1,
  type ProjectHealthCapabilitySelectorV1,
  type ProjectHealthGatePlanV1,
  type ProjectHealthModeV1,
  type ProjectHealthProfileV1,
} from "./contracts";
import { parseProjectHealthExecutionDescriptorV1 } from "./process-runner";

export function createChangeImpactDiffDescriptorV1(input: {
  readonly baseSha: string;
  readonly headSha: string;
}) {
  if (!/^[a-f0-9]{40}$/.test(input.baseSha) || !/^[a-f0-9]{40}$/.test(input.headSha)) {
    throw new TypeError("Change-impact diff requires exact 40-character commit SHAs.");
  }
  return parseProjectHealthExecutionDescriptorV1({
    kind: "project-health-execution-descriptor",
    schemaVersion: 1,
    id: "change-impact-diff",
    executionScope: "in-place-checkout",
    descendantOwnershipMode: "inherit-owner-token",
    argv: ["git", "diff", "--name-only", "--diff-filter=ACMR", "--no-renames", input.baseSha, input.headSha],
    allowedEnvironmentVariableNames: ["HOME", "PATH", "TMPDIR"],
    implementationHash: sha256CanonicalJson({
      id: "change-impact-diff",
      argvPrefix: ["git", "diff", "--name-only", "--diff-filter=ACMR", "--no-renames"],
    }),
    workingDirectory: ".",
    timeoutMilliseconds: 30_000,
    maximumOutputBytes: 1_048_576,
  });
}

export interface ChangeImpactResultV1 {
  readonly plan: ProjectHealthGatePlanV1;
  readonly unregisteredPaths: readonly string[];
  readonly matchedCapabilityIdsByPath: Readonly<Record<string, readonly string[]>>;
}

function capabilityReasonCode(capabilityId: string): string {
  return capabilityId.replace(/-/g, "_").toUpperCase();
}

function owningPackageId(
  evidence: WorkspaceBoundaryEvidenceV1,
  filePath: string,
): string | null {
  const matches = evidence.graph.packages.filter((entry) =>
    entry.rootPath === "." || filePath === entry.rootPath || filePath.startsWith(`${entry.rootPath}/`),
  );
  if (isEmpty(matches)) return null;
  return sortBy(matches, (entry) => -entry.rootPath.length)[0]?.id ?? null;
}

function pathMatchesSelector(
  filePath: string,
  selector: ProjectHealthCapabilitySelectorV1,
  packageId: string | null,
): boolean {
  if (selector.exactPaths.includes(filePath)) return true;
  if (selector.pathPrefixes.some((prefix) =>
    filePath === prefix || filePath.startsWith(`${prefix}/`),
  )) return true;
  if (selector.pathSuffixes.some((suffix) => filePath.endsWith(suffix))) return true;
  return !isNil(packageId) && selector.packageIds.includes(packageId);
}

function reverseDependentPackageIds(
  evidence: WorkspaceBoundaryEvidenceV1,
  seedPackageIds: readonly string[],
): readonly string[] {
  const dependents = new Set<string>();
  const queue = [...seedPackageIds];
  while (!isEmpty(queue)) {
    const current = queue.pop();
    if (isNil(current)) continue;
    for (const edge of evidence.graph.edges) {
      if (edge.targetPackageId !== current || dependents.has(edge.importerPackageId)) continue;
      dependents.add(edge.importerPackageId);
      queue.push(edge.importerPackageId);
    }
  }
  return [...dependents];
}

function requiredGateUnion(
  profile: ProjectHealthProfileV1,
  mode: ProjectHealthModeV1,
): ReadonlySet<string> {
  return new Set(Object.values(profile.modesById[mode].requiredGateIdsBySensorId).flat());
}

export function planChangeImpactV1(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly mode: ProjectHealthModeV1;
  readonly commitSha: string;
  readonly baseSha: string | null;
  readonly changedPaths: readonly string[];
  readonly evidence: WorkspaceBoundaryEvidenceV1;
  readonly inputFingerprintsByGateId: Readonly<Record<string, string>>;
}): ChangeImpactResultV1 {
  const changedPaths = sortBy(uniq(input.changedPaths.map((entry) => parseRepositoryRelativePathV1(entry, false))));
  const publicSourcePaths = new Set(input.evidence.publicSymbols.map((entry) => entry.sourcePath));
  const matchedCapabilityIdsByPath: Record<string, string[]> = {};
  const unregisteredPaths: string[] = [];
  const reasonsByGateId = new Map<string, string[]>();

  const hitCapability = (
    gateId: string,
    reason: string,
  ): void => {
    reasonsByGateId.set(gateId, uniq([...(reasonsByGateId.get(gateId) ?? []), reason]));
  };

  for (const filePath of changedPaths) {
    const packageId = owningPackageId(input.evidence, filePath);
    const matched: string[] = [];
    for (const [capabilityId, selector] of Object.entries(input.profile.capabilitySelectorsById)) {
      if (!pathMatchesSelector(filePath, selector, packageId)) continue;
      matched.push(capabilityId);
      for (const gateId of input.profile.capabilityGateIdsById[capabilityId] ?? []) {
        hitCapability(gateId, capabilityReasonCode(capabilityId));
      }
    }
    matchedCapabilityIdsByPath[filePath] = sortBy(matched);
    if (isEmpty(matched)) unregisteredPaths.push(filePath);
  }

  const publicChangedPackageIds = uniq(changedPaths.flatMap((filePath) => {
    if (!publicSourcePaths.has(filePath) && !filePath.endsWith("/package.json") && filePath !== "package.json") {
      return [];
    }
    const packageId = owningPackageId(input.evidence, filePath);
    return isNil(packageId) ? [] : [packageId];
  }));
  const reversePackageIds = reverseDependentPackageIds(input.evidence, publicChangedPackageIds);
  for (const [capabilityId, selector] of Object.entries(input.profile.capabilitySelectorsById)) {
    if (isEmpty(selector.packageIds)) continue;
    const hit = selector.packageIds.some((packageId) => reversePackageIds.includes(packageId));
    if (!hit) continue;
    for (const gateId of input.profile.capabilityGateIdsById[capabilityId] ?? []) {
      hitCapability(gateId, "REVERSE_WORKSPACE_DEPENDENCY");
    }
  }

  const affectedGateIds = sortBy([...reasonsByGateId.keys()]);
  for (const gateId of affectedGateIds) {
    if (isNil(input.inputFingerprintsByGateId[gateId])) {
      throw new TypeError(`Gate ${gateId} has no Host input fingerprint.`);
    }
  }
  const requiredUnion = requiredGateUnion(input.profile, input.mode);
  const requiredGateIds = affectedGateIds.filter((gateId) => requiredUnion.has(gateId));
  const advisoryGateIds = affectedGateIds.filter((gateId) => !requiredUnion.has(gateId));
  const plan = parseProjectHealthGatePlanV1({
    kind: "project-health-gate-plan",
    schemaVersion: 1,
    commitSha: input.commitSha,
    baseSha: input.baseSha,
    requiredGateIds,
    advisoryGateIds,
    reasonsByGateId: Object.fromEntries(affectedGateIds.map((gateId) => [
      gateId,
      sortBy(reasonsByGateId.get(gateId) ?? []),
    ])),
    inputFingerprintsByGateId: Object.fromEntries(affectedGateIds.map((gateId) => [
      gateId,
      input.inputFingerprintsByGateId[gateId],
    ])),
  });
  return {
    plan,
    unregisteredPaths: sortBy(unregisteredPaths),
    matchedCapabilityIdsByPath,
  };
}
